# Contributing to warlog

Thanks for your interest in warlog — a file-based memory and execution ledger for AI coding agents.
This guide covers setup, the conventions we enforce and how changes flow to a release.

## Ways to contribute

- **Issues** — report bugs, propose enhancements, or open an RFC for a larger change.
- **Pull requests** — fixes, features, documentation, tooling.

For anything non-trivial, open an issue first so the direction is agreed before implementation.
Behavior is specified in [`docs/specs/warlog/`](docs/specs/warlog/); changes that alter it start by
amending the specification.

## Prerequisites and setup

- Node.js from [`.nvmrc`](.nvmrc) (`nvm use`); `engines.node` is `>=22`.

```bash
git clone git@github.com:scrapup/warlog.git
cd warlog
nvm use
npm ci --ignore-scripts
```

## Branching and pull requests

1. Branch from `main` (e.g. `feat/...`, `fix/...`, `docs/...`).
2. Open a PR against `main`.
3. The **PR title must be a Conventional Commit** — with squash merge it becomes the commit on
   `main` and drives versioning. The `pr-title` check enforces it.
4. A code-owner review ([CODEOWNERS](.github/CODEOWNERS)) is required; all conversations resolved.
5. PRs are **squash-merged** using the PR title. `main` accepts changes only through PRs.

## Local checks

Run the same steps as the CI `verify` job before opening a PR:

```bash
npm run verify:local
```

It runs type check, lint (including JSDoc and design rules), unit tests with the 95 % coverage
gate, build, integration tests, end-to-end tests (CLI and MCP), the rules-coverage check and the
benchmarks.

## Conventions

- **English** for every versioned artifact. `README.md` is the source of truth; `README.pt.md` and
  `README.ja.md` are updated **in the same commit**, structurally identical, technical terms kept
  in English.
- **[Conventional Commits](https://www.conventionalcommits.org/)**: `type(scope): subject`. Types:
  `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- **JSDoc** on every class, method, function, property and type member.
- **Tests name the rules they prove**: `it('[WL-42] …')`.
- **Never bump versions by hand** — release-please owns `package.json` and the plugin manifests.

## Definition of Done

- JSDoc complete; unit coverage ≥ 95 %.
- Every rule ID of the change proven by a named test.
- Integration/e2e tests updated when the change touches a flow.
- `verify` green on Linux, macOS and Windows.
- Evidence (command + output summary) attached to the PR.

## Code scanning

CodeQL findings are triaged in [`docs/evidence/codeql-triage.md`](docs/evidence/codeql-triage.md):
real findings are fixed with a test; false positives are closed with a written justification.

## Reporting vulnerabilities

Never in public issues or PRs — follow [SECURITY.md](SECURITY.md).

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
