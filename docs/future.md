# KnoxKit v2 — Future / Open Questions

> These are **open questions, not commitments.** Nothing here is on a
> roadmap with a date. The point is to capture *why* something was deferred
> and *what we'd need to decide* before doing it, so future-us doesn't
> re-derive the context from scratch. Everything below is explicitly **not
> in v1**.

## Linux support

**Why it matters.** Project Zomboid dedicated servers are very commonly
Linux-hosted. Community server admins are a real audience, and they live on
Linux boxes where a Windows-only launcher is useless to them.

**Open questions.**

- Is a *GUI launcher* even the right tool on a headless server, or do
  server admins want a **CLI** (`knoxkit instance launch`, `knoxkit
  modpack apply`) instead? Possibly both: GUI for desktop Linux users, CLI
  for server admins.
- What is the Tauri Linux build story for us specifically — GTK/WebKitGTK
  dependency matrix, and which artifact(s): AppImage, `.deb`, Flatpak? Each
  has different distribution and sandboxing tradeoffs.
- Does Linux SteamCMD's stdout match our parser fixtures
  (`docs/steamcmd-protocol.md`), or does it differ enough to need a
  platform-specific parser path? Workshop content paths
  (`~/.steam/steam/steamapps/workshop/...`) certainly differ from Windows.

**Action items (when picked up).**

1. Spike a `linux` target branch; get a Tauri build out (pick an artifact
   format).
2. Run the parser test suite against output captured from a *real Linux*
   SteamCMD; reconcile any line-shape differences in
   `docs/steamcmd-protocol.md` first.
3. Decide CLI vs GUI (or both) for the Linux audience before committing to
   UI work.

## macOS support

**Why it might work.** PZ is a Java app, so the game itself runs on macOS.
The blockers are tooling and platform layout, not the game.

**Open questions.**

- Does a stable **SteamCMD for macOS** exist and behave like the Windows
  one? (This is the make-or-break question.)
- Does the macOS Workshop content layout (`~/Library/Application
  Support/...` and Steam's Mac paths) match our path assumptions, or do we
  need a platform path module?
- What WKWebView-specific UI adjustments does the Tauri frontend need
  (scrollbars, drag regions, traffic-light insets)?

**Action items (when picked up).**

1. Verify SteamCMD-for-Mac exists and is stable; capture its stdout and
   diff against `docs/steamcmd-protocol.md`.
2. Verify the macOS Workshop / Steam directory layout against our
   assumptions.
3. Spike `aarch64-apple-darwin` (and `x86_64-apple-darwin` if Intel still
   matters) Tauri builds.

## Modpack registry

A hosted index so packs can be discovered and updated instead of passed
around as files. Undecided shape:

- **Self-hosted service** (full control, ops burden).
- **GitHub Releases as a poor-man's registry** (zero infra, awkward
  discovery/search).
- **Modrinth-style hosted index** (proven model, but it's a real product to
  build/run).

Decide later. The `.knoxpack` format (`docs/modpack-format.md`) already
reserves room for this so the format need not break to add it.

## Modpack auto-update

Given a registry (or a per-pack check-URL), match the local `pack_id`,
compare `version`, and offer an in-app "update available." Depends on the
registry decision above. The format's stable `pack_id` / human `version`
split already supports the matching logic.

## Modpack signing (Ed25519)

Optional detached **Ed25519 signature** over `knoxpack.json`, key-per-
author. Lets an importer detect tampered packs. Low priority while packs
are only Workshop-ID references (limited blast radius), but it becomes
important the moment non-Workshop sources land (next item).

## Non-Workshop sources

Allow workshop-item-equivalents from **direct URL / GitHub / GameBanana**.
This is a different, riskier download path: no Steam validation, more
attack surface, arbitrary remote content. Manifest signing matters much
more once this exists. Treat as a security-sensitive feature, not a quick
add.

## Browser-extension successor to KnoxLink

v1 had **KnoxLink**, a browser extension for one-click "add this Workshop
item to KnoxKit." Worth rebuilding — but only **after** the v2 modpack flow
(import/export/sync) is solid and the deep-link/command surface it would
target is stable. Premature to design the extension against a moving
target.
