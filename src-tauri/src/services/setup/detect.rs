//! Project Zomboid install detection.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `detect::game_path`, `detect::parse_library_paths`,
//! `detect::parse_installdir`.
//!
//! Strategy: locate the Steam root (registry first, then the two well-known
//! Program Files locations), parse `steamapps/libraryfolders.vdf` for every
//! library, then in each library look for `appmanifest_108600.acf` and read
//! its `installdir`. The PZ install is
//! `<library>/steamapps/common/<installdir>`.
//!
//! The two `parse_*` fns are **pure** (zero IO) and unit-tested against
//! `tests/setup_fixtures/`. Everything that touches disk/registry is `cfg`-
//! light and Windows-shaped (the bootstrap targets Windows only — see
//! `docs/architecture.md`).

use std::path::PathBuf;

/// Steam app id for Project Zomboid (also used by the steamcmd worker).
pub const PZ_APPID: &str = "108600";

/// Extract every `"path"` value from a Steam `libraryfolders.vdf` body.
///
/// **Pure**: no IO, no async. Tolerant hand-rolled scan of Valve's
/// KeyValues text — it does not build a full tree, it just collects the
/// string value following each top-level-ish `"path"` key. Backslash escape
/// pairs (`\\`) common in Windows VDF paths are unescaped to a single `\`.
pub fn parse_library_paths(vdf: &str) -> Vec<String> {
    let mut out = Vec::new();
    for line in vdf.lines() {
        let trimmed = line.trim();
        // Lines look like:  "path"		"C:\\SteamLibrary"
        let Some(rest) = trimmed.strip_prefix('"') else {
            continue;
        };
        let Some(end_key) = rest.find('"') else {
            continue;
        };
        let (key, after_key) = rest.split_at(end_key);
        if key != "path" {
            continue;
        }
        // after_key starts at the closing quote of the key; find the value.
        let Some(value_start) = after_key[1..].find('"') else {
            continue;
        };
        let value_region = &after_key[1 + value_start + 1..];
        let Some(value_end) = value_region.find('"') else {
            continue;
        };
        let raw = &value_region[..value_end];
        out.push(raw.replace("\\\\", "\\"));
    }
    out
}

/// Extract the `installdir` value from an `appmanifest_<appid>.acf` body.
///
/// **Pure**: no IO, no async. Returns the unquoted value of the first
/// `"installdir"` key, or `None` if absent.
pub fn parse_installdir(acf: &str) -> Option<String> {
    for line in acf.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed.strip_prefix('"') else {
            continue;
        };
        let Some(end_key) = rest.find('"') else {
            continue;
        };
        let (key, after_key) = rest.split_at(end_key);
        if key != "installdir" {
            continue;
        }
        let Some(value_start) = after_key[1..].find('"') else {
            continue;
        };
        let value_region = &after_key[1 + value_start + 1..];
        let Some(value_end) = value_region.find('"') else {
            continue;
        };
        return Some(value_region[..value_end].replace("\\\\", "\\"));
    }
    None
}

/// Candidate Steam root directories, registry first then the two standard
/// Program Files locations. Windows-only paths; the registry read is gated
/// to `cfg(windows)` and silently yields nothing elsewhere.
fn steam_roots() -> Vec<PathBuf> {
    let mut roots: Vec<PathBuf> = Vec::new();

    if let Some(p) = steam_root_from_registry() {
        roots.push(p);
    }
    for var in ["ProgramFiles(x86)", "ProgramFiles"] {
        if let Ok(pf) = std::env::var(var) {
            roots.push(PathBuf::from(pf).join("Steam"));
        }
    }
    roots
}

/// Read the Steam install path from the Windows registry, if present.
///
/// Tries `HKCU\Software\Valve\Steam\SteamPath` then
/// `HKLM\SOFTWARE\WOW6432Node\Valve\Steam\InstallPath`. Returns `None` on any
/// non-Windows target or if neither key exists.
#[cfg(windows)]
fn steam_root_from_registry() -> Option<PathBuf> {
    use winreg::RegKey;
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey("Software\\Valve\\Steam")
        && let Ok(path) = key.get_value::<String, _>("SteamPath")
        && !path.is_empty()
    {
        return Some(PathBuf::from(path));
    }

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    if let Ok(key) = hklm.open_subkey("SOFTWARE\\WOW6432Node\\Valve\\Steam")
        && let Ok(path) = key.get_value::<String, _>("InstallPath")
        && !path.is_empty()
    {
        return Some(PathBuf::from(path));
    }
    None
}

/// Non-Windows fallback: no registry, no Steam root from it.
#[cfg(not(windows))]
fn steam_root_from_registry() -> Option<PathBuf> {
    None
}

/// Best-effort detection of the Project Zomboid install directory.
///
/// Returns the first existing `<library>/steamapps/common/<installdir>` found
/// by scanning every Steam library declared in any candidate root's
/// `libraryfolders.vdf` (plus each root itself as an implicit library), or
/// `None` if PZ is not installed / not found.
pub fn game_path() -> Option<PathBuf> {
    for root in steam_roots() {
        let steamapps = root.join("steamapps");

        // The root itself is always an implicit library, plus any declared
        // in libraryfolders.vdf.
        let mut libraries: Vec<PathBuf> = vec![root.clone()];
        let vdf = steamapps.join("libraryfolders.vdf");
        if let Ok(body) = std::fs::read_to_string(&vdf) {
            for p in parse_library_paths(&body) {
                libraries.push(PathBuf::from(p));
            }
        }

        for lib in libraries {
            let lib_steamapps = lib.join("steamapps");
            let manifest = lib_steamapps.join(format!("appmanifest_{PZ_APPID}.acf"));
            let Ok(body) = std::fs::read_to_string(&manifest) else {
                continue;
            };
            let Some(installdir) = parse_installdir(&body) else {
                continue;
            };
            let game = lib_steamapps.join("common").join(installdir);
            if game.is_dir() {
                return Some(game);
            }
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn fixture(name: &str) -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("setup_fixtures")
            .join(name);
        std::fs::read_to_string(path).expect("read fixture")
    }

    #[test]
    fn parses_every_library_path() {
        let paths = parse_library_paths(&fixture("libraryfolders.vdf"));
        assert_eq!(
            paths,
            vec![
                "C:\\Program Files (x86)\\Steam".to_string(),
                "D:\\SteamLibrary".to_string(),
            ]
        );
    }

    #[test]
    fn parse_library_paths_empty_on_garbage() {
        assert!(parse_library_paths("not a vdf at all").is_empty());
        assert!(parse_library_paths("").is_empty());
    }

    #[test]
    fn parses_installdir_from_acf() {
        let dir = parse_installdir(&fixture("appmanifest_108600.acf"));
        assert_eq!(dir.as_deref(), Some("ProjectZomboid"));
    }

    #[test]
    fn parse_installdir_none_when_absent() {
        let acf = "\"AppState\"\n{\n\t\"appid\"\t\"108600\"\n}\n";
        assert_eq!(parse_installdir(acf), None);
    }

    #[test]
    fn parse_installdir_unescapes_backslashes() {
        let acf = "\t\"installdir\"\t\t\"Sub\\\\Dir\"\n";
        assert_eq!(parse_installdir(acf).as_deref(), Some("Sub\\Dir"));
    }
}
