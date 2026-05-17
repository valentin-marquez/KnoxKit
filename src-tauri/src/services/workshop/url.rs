//! Steam Workshop URL / id parsing.
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `url::parse`.
//!
//! Pure: a string in, a [`workshop::WorkshopRef`] out.

use crate::domain::workshop::WorkshopRef;
use crate::error::{Error, Result};

/// Parse a workshop reference from either a full Steam URL or a bare numeric
/// id.
///
/// Accepts (http/https, extra query params and trailing slashes tolerated):
/// - `https://steamcommunity.com/sharedfiles/filedetails/?id=12345`
/// - `https://steamcommunity.com/workshop/filedetails/?id=12345`
/// - bare `12345`
///
/// Rejects anything without a positive numeric id with [`Error::Workshop`].
pub fn parse(input: &str) -> Result<WorkshopRef> {
    let s = input.trim();
    if s.is_empty() {
        return Err(Error::Workshop("empty workshop reference".into()));
    }

    // Bare numeric id.
    if let Ok(id) = s.parse::<u64>() {
        if id == 0 {
            return Err(Error::Workshop("workshop id must be non-zero".into()));
        }
        return Ok(WorkshopRef { id });
    }

    // Must look like a steamcommunity URL with an `id` query parameter.
    let lower = s.to_ascii_lowercase();
    if !lower.contains("steamcommunity.com") {
        return Err(Error::Workshop(format!(
            "not a recognized workshop url or id: {s:?}"
        )));
    }

    let query = s
        .split('?')
        .nth(1)
        .ok_or_else(|| Error::Workshop(format!("workshop url has no query string: {s:?}")))?;

    for pair in query.split('&') {
        let mut kv = pair.splitn(2, '=');
        let key = kv.next().unwrap_or("");
        if key.eq_ignore_ascii_case("id") {
            let val = kv.next().unwrap_or("").trim();
            // tolerate a trailing fragment then a trailing slash.
            let val = val.split('#').next().unwrap_or(val);
            let val = val.trim_end_matches('/');
            let id: u64 = val
                .parse()
                .map_err(|_| Error::Workshop(format!("workshop id is not numeric: {val:?}")))?;
            if id == 0 {
                return Err(Error::Workshop("workshop id must be non-zero".into()));
            }
            return Ok(WorkshopRef { id });
        }
    }

    Err(Error::Workshop(format!(
        "workshop url is missing the id parameter: {s:?}"
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use pretty_assertions::assert_eq;

    #[test]
    fn parses_bare_numeric_id() {
        assert_eq!(parse("12345").expect("ok"), WorkshopRef { id: 12345 });
    }

    #[test]
    fn parses_sharedfiles_url() {
        let r =
            parse("https://steamcommunity.com/sharedfiles/filedetails/?id=2392709985").expect("ok");
        assert_eq!(r, WorkshopRef { id: 2392709985 });
    }

    #[test]
    fn parses_workshop_url_with_extra_params() {
        let r =
            parse("http://steamcommunity.com/workshop/filedetails/?id=262584809&searchtext=foo")
                .expect("ok");
        assert_eq!(r, WorkshopRef { id: 262584809 });
    }

    #[test]
    fn parses_url_with_trailing_slash_and_fragment() {
        let r = parse("https://steamcommunity.com/sharedfiles/filedetails/?id=99/#comments")
            .expect("ok");
        assert_eq!(r, WorkshopRef { id: 99 });
    }

    #[test]
    fn rejects_non_numeric_bare() {
        assert!(parse("notanumber").is_err());
    }

    #[test]
    fn rejects_url_without_id() {
        assert!(parse("https://steamcommunity.com/sharedfiles/filedetails/?foo=bar").is_err());
    }

    #[test]
    fn rejects_empty() {
        assert!(parse("   ").is_err());
    }

    #[test]
    fn rejects_zero_id() {
        assert!(parse("0").is_err());
        assert!(parse("https://steamcommunity.com/sharedfiles/filedetails/?id=0").is_err());
    }

    #[test]
    fn rejects_unrelated_url() {
        assert!(parse("https://example.com/?id=5").is_err());
    }
}
