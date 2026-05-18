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
//!
//! The set of [`Event`] variants is **frozen**: `worker.rs` matches it
//! exhaustively with no wildcard arm, so any new line shape must map onto an
//! existing variant (or `None`). Be conservative: ambiguous noise → `None`
//! is always safer than a misclassified event. Canonical line shapes live in
//! `docs/steamcmd-protocol.md` (source of truth).

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

/// Strip a leading `Steam>` console prompt (possibly repeated) from a line.
///
/// SteamCMD echoes the prompt before commands and sometimes prefixes status
/// lines with it (`Steam>Downloading item ...`). Matching is done on the
/// prompt-free remainder so the prompt never hides a real event.
fn strip_prompt(s: &str) -> &str {
    let mut rest = s;
    while let Some(stripped) = rest.strip_prefix("Steam>") {
        rest = stripped.trim_start();
    }
    rest
}

/// Pull the parenthesized reason out of a failure tail like
/// ` failed (Timeout).` → `Timeout`. Falls back to a trimmed plain tail.
fn extract_paren_reason(tail: &str) -> String {
    let tail = tail.trim();
    if let Some(open) = tail.find('(')
        && let Some(close_rel) = tail[open + 1..].find(')')
    {
        let inner = tail[open + 1..open + 1 + close_rel].trim();
        if !inner.is_empty() {
            return inner.to_string();
        }
    }
    let cleaned =
        tail.trim_matches(|c: char| c == '(' || c == ')' || c == '.' || c.is_whitespace());
    cleaned.to_string()
}

/// Extract the first `"`-quoted substring from `s`, if any.
fn first_quoted(s: &str) -> Option<String> {
    let start = s.find('"')? + 1;
    let end = s[start..].find('"')? + start;
    Some(s[start..end].to_string())
}

/// Parse a single raw SteamCMD stdout line into an [`Event`], if recognized.
///
/// Returns `None` for blank lines, banners, progress-bar chrome, and any
/// noise we don't model. This is intentionally conservative: an ambiguous
/// line is dropped (`None`) rather than risk a misclassified event.
pub fn parse_line(line: &str) -> Option<Event> {
    // Normalize: trim outer whitespace and any leading console prompt(s).
    let trimmed = strip_prompt(line.trim()).trim();
    if trimmed.is_empty() {
        return None;
    }

    // --- Recognized startup / banner noise -------------------------------
    // These are explicitly known-and-ignored so they can't accidentally fall
    // through to a fuzzier match below. All → `None`.
    if trimmed.starts_with("Redirecting stderr to")
        || trimmed.starts_with("Logging directory:")
        || trimmed.starts_with("Connecting anonymously to Steam")
        || trimmed.starts_with("Loading Steam API...")
            && !trimmed.starts_with("Loading Steam API...OK")
    {
        return None;
    }
    // `[  0%] Checking for available updates...`, `[----] Verifying ...`,
    // `[----] Downloading update (12,345 of 67,890 KB)...` — the SteamCMD
    // *self-update* progress bar. Not a workshop download → `None`.
    if trimmed.starts_with('[')
        && let Some(close) = trimmed.find(']')
        && trimmed[1..close]
            .chars()
            .all(|c| c.is_ascii_digit() || c == '%' || c == '-' || c == ' ' || c == '+')
    {
        return None;
    }

    // --- Quit / shutdown -------------------------------------------------
    // The prompt is already stripped, so a bare `quit` (any case) or an
    // empty remainder from `Steam>quit` both mean shutdown.
    if trimmed.eq_ignore_ascii_case("quit") {
        return Some(Event::Quit);
    }

    // --- Login failure (check before generic OK matching) ----------------
    // Shapes observed:
    //   `FAILED login with result code Rate Limit Exceeded`
    //   `Waiting for user info...FAILED login with result code No Connection`
    //   `FAILED (Rate Limit Exceeded)`
    //   `Login Failure: Account Logon Denied`
    if let Some(idx) = trimmed.find("FAILED login with result code") {
        let reason = trimmed[idx + "FAILED login with result code".len()..]
            .trim()
            .trim_matches(|c: char| c == '(' || c == ')' || c == '.')
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
    if let Some(idx) = trimmed.find("Login Failure:") {
        let reason = trimmed[idx + "Login Failure:".len()..]
            .trim()
            .trim_end_matches('.')
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
    // Steam Guard / two-factor prompts: SteamCMD blocks waiting for input
    // that an anonymous batch session can never supply → treat as a login
    // failure so the worker fails the job instead of hanging.
    if trimmed.starts_with("Steam Guard code:")
        || trimmed.starts_with("Two-factor code:")
        || trimmed.contains("This account is protected by Steam Guard")
    {
        return Some(Event::LoginFailed {
            reason: "Steam Guard required".to_string(),
        });
    }
    // Generic `FAILED (reason)` immediately after a `Waiting for ...` phase,
    // e.g. `Waiting for user info...FAILED (Rate Limit Exceeded)`. Only the
    // `Waiting for ...FAILED` form is treated as a login failure to avoid
    // catching unrelated `FAILED` noise.
    if let Some(idx) = trimmed.find("...FAILED")
        && trimmed.starts_with("Waiting for")
    {
        let reason = extract_paren_reason(&trimmed[idx + "...FAILED".len()..]);
        return Some(Event::LoginFailed {
            reason: if reason.is_empty() {
                "unknown".to_string()
            } else {
                reason
            },
        });
    }

    // --- Login success ---------------------------------------------------
    // `Logged in OK` is authoritative. The corroborating `Waiting for user
    // info...OK` / `Waiting for client config...OK` are also accepted
    // (duplicate `LoginOk` is harmless and idempotent for the worker).
    if trimmed.starts_with("Logged in OK")
        || trimmed.starts_with("Waiting for user info...OK")
        || trimmed.starts_with("Waiting for client config...OK")
    {
        return Some(Event::LoginOk);
    }

    // --- Ready -----------------------------------------------------------
    if trimmed.starts_with("Loading Steam API...OK") || trimmed.contains("type 'quit' to exit") {
        return Some(Event::Ready);
    }

    // --- Download success ------------------------------------------------
    // `Success. Downloaded item 2392709985 to "C:\path" (12345 bytes)`
    // Tolerates extra spaces and forward- or back-slash paths.
    if let Some(rest) = trimmed.strip_prefix("Success. Downloaded item ") {
        let mut parts = rest.splitn(2, " to ");
        let id_str = parts.next().unwrap_or("").trim();
        if let Ok(workshop_id) = id_str.parse::<u64>() {
            let path = parts.next().and_then(first_quoted).unwrap_or_default();
            return Some(Event::DownloadSuccess {
                workshop_id,
                path: PathBuf::from(path),
            });
        }
        return None;
    }

    // --- Download failure ------------------------------------------------
    // `ERROR! Download item 2392709985 failed (Failure).`
    // `ERROR! Download item 123 failed (Timeout).`
    // `ERROR! Download item 123 failed (Access Denied).`
    // `ERROR! Download item 123 failed (No subscription).`
    if let Some(rest) = trimmed.strip_prefix("ERROR! Download item ") {
        let mut parts = rest.splitn(2, " failed");
        let id_str = parts.next().unwrap_or("").trim();
        if let Ok(workshop_id) = id_str.parse::<u64>() {
            let error = parts.next().map(extract_paren_reason).unwrap_or_default();
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
    // Also: `(0x81) committing`, `(0x3) reconfiguring`, `(0x5) validating`,
    // `(0x11) preallocating`, `(0x101) committing`. Any `Update state` line
    // that carries a numeric `progress:` is surfaced — the state phase is
    // informational, the percent is what matters. A rate/ETA suffix on the
    // line (`... (1/2), 1.23 MB/s, ETA 00:42`) is ignored because only the
    // first whitespace-delimited token after `progress:` is parsed.
    if trimmed.starts_with("Update state") {
        if let Some(pidx) = trimmed.find("progress:") {
            let after = trimmed[pidx + "progress:".len()..].trim();
            // The percent token may be followed by `(a / b)` or `,`; take the
            // leading numeric run only.
            let pct_str: String = after
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            if let Ok(pct) = pct_str.parse::<f64>()
                && pct.is_finite()
            {
                let percent = pct.round().clamp(0.0, 100.0) as u8;
                // The state line carries no workshop id; the worker tracks
                // the in-flight id. Sentinel 0 — worker overwrites it.
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
                Event::LoginOk,
                Event::LoginOk,
                Event::LoginOk,
                Event::DownloadStarted {
                    workshop_id: 2392709985
                },
                // `(0x3) reconfiguring, progress: 0.00` — now surfaced.
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 0
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
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 100
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
                Event::Ready,
                Event::Ready,
                Event::LoginOk,
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
    fn parses_alternate_failure_reasons() {
        let events = parse_fixture("download_failed_variants.txt");
        assert_eq!(
            events,
            vec![
                Event::Ready,
                Event::Ready,
                Event::LoginOk,
                Event::DownloadStarted { workshop_id: 111 },
                Event::DownloadFailed {
                    workshop_id: 111,
                    error: "Timeout".to_string()
                },
                Event::DownloadStarted { workshop_id: 222 },
                Event::DownloadFailed {
                    workshop_id: 222,
                    error: "Access Denied".to_string()
                },
                Event::DownloadStarted { workshop_id: 333 },
                Event::DownloadFailed {
                    workshop_id: 333,
                    error: "No subscription".to_string()
                },
                Event::Quit,
            ]
        );
    }

    #[test]
    fn parses_steam_guard_prompt_as_login_failure() {
        let events = parse_fixture("login_steam_guard.txt");
        assert_eq!(
            events,
            vec![
                Event::Ready,
                Event::Ready,
                Event::LoginFailed {
                    reason: "Account Logon Denied".to_string()
                },
                Event::LoginFailed {
                    reason: "Steam Guard required".to_string()
                },
                Event::Quit,
            ]
        );
    }

    #[test]
    fn parses_progress_with_rate_and_eta_suffix() {
        let events = parse_fixture("download_progress_rate.txt");
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
                    percent: 0
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 25
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 75
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 100
                },
                Event::DownloadProgress {
                    workshop_id: 0,
                    percent: 100
                },
                Event::DownloadSuccess {
                    workshop_id: 2392709985,
                    path: PathBuf::from(
                        "/home/user/.steam/steamapps/workshop/content/108600/2392709985"
                    )
                },
                Event::Quit,
            ]
        );
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
    fn progress_phases_other_than_downloading() {
        // validating / preallocating / committing all carry a percent.
        assert_eq!(
            parse_line(" Update state (0x5) validating, progress: 50.00 (5 / 10)"),
            Some(Event::DownloadProgress {
                workshop_id: 0,
                percent: 50
            })
        );
        assert_eq!(
            parse_line(" Update state (0x11) preallocating, progress: 10.00 (1 / 10)"),
            Some(Event::DownloadProgress {
                workshop_id: 0,
                percent: 10
            })
        );
        assert_eq!(
            parse_line(" Update state (0x101) committing, progress: 100.00 (10 / 10)"),
            Some(Event::DownloadProgress {
                workshop_id: 0,
                percent: 100
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

    #[test]
    fn self_update_progress_bar_is_none() {
        assert_eq!(parse_line("[  0%] Checking for available updates..."), None);
        assert_eq!(parse_line("[----] Verifying installation..."), None);
        assert_eq!(
            parse_line("[----] Downloading update (12345 of 67890 KB)..."),
            None
        );
        assert_eq!(parse_line("[ 33%] Downloading update..."), None);
    }

    #[test]
    fn banner_noise_is_none() {
        assert_eq!(
            parse_line("Redirecting stderr to 'C:\\steamcmd\\logs\\stderr.txt'"),
            None
        );
        assert_eq!(parse_line("Logging directory: 'C:\\steamcmd\\logs'"), None);
        assert_eq!(
            parse_line("Connecting anonymously to Steam Public..."),
            None
        );
        assert_eq!(parse_line("Loading Steam API..."), None);
    }

    #[test]
    fn prompt_prefixed_event_still_parses() {
        assert_eq!(
            parse_line("Steam>Downloading item 42 ..."),
            Some(Event::DownloadStarted { workshop_id: 42 })
        );
        assert_eq!(parse_line("Steam>quit"), Some(Event::Quit));
        assert_eq!(parse_line("Steam>Steam>quit"), Some(Event::Quit));
    }

    #[test]
    fn forward_slash_success_path() {
        assert_eq!(
            parse_line(
                "Success. Downloaded item 7 to \"/home/u/.steam/workshop/content/108600/7\" (5 bytes)"
            ),
            Some(Event::DownloadSuccess {
                workshop_id: 7,
                path: PathBuf::from("/home/u/.steam/workshop/content/108600/7")
            })
        );
    }

    #[test]
    fn login_failure_paren_and_colon_forms() {
        assert_eq!(
            parse_line("Waiting for user info...FAILED (Rate Limit Exceeded)"),
            Some(Event::LoginFailed {
                reason: "Rate Limit Exceeded".to_string()
            })
        );
        assert_eq!(
            parse_line("Login Failure: Account Logon Denied."),
            Some(Event::LoginFailed {
                reason: "Account Logon Denied".to_string()
            })
        );
        assert_eq!(
            parse_line("FAILED login with result code (No Connection)."),
            Some(Event::LoginFailed {
                reason: "No Connection".to_string()
            })
        );
    }

    #[test]
    fn unrelated_failed_is_not_login_failure() {
        // A `FAILED` that is not a login/`Waiting for ...` phase is noise.
        assert_eq!(parse_line("Something else FAILED somehow"), None);
        assert_eq!(parse_line("ERROR! something unrelated happened"), None);
    }
}
