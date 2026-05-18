//! Project Zomboid `mod.info` parsing and scanning.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `modinfo::parse`, `modinfo::ModInfo`, `modinfo::scan`.
//!
//! A workshop content directory ships one or more PZ mods, each as a
//! `mods/<ModName>/mod.info` text file of simple `key=value` lines. The
//! canonical in-game mod id is the `id=` value (the value PZ uses in its
//! load order, NOT the numeric Steam workshop id).
//!
//! `parse` is **pure** (no IO, no async). `scan` does filesystem IO and
//! returns `crate::Result`.

use std::path::Path;

use crate::error::{Error, Result};

/// Parsed contents of a single `mod.info` file.
///
/// Fields are optional because real-world `mod.info` files are frequently
/// missing keys; callers decide how to handle a missing `id`.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ModInfo {
    /// The in-game mod id (the `id=` value) — what PZ uses in load order.
    pub id: Option<String>,
    /// The human-readable mod name (the `name=` value).
    pub name: Option<String>,
    /// The mod description (the `description=` value), if present.
    pub description: Option<String>,
    /// The poster image filename (the `poster=` value), if present.
    pub poster: Option<String>,
    /// The mod url (the `url=` value), if present.
    pub url: Option<String>,
}

/// Parse `mod.info` text into a [`ModInfo`]. **Pure**: no IO, no async.
///
/// Tolerant by design: blank lines, `#`/`;` comment lines, CRLF endings,
/// surrounding whitespace, and stray lines without a `key=value` shape are
/// all ignored. Duplicate keys follow last-wins. Unknown keys are ignored.
pub fn parse(text: &str) -> ModInfo {
    let mut info = ModInfo::default();
    for raw in text.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            continue;
        };
        let key = key.trim();
        let value = value.trim();
        if key.is_empty() {
            // Stray leading `=...` line — not a real key.
            continue;
        }
        let slot = match key {
            "id" => &mut info.id,
            "name" => &mut info.name,
            "description" => &mut info.description,
            "poster" => &mut info.poster,
            "url" => &mut info.url,
            _ => continue,
        };
        // Last-wins on duplicate keys.
        *slot = Some(value.to_string());
    }
    info
}

/// Recursively scan `workshop_item_dir` for every `*/mod.info` under a
/// `mods/` subtree, parsing each into a [`ModInfo`].
///
/// PZ items place mods at `mods/<ModName>/mod.info`, but a workshop item may
/// nest that `mods/` directory at any depth (e.g.
/// `<id>/mods/<ModName>/mod.info` or `<id>/<version>/mods/<ModName>/...`),
/// so this walks the whole tree and collects every file literally named
/// `mod.info`. Returns the parsed entries in directory-traversal order.
pub fn scan(workshop_item_dir: &Path) -> Result<Vec<ModInfo>> {
    let mut out = Vec::new();
    if !workshop_item_dir.exists() {
        return Err(Error::NotFound(format!(
            "workshop item dir not found: {}",
            workshop_item_dir.display()
        )));
    }
    collect(workshop_item_dir, &mut out)?;
    Ok(out)
}

/// Depth-first walk collecting every `mod.info` file's parsed contents.
fn collect(dir: &Path, out: &mut Vec<ModInfo>) -> Result<()> {
    let mut entries: Vec<std::path::PathBuf> = std::fs::read_dir(dir)?
        .filter_map(|e| e.ok().map(|e| e.path()))
        .collect();
    // Deterministic traversal order regardless of filesystem enumeration.
    entries.sort();
    for path in entries {
        if path.is_dir() {
            collect(&path, out)?;
        } else if path.file_name().and_then(|n| n.to_str()) == Some("mod.info") {
            let text = std::fs::read_to_string(&path)?;
            out.push(parse(&text));
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn fixture(name: &str) -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("modinfo_fixtures")
            .join(name);
        std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("read fixture {}: {e}", path.display()))
    }

    #[test]
    fn parses_single_mod() {
        let info = parse(&fixture("single_mod.info"));
        assert_eq!(info.id.as_deref(), Some("Brita"));
        assert_eq!(info.name.as_deref(), Some("Brita's Weapon Pack"));
        assert_eq!(info.poster.as_deref(), Some("poster.png"));
        assert_eq!(
            info.url.as_deref(),
            Some("https://steamcommunity.com/sharedfiles/filedetails/?id=2392709985")
        );
    }

    #[test]
    fn missing_id_yields_none() {
        let info = parse(&fixture("missing_id.info"));
        assert_eq!(info.id, None);
        assert_eq!(info.name.as_deref(), Some("No Id Mod"));
    }

    #[test]
    fn crlf_comments_and_stray_equals_are_tolerated_last_wins() {
        let info = parse(&fixture("crlf_comments.info"));
        // `#` and `;` comment lines and the bare `=stray...` line are ignored.
        assert_eq!(info.name.as_deref(), Some("Brita Armor Pack"));
        // Surrounding whitespace around key and value is trimmed.
        assert_eq!(info.poster.as_deref(), Some("armor.png"));
        // Duplicate `id` → last value wins.
        assert_eq!(info.id.as_deref(), Some("BritaArmorFinal"));
        assert_eq!(info.description.as_deref(), Some("Armor add-on."));
    }

    #[test]
    fn multi_mod_fixture_parses_second_mod() {
        let info = parse(&fixture("multi_mod_b.info"));
        assert_eq!(info.id.as_deref(), Some("AuthenticZ"));
        assert_eq!(info.name.as_deref(), Some("AuthenticZ"));
    }

    #[test]
    fn empty_and_garbage_text_is_safe() {
        let info = parse("\n\n   \n#only a comment\nnot-a-kv-line\n");
        assert_eq!(info, ModInfo::default());
    }

    #[test]
    fn scan_finds_nested_mod_info_files() {
        let tmp = tempfile::tempdir().expect("tempdir");
        // Simulate: <item>/mods/Alpha/mod.info and <item>/mods/Beta/mod.info
        let alpha = tmp.path().join("mods").join("Alpha");
        let beta = tmp.path().join("mods").join("Beta");
        std::fs::create_dir_all(&alpha).expect("mkdir alpha");
        std::fs::create_dir_all(&beta).expect("mkdir beta");
        std::fs::write(alpha.join("mod.info"), "name=Alpha\nid=AlphaMod\n").expect("write a");
        std::fs::write(beta.join("mod.info"), "name=Beta\nid=BetaMod\n").expect("write b");

        let found = scan(tmp.path()).expect("scan");
        let ids: Vec<&str> = found.iter().filter_map(|m| m.id.as_deref()).collect();
        assert_eq!(ids, vec!["AlphaMod", "BetaMod"]);
    }

    #[test]
    fn scan_missing_dir_is_not_found() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let missing = tmp.path().join("does-not-exist");
        let err = scan(&missing).expect_err("should be NotFound");
        assert!(matches!(err, Error::NotFound(_)));
    }
}
