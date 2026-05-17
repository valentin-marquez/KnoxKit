//! Pure SteamCMD stdout line parser.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `parser::Event` and `parser::parse_line`.
//!
//! This module is **pure**: no IO, no async. It turns a single raw SteamCMD
//! stdout line into an optional [`Event`]. Unrecognized lines yield `None`.
//!
//! `parser::Event` is DISTINCT from `events::Event` (the app/IPC event);
//! the worker maps one onto the other.

use std::path::PathBuf;

/// A semantically meaningful event extracted from one SteamCMD output line.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Event {
    /// Login completed successfully.
    LoginOk,
    /// Login failed; carries the reported reason.
    LoginFailed {
        /// Human-readable failure reason.
        reason: String,
    },
    /// A workshop item download has started.
    DownloadStarted {
        /// Steam workshop id.
        workshop_id: u64,
    },
    /// Progress update for an in-flight download (0..=100).
    DownloadProgress {
        /// Steam workshop id.
        workshop_id: u64,
        /// Rounded percent complete.
        percent: u8,
    },
    /// A workshop item finished downloading successfully.
    DownloadSuccess {
        /// Steam workshop id.
        workshop_id: u64,
        /// Destination path on disk.
        path: PathBuf,
    },
    /// A workshop item download failed.
    DownloadFailed {
        /// Steam workshop id.
        workshop_id: u64,
        /// Reported error text.
        error: String,
    },
    /// The Steam client is loaded and ready to accept commands.
    Ready,
    /// The client is shutting down.
    Quit,
}

/// Parse a single raw SteamCMD stdout line into an [`Event`], if recognized.
///
/// Returns `None` for blank lines, banners, and any noise we don't model.
pub fn parse_line(line: &str) -> Option<Event> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // --- Quit / shutdown -------------------------------------------------
    if trimmed.eq_ignore_ascii_case("Steam>quit")
        || trimmed.eq_ignore_ascii_case("quit")
        || trimmed.starts_with("Steam>quit")
    {
        return Some(Event::Quit);
    }

    // --- Login failure (check before generic OK matching) ----------------
    if let Some(idx) = trimmed.find("FAILED login with result code") {
        let reason = trimmed[idx + "FAILED login with result code".len()..]
            .trim()
            .to_string();
        return Some(Event::LoginFailed {
            reason: if reason.is_empty() {
                "unknown".to_string()
            } else {
                reason
            },
        });
    }

    // --- Login success ---------------------------------------------------
    if trimmed == "Logged in OK" || trimmed.starts_with("Logged in OK") {
        return Some(Event::LoginOk);
    }

    // --- Ready -----------------------------------------------------------
    if trimmed.starts_with("Loading Steam API...OK") || trimmed.contains("type 'quit' to exit") {
        return Some(Event::Ready);
    }

    // --- Download success ------------------------------------------------
    // `Success. Downloaded item 2392709985 to "C:\path" (12345 bytes)`
    if let Some(rest) = trimmed.strip_prefix("Success. Downloaded item ") {
        let mut parts = rest.splitn(2, " to ");
        let id_str = parts.next().unwrap_or("").trim();
        if let Ok(workshop_id) = id_str.parse::<u64>() {
            let path = parts
                .next()
                .and_then(|p| {
                    let p = p.trim();
                    // strip the surrounding quotes and anything trailing.
                    let start = p.find('"')? + 1;
                    let end = p[start..].find('"')? + start;
                    Some(p[start..end].to_string())
                })
                .unwrap_or_default();
            return Some(Event::DownloadSuccess {
                workshop_id,
                path: PathBuf::from(path),
            });
        }
        return None;
    }

    // --- Download failure ------------------------------------------------
    // `ERROR! Download item 2392709985 failed (Failure).`
    if let Some(rest) = trimmed.strip_prefix("ERROR! Download item ") {
        let mut parts = rest.splitn(2, " failed");
        let id_str = parts.next().unwrap_or("").trim();
        if let Ok(workshop_id) = id_str.parse::<u64>() {
            let error = parts
                .next()
                .map(|e| e.trim().trim_matches(|c| c == '(' || c == ')' || c == '.'))
                .unwrap_or("Failure")
                .to_string();
            return Some(Event::DownloadFailed {
                workshop_id,
                error: if error.is_empty() {
                    "Failure".to_string()
                } else {
                    error
                },
            });
        }
        return None;
    }

    // --- Download started ------------------------------------------------
    // `Downloading item 2392709985 ...`
    if let Some(rest) = trimmed.strip_prefix("Downloading item ") {
        let id_str = rest.split_whitespace().next().unwrap_or("");
        if let Ok(workshop_id) = id_str.parse::<u64>() {
            return Some(Event::DownloadStarted { workshop_id });
        }
        return None;
    }

    // --- Download progress -----------------------------------------------
    // `Update state (0x61) downloading, progress: 42.13 (4213000 / 10000000)`
    if trimmed.contains("Update state") && trimmed.contains("downloading") {
        if let Some(pidx) = trimmed.find("progress:") {
            let after = trimmed[pidx + "progress:".len()..].trim();
            let pct_str = after.split_whitespace().next().unwrap_or("");
            if let Ok(pct) = pct_str.parse::<f64>() {
                let percent = pct.round().clamp(0.0, 100.0) as u8;
                // The state line itself carries no workshop id; the worker
                // tracks the in-flight id. Use a sentinel of 0 here — the
                // worker overwrites it with the active download's id.
                return Some(Event::DownloadProgress {
                    workshop_id: 0,
                    percent,
                });
            }
        }
        return None;
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    /// Parse every line of a fixture file, dropping `None`s.
    fn parse_fixture(name: &str) -> Vec<Event> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("parser_fixtures")
            .join(name);
        let raw = std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("read fixture {}: {e}", path.display()));
        raw.lines().filter_map(parse_line).collect()
    }

    #[test]
    fn parses_download_success_sequence() {
        let events = parse_fixture("download_success.txt");
        assert_eq!(
            events,
            vec![
                Event::Ready,
                Event::Ready,
                Event::LoginOk,
                Event::DownloadStarted {
                    workshop_id: 2392709985
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 12
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 42
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 88
                },
                Event::DownloadSuccess {
                    workshop_id: 2392709985,
                    path: PathBuf::from(
                        "C:\\steamcmd\\steamapps\\workshop\\content\\108600\\2392709985"
                    )
                },
                Event::Quit,
            ]
        );
    }

    #[test]
    fn parses_download_failure() {
        let events = parse_fixture("download_failed_private.txt");
        assert_eq!(
            events,
            vec![
                // `-- type 'quit' to exit --` and `Loading Steam API...OK`
                // each map to Ready.
                Event::Ready,
                Event::Ready,
                Event::LoginOk,
                Event::DownloadStarted {
                    workshop_id: 999999999
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 3
                },
                Event::DownloadFailed {
                    workshop_id: 999999999,
                    error: "Failure".to_string()
                },
                Event::Quit,
            ]
        );
    }

    #[test]
    fn parses_login_retry() {
        let events = parse_fixture("login_retry.txt");
        assert_eq!(
            events,
            vec![
                Event::Ready,
                Event::Ready,
                Event::LoginFailed {
                    reason: "Rate Limit Exceeded".to_string()
                },
                Event::LoginOk,
                Event::Quit,
            ]
        );
    }

    #[test]
    fn malformed_lines_yield_no_events() {
        let events = parse_fixture("malformed.txt");
        assert_eq!(events, Vec::<Event>::new());
    }

    #[test]
    fn rounds_progress_percent() {
        let e = parse_line(" Update state (0x61) downloading, progress: 42.71 (1 / 2)");
        assert_eq!(
            e,
            Some(Event::DownloadProgress {
                workshop_id: 0,
                percent: 43
            })
        );
    }

    #[test]
    fn ready_on_quit_banner() {
        assert_eq!(
            parse_line("Steam Console Client (c) Valve - type 'quit' to exit --"),
            Some(Event::Ready)
        );
    }

    #[test]
    fn blank_line_is_none() {
        assert_eq!(parse_line("   "), None);
    }
}
