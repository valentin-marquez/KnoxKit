/**
 * Conventional Commits configuration for KnoxKit v2.
 *
 * This is the CANONICAL config the CI `commitlint` job runs against PR
 * commit ranges. The human-readable rationale and good/bad examples live in
 * `docs/conventions.md` — keep the two in sync.
 *
 * ESM (`export default`) is required: the root `package.json` sets
 * `"type": "module"`, so a `.js` config using `module.exports` fails to
 * load. This file uses the `.mjs` extension + `export default` so
 * commitlint's cosmiconfig loader resolves it correctly under bun/node.
 *
 * Spec: Conventional Commits 1.0.0 — <type>(<scope>): <subject>
 *   - one scope only (multi-scope means the commit is too big — split it)
 *   - scope is optional, kebab-case
 *   - subject is imperative mood, no trailing period, <= 72 chars
 *   - body (optional) explains *why*, wrapped at 72 cols, after a blank line
 *   - footer (optional): `BREAKING CHANGE:` / `Refs: #123`
 *   - breaking changes also add `!` (e.g. `feat(modpack)!: ...`)
 */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Allowed commit types (lowercase). Anything else is rejected.
    "type-enum": [
      2,
      "always",
      ["feat", "fix", "chore", "docs", "refactor", "test", "perf", "build", "ci", "style"],
    ],
    // Type must be lowercase.
    "type-case": [2, "always", "lower-case"],
    "type-empty": [2, "never"],
    // Scope is optional, but when present must be kebab / lower-case.
    // Conventional scopes used in this repo:
    //   backend | frontend | modpack | steamcmd | ci | deps | docs
    "scope-case": [2, "always", "kebab-case"],
    // Subject: imperative mood, not Sentence/Title/PascalCASE/UPPERCASE.
    "subject-case": [2, "never", ["sentence-case", "start-case", "pascal-case", "upper-case"]],
    "subject-empty": [2, "never"],
    // No trailing period on the subject.
    "subject-full-stop": [2, "never", "."],
    // Header (`type(scope): subject`) hard cap.
    "header-max-length": [2, "always", 72],
    // Body / footer lines wrapped at 72 columns (warning, not blocking,
    // to stay friendly to URLs and BREAKING CHANGE blocks).
    "body-max-line-length": [1, "always", 72],
    "footer-max-line-length": [1, "always", 72],
  },
};
