//! Pure modpack manifest parsing and validation.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `manifest::parse`, `manifest::validate`,
//! `manifest::is_allowed_override`.
//!
//! This module is **pure**: bytes in, validated [`modpack::Manifest`] out.

use std::collections::HashSet;

use crate::domain::modpack::{self, Manifest};
use crate::error::{Error, Result};

/// Deserialize a `knoxpack.json` byte buffer into a [`Manifest`].
///
/// Does **not** validate semantics — call [`validate`] afterwards.
pub fn parse(bytes: &[u8]) -> Result<Manifest> {
    let m: Manifest = serde_json::from_slice(bytes)?;
    Ok(m)
}

/// Validate a parsed [`Manifest`] against the knoxpack rules.
///
/// Enforces: supported `schema_version`, correct `format`, valid uuid
/// `pack_id`, non-empty `name`, unique `workshop_id`s, unique `load_order`s,
/// and non-empty / non-duplicate `mod_load_order` entries.
pub fn validate(m: &Manifest) -> Result<()> {
    if m.schema_version > modpack::SCHEMA_VERSION {
        return Err(Error::Validation(format!(
            "this modpack was made with a newer KnoxKit (schema_version {} > {})",
            m.schema_version,
            modpack::SCHEMA_VERSION
        )));
    }
    if m.schema_version == 0 {
        return Err(Error::Validation("schema_version must be >= 1".into()));
    }
    if m.format != modpack::FORMAT {
        return Err(Error::Validation(format!(
            "unexpected format {:?}, expected {:?}",
            m.format,
            modpack::FORMAT
        )));
    }
    uuid::Uuid::parse_str(&m.pack_id)
        .map_err(|_| Error::Validation(format!("pack_id is not a valid uuid: {:?}", m.pack_id)))?;
    if m.name.trim().is_empty() {
        return Err(Error::Validation("name must not be empty".into()));
    }

    let mut seen_ids = HashSet::new();
    let mut seen_orders = HashSet::new();
    for item in &m.workshop_items {
        if !seen_ids.insert(item.workshop_id) {
            return Err(Error::Validation(format!(
                "duplicate workshop_id {} in workshop_items",
                item.workshop_id
            )));
        }
        if !seen_orders.insert(item.load_order) {
            return Err(Error::Validation(format!(
                "duplicate load_order {} in workshop_items",
                item.load_order
            )));
        }
    }

    let mut seen_mods = HashSet::new();
    for mod_id in &m.mod_load_order {
        if mod_id.trim().is_empty() {
            return Err(Error::Validation(
                "mod_load_order contains an empty entry".into(),
            ));
        }
        if !seen_mods.insert(mod_id) {
            return Err(Error::Validation(format!(
                "duplicate mod id {:?} in mod_load_order",
                mod_id
            )));
        }
    }

    Ok(())
}

/// Whether `path` (relative, forward-slashed, inside the `overrides/` dir of a
/// pack archive — the `overrides/` prefix already stripped) is an override the
/// importer is allowed to copy onto disk.
///
/// Whitelist: exactly `jvm-args.txt`, `servertest.ini`, or
/// `serverconfig/<name>.ini` (single path segment after `serverconfig/`).
pub fn is_allowed_override(path: &str) -> bool {
    let p = path.trim().trim_start_matches('/');
    if p == "jvm-args.txt" || p == "servertest.ini" {
        return true;
    }
    if let Some(rest) = p.strip_prefix("serverconfig/") {
        return !rest.is_empty()
            && !rest.contains('/')
            && !rest.contains('\\')
            && rest != ".."
            && rest.ends_with(".ini");
    }
    false
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn fixture(name: &str) -> Vec<u8> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("modpack_fixtures")
            .join(name);
        std::fs::read(&path).unwrap_or_else(|e| panic!("read {}: {e}", path.display()))
    }

    #[test]
    fn valid_manifest_parses_and_validates() {
        let m = parse(&fixture("valid.json")).expect("parse valid");
        validate(&m).expect("validate valid");
        assert_eq!(m.name, "Survivors United");
        assert_eq!(m.workshop_items.len(), 2);
    }

    #[test]
    fn unknown_schema_is_rejected_with_newer_message() {
        let m = parse(&fixture("unknown_schema.json")).expect("parse");
        let err = validate(&m).expect_err("should reject");
        let msg = err.to_string();
        assert!(msg.contains("newer KnoxKit"), "got: {msg}");
    }

    #[test]
    fn duplicate_workshop_id_is_rejected() {
        let m = parse(&fixture("dup_workshop.json")).expect("parse");
        let err = validate(&m).expect_err("should reject dup");
        assert!(err.to_string().contains("duplicate workshop_id"));
    }

    #[test]
    fn malformed_json_fails_to_parse() {
        let err = parse(&fixture("malformed.json")).expect_err("should fail parse");
        assert!(matches!(err, Error::Json(_)));
    }

    #[test]
    fn forbidden_override_fixture_parses_but_path_whitelist_rejects() {
        // The manifest itself is structurally valid...
        let m = parse(&fixture("forbidden_override.json")).expect("parse");
        validate(&m).expect("structurally valid");
        // ...but the override-path whitelist is the real gate.
        assert!(!is_allowed_override("../../etc/passwd"));
        assert!(!is_allowed_override("steamapps/something.ini"));
        assert!(!is_allowed_override("serverconfig/../escape.ini"));
        assert!(!is_allowed_override("serverconfig/nested/deep.ini"));
        assert!(!is_allowed_override("jvm-args.txt.evil"));
    }

    #[test]
    fn override_whitelist_accepts_allowed_paths() {
        assert!(is_allowed_override("jvm-args.txt"));
        assert!(is_allowed_override("servertest.ini"));
        assert!(is_allowed_override("serverconfig/MyServer.ini"));
        assert!(is_allowed_override("/servertest.ini"));
    }

    #[test]
    fn empty_mod_load_order_entry_rejected() {
        let mut m = parse(&fixture("valid.json")).expect("parse");
        m.mod_load_order.push("  ".into());
        assert!(validate(&m).is_err());
    }
}
