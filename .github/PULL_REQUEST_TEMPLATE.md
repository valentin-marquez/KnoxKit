<!--
  Keep this PR focused. One scope per PR — if you touched more than one of
  backend / frontend / modpack / steamcmd, consider splitting.
-->

## What

<!-- A one-paragraph description of the change. -->

## Why

<!-- The motivation. What problem does this solve / what was wrong before? -->

## Conventional Commit type

<!-- Tick the type that matches this PR's primary change. -->

- [ ] `feat` — a new feature
- [ ] `fix` — a bug fix
- [ ] `chore` — tooling / housekeeping (no src behavior change)
- [ ] `docs` — documentation only
- [ ] `refactor` — code change that neither fixes a bug nor adds a feature
- [ ] `test` — adding or fixing tests
- [ ] `perf` — performance improvement
- [ ] `build` — build system / dependencies
- [ ] `ci` — CI configuration
- [ ] `style` — formatting only (no logic change)

## Checklist

- [ ] `just lint` is clean (Biome + clippy)
- [ ] `cargo test` is green
- [ ] Follows `docs/conventions.md` (path-is-namespace naming + Conventional Commits)
- [ ] Docs updated if behavior changed (`docs/` and any `// keep in sync` types)
