//! SteamCMD detection + in-app install (download, extract, bootstrap).
//!
//! keep names path-relative — see docs/conventions.md
//! Callers write `steamcmd::detect`, `steamcmd::install`,
//! `steamcmd::extract_zip`.
//!
//! Mirrors `scripts/install-steamcmd.ps1` (same canonical Valve zip URL, same
//! "run once with `+quit` to bootstrap" step) **in Rust** — it never shells
//! out to the .ps1. The HTTP download is isolated behind [`install`] so the
//! pure [`extract_zip`] + path logic is unit-testable against the local
//! fixture zip; **the test suite makes no real network calls**.

use std::io::Read;
use std::path::{Path, PathBuf};

use crate::error::{Error, Result};
use crate::paths;

/// Canonical Valve SteamCMD zip — identical to `scripts/install-steamcmd.ps1`.
pub const ZIP_URL: &str = "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip";

/// Resolve an already-available `steamcmd.exe`, if any.
///
/// Probe order: explicit `settings.steamcmd_path`, then the in-app install
/// dir (`paths::steamcmd_dir()/steamcmd.exe`), then the repo-local
/// `tools/steamcmd/steamcmd.exe` (the `just steamcmd-install` location).
/// Returns `None` if none exist on disk.
pub fn detect(configured: Option<&str>) -> Option<PathBuf> {
    if let Some(p) = configured {
        let path = PathBuf::from(p);
        if path.is_file() {
            return Some(path);
        }
    }
    if let Ok(dir) = paths::steamcmd_dir() {
        let exe = dir.join("steamcmd.exe");
        if exe.is_file() {
            return Some(exe);
        }
    }
    let repo_local = PathBuf::from("tools").join("steamcmd").join("steamcmd.exe");
    if repo_local.is_file() {
        return Some(repo_local);
    }
    None
}

/// Download + extract + bootstrap SteamCMD into `paths::steamcmd_dir()`,
/// returning the resolved `steamcmd.exe` path.
///
/// 1. Download [`ZIP_URL`] (blocking `ureq`, rustls TLS) into the install dir.
/// 2. [`extract_zip`] it (pure; reuses the `zip` crate).
/// 3. Run `steamcmd.exe +quit` **once** to self-update — best-effort: a
///    nonzero exit is normal on first bootstrap (mirrors the .ps1), so it is
///    ignored as long as the exe still exists afterward.
///
/// Network IO is confined to this fn; [`extract_zip`] is pure and tested.
pub fn install() -> Result<PathBuf> {
    let dir = paths::steamcmd_dir()?;
    paths::ensure_dir(&dir)?;

    let bytes = download(ZIP_URL)?;
    let exe = extract_zip(&bytes, &dir)?;

    // Best-effort self-update: nonzero exit is expected on first run (the
    // process commonly restarts itself with exit 7). Mirror the .ps1 and do
    // not hard-fail as long as the binary survived.
    if let Err(e) = bootstrap(&exe) {
        tracing::warn!("steamcmd bootstrap (+quit) was not clean: {e}");
    }
    if !exe.is_file() {
        return Err(Error::Steamcmd(
            "steamcmd.exe missing after install/bootstrap".into(),
        ));
    }
    Ok(exe)
}

/// Download `url` into memory (blocking; rustls TLS via `ureq`).
fn download(url: &str) -> Result<Vec<u8>> {
    let mut resp = ureq::get(url)
        .call()
        .map_err(|e| Error::Steamcmd(format!("steamcmd download failed: {e}")))?;
    let mut buf = Vec::new();
    resp.body_mut()
        .as_reader()
        .read_to_end(&mut buf)
        .map_err(|e| Error::Steamcmd(format!("reading steamcmd download body: {e}")))?;
    if buf.is_empty() {
        return Err(Error::Steamcmd("steamcmd download was empty".into()));
    }
    Ok(buf)
}

/// Extract a SteamCMD zip (`zip_bytes`) into `dest`, returning the path to the
/// extracted `steamcmd.exe`.
///
/// **Pure** w.r.t. the network — only touches `dest` on the local filesystem,
/// so it is unit-tested with the local fixture zip (no download). Rejects
/// zip-slip entries (`..` / absolute) and errors if no `steamcmd.exe` is
/// present in the archive.
pub fn extract_zip(zip_bytes: &[u8], dest: &Path) -> Result<PathBuf> {
    let reader = std::io::Cursor::new(zip_bytes);
    let mut archive = zip::ZipArchive::new(reader)?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i)?;
        let Some(rel) = entry.enclosed_name() else {
            // `enclosed_name` is `None` for zip-slip / absolute entries.
            return Err(Error::Zip(format!(
                "unsafe path in steamcmd zip: {}",
                entry.name()
            )));
        };
        let out_path = dest.join(&rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out_path)?;
            continue;
        }
        if let Some(parent) = out_path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let mut out = std::fs::File::create(&out_path)?;
        std::io::copy(&mut entry, &mut out)?;
    }

    let exe = dest.join("steamcmd.exe");
    if !exe.is_file() {
        return Err(Error::Steamcmd(
            "steamcmd.exe not found in downloaded archive".into(),
        ));
    }
    Ok(exe)
}

/// Run `steamcmd.exe +quit` once. A nonzero exit is normal on first bootstrap
/// (the process self-updates and restarts), so it is NOT treated as failure —
/// only a spawn error propagates.
fn bootstrap(exe: &Path) -> Result<()> {
    let status = std::process::Command::new(exe)
        .arg("+quit")
        .status()
        .map_err(|e| Error::Steamcmd(format!("failed to spawn steamcmd for bootstrap: {e}")))?;
    tracing::info!("steamcmd +quit exited with {status:?} (nonzero is normal on first run)");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixture_zip() -> Vec<u8> {
        let path = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("setup_fixtures")
            .join("steamcmd-fixture.zip");
        std::fs::read(path).expect("read fixture zip")
    }

    #[test]
    fn extract_zip_writes_steamcmd_exe() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let exe = extract_zip(&fixture_zip(), tmp.path()).expect("extract");
        assert!(exe.is_file(), "steamcmd.exe should exist after extraction");
        assert_eq!(exe, tmp.path().join("steamcmd.exe"));
        let body = std::fs::read_to_string(&exe).expect("read extracted");
        assert!(body.contains("fake steamcmd"));
    }

    #[test]
    fn extract_zip_errors_without_steamcmd_exe() {
        // A zip with one unrelated file → no steamcmd.exe → error.
        let mut buf = Vec::new();
        {
            let mut w = zip::ZipWriter::new(std::io::Cursor::new(&mut buf));
            let opts: zip::write::FileOptions<()> = zip::write::FileOptions::default();
            zip::ZipWriter::start_file(&mut w, "readme.txt", opts).expect("start");
            std::io::Write::write_all(&mut w, b"hi").expect("write");
            w.finish().expect("finish");
        }
        let tmp = tempfile::tempdir().expect("tempdir");
        let err = extract_zip(&buf, tmp.path()).expect_err("should error");
        assert!(matches!(err, Error::Steamcmd(_)));
    }

    #[test]
    fn detect_prefers_configured_path() {
        let tmp = tempfile::tempdir().expect("tempdir");
        let exe = tmp.path().join("steamcmd.exe");
        std::fs::write(&exe, b"x").expect("write");
        let found = detect(Some(&exe.to_string_lossy())).expect("configured exists");
        assert_eq!(found, exe);
    }

    #[test]
    fn detect_none_when_configured_missing_and_nothing_installed() {
        let _guard = paths::TEST_ENV_LOCK
            .lock()
            .unwrap_or_else(|p| p.into_inner());
        let tmp = tempfile::tempdir().expect("tempdir");
        // SAFETY: TEST_ENV_LOCK serializes env-var mutating tests.
        unsafe {
            std::env::set_var(paths::DATA_DIR_ENV, tmp.path());
        }
        // Configured path does not exist; steamcmd_dir is empty. The repo
        // `tools/steamcmd/steamcmd.exe` is git-ignored and absent in CI.
        let got = detect(Some("Z:\\nope\\steamcmd.exe"));
        unsafe {
            std::env::remove_var(paths::DATA_DIR_ENV);
        }
        assert!(got.is_none(), "expected None, got {got:?}");
    }
}
