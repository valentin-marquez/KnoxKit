//! Pure parser for `steamcmd +app_info_print 108600` KeyValues output.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `appinfo_parser::parse_branches`, `appinfo_parser::RawBranch`.
//!
//! This module is **pure**: no IO, no async, no state. It scans the Valve
//! KeyValues text SteamCMD prints for app `108600` and extracts the
//! `"108600" → "depots" → "branches"` subtree. We hand-roll a tiny
//! quote/brace scan rather than pull a `vdf` crate (see CLAUDE.md "no new
//! crates"); the shapes it must accept are frozen in
//! `docs/steamcmd-protocol.md` and exercised by
//! `tests/parser_fixtures/appinfo_branches.txt`.

/// One Steam branch as read from the `"branches"` KeyValues subtree.
///
/// `name` is the raw Steam branch key (`public`, `unstable`,
/// `outdatedunstable`, …). `description` is absent on `public` and present on
/// the beta branches. `build_id` is the `"buildid"` scalar when present.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RawBranch {
    /// Raw Steam branch key.
    pub name: String,
    /// Branch description (absent on `public`).
    pub description: Option<String>,
    /// `buildid` scalar, kept verbatim as a string.
    pub build_id: Option<String>,
}

/// Scan `app_info_print` stdout and return every branch under
/// `"branches"`.
///
/// Whitespace/tab tolerant. If the `"branches"` block is not found (or the
/// text is empty/garbage) an empty `Vec` is returned — the caller is
/// responsible for falling back to the static branch list. Never panics.
pub fn parse_branches(stdout: &str) -> Vec<RawBranch> {
    let bytes = stdout.as_bytes();
    let Some(branches_open) = find_branches_block(bytes) else {
        return Vec::new();
    };
    let Some((body_start, body_end)) = balanced_block(bytes, branches_open) else {
        return Vec::new();
    };

    let mut out = Vec::new();
    let mut i = body_start;
    while i < body_end {
        // Each immediate child is `"<name>" { ... }`.
        let Some((name, name_end)) = next_quoted(bytes, i, body_end) else {
            break;
        };
        // Find the child's opening brace after the name.
        let Some(child_open) = next_brace(bytes, name_end, body_end) else {
            break;
        };
        let Some((child_body_start, child_body_end)) = balanced_block(bytes, child_open) else {
            break;
        };
        let inner = &stdout[child_body_start..child_body_end];
        out.push(RawBranch {
            name,
            description: scalar(inner, "description"),
            build_id: scalar(inner, "buildid"),
        });
        // Resume scanning after this child's closing brace.
        i = child_body_end + 1;
    }
    out
}

/// Byte offset of the `{` that opens the `"branches"` block, or `None`.
fn find_branches_block(bytes: &[u8]) -> Option<usize> {
    let mut search = 0;
    while let Some(rel) = find_sub(&bytes[search..], b"\"branches\"") {
        let key_end = search + rel + "\"branches\"".len();
        if let Some(open) = next_brace(bytes, key_end, bytes.len()) {
            return Some(open);
        }
        search = key_end;
    }
    None
}

/// First `{` at or after `from` (skipping whitespace/quotes), within `end`.
fn next_brace(bytes: &[u8], from: usize, end: usize) -> Option<usize> {
    let mut i = from;
    while i < end {
        match bytes[i] {
            b'{' => return Some(i),
            // A new quoted token before any `{` means there is no block.
            b'"' => return None,
            _ => i += 1,
        }
    }
    None
}

/// Given the index of an opening `{`, return `(body_start, body_end)` where
/// `body_end` is the index of the matching `}` (exclusive of it for the
/// slice). Quote-aware so braces inside `"..."` do not affect nesting.
fn balanced_block(bytes: &[u8], open: usize) -> Option<(usize, usize)> {
    let mut depth = 0i32;
    let mut i = open;
    let mut in_quote = false;
    while i < bytes.len() {
        let c = bytes[i];
        if in_quote {
            if c == b'"' {
                in_quote = false;
            }
        } else {
            match c {
                b'"' => in_quote = true,
                b'{' => depth += 1,
                b'}' => {
                    depth -= 1;
                    if depth == 0 {
                        return Some((open + 1, i));
                    }
                }
                _ => {}
            }
        }
        i += 1;
    }
    None
}

/// Next double-quoted token in `bytes[from..end]`, returning its unescaped
/// content and the index just past its closing quote.
fn next_quoted(bytes: &[u8], from: usize, end: usize) -> Option<(String, usize)> {
    let mut i = from;
    while i < end && bytes[i] != b'"' {
        i += 1;
    }
    if i >= end {
        return None;
    }
    let start = i + 1;
    let mut j = start;
    while j < end && bytes[j] != b'"' {
        j += 1;
    }
    if j >= end {
        return None;
    }
    let s = String::from_utf8_lossy(&bytes[start..j]).into_owned();
    Some((s, j + 1))
}

/// Read the string scalar for `key` inside a KeyValues body: the pattern
/// `"key" "value"`. Returns `None` if the key is absent.
fn scalar(body: &str, key: &str) -> Option<String> {
    let bytes = body.as_bytes();
    let needle = format!("\"{key}\"");
    let mut search = 0;
    while let Some(rel) = find_sub(&bytes[search..], needle.as_bytes()) {
        let after_key = search + rel + needle.len();
        // The value is the next quoted token; if a `{` comes first this key
        // is a nested block, not a scalar — skip it.
        let mut i = after_key;
        while i < bytes.len() && bytes[i] != b'"' && bytes[i] != b'{' {
            i += 1;
        }
        if i < bytes.len()
            && bytes[i] == b'"'
            && let Some((val, _)) = next_quoted(bytes, i, bytes.len())
        {
            return Some(val);
        }
        search = after_key;
    }
    None
}

/// First index of `needle` in `hay`, or `None`. Tiny substring search (no
/// regex/aho crate); inputs here are small `app_info_print` blobs.
fn find_sub(hay: &[u8], needle: &[u8]) -> Option<usize> {
    if needle.is_empty() || hay.len() < needle.len() {
        return None;
    }
    hay.windows(needle.len()).position(|w| w == needle)
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    fn fixture() -> String {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("parser_fixtures")
            .join("appinfo_branches.txt");
        std::fs::read_to_string(&path)
            .unwrap_or_else(|e| panic!("read fixture {}: {e}", path.display()))
    }

    #[test]
    fn parses_public_unstable_outdated_from_fixture() {
        let branches = parse_branches(&fixture());
        let by = |n: &str| {
            branches
                .iter()
                .find(|b| b.name == n)
                .unwrap_or_else(|| panic!("branch {n} missing in {branches:?}"))
        };

        let public = by("public");
        assert_eq!(public.description, None, "public has no description");
        assert_eq!(public.build_id.as_deref(), Some("22695648"));

        let unstable = by("unstable");
        assert_eq!(
            unstable.description.as_deref(),
            Some("Latest Build 42 - UNSTABLE - BACKUP FIRST")
        );
        assert_eq!(unstable.build_id.as_deref(), Some("23177452"));

        let outdated = by("outdatedunstable");
        assert_eq!(
            outdated.description.as_deref(),
            Some("Unstable fallback branch for rollbacks and prior saves.")
        );
        assert_eq!(outdated.build_id.as_deref(), Some("22869276"));
    }

    #[test]
    fn parses_tab_indented_multiline_variant() {
        // The fixture also carries a realistically tab-indented block (one
        // `"key" "value"` pair per line). Both blocks parse; the scanner
        // picks the first `"branches"` it sees, so this asserts the
        // multi-line shape independently.
        let multiline = "\t\t\t\"branches\"\n\t\t\t{\n\t\t\t\t\"public\"\n\t\t\t\t{\n\t\t\t\t\t\"buildid\"\t\t\"22695648\"\n\t\t\t\t\t\"timeupdated\"\t\t\"1775656124\"\n\t\t\t\t}\n\t\t\t\t\"unstable\"\n\t\t\t\t{\n\t\t\t\t\t\"buildid\"\t\t\"23177452\"\n\t\t\t\t\t\"description\"\t\t\"Latest Build 42 - UNSTABLE - BACKUP FIRST\"\n\t\t\t\t\t\"timeupdated\"\t\t\"1778497669\"\n\t\t\t\t}\n\t\t\t}\n";
        let branches = parse_branches(multiline);
        assert_eq!(branches.len(), 2);
        assert_eq!(branches[0].name, "public");
        assert_eq!(branches[0].description, None);
        assert_eq!(branches[0].build_id.as_deref(), Some("22695648"));
        assert_eq!(branches[1].name, "unstable");
        assert_eq!(
            branches[1].description.as_deref(),
            Some("Latest Build 42 - UNSTABLE - BACKUP FIRST")
        );
    }

    #[test]
    fn empty_or_garbage_yields_no_branches() {
        assert!(parse_branches("").is_empty());
        assert!(parse_branches("not keyvalues at all { ] [").is_empty());
        // A `"branches"` key with no following block is tolerated → empty.
        assert!(parse_branches("\"branches\" \"oops\"").is_empty());
    }
}
