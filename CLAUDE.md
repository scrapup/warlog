# CLAUDE.md

This file guides agents (Claude Code) contributing to and maintaining this repository.

## Purpose

**warlog** is a file-based memory and execution ledger for AI coding agents: execution state
(projects → epics → stories → tasks), knowledge memories, playbook, links/traceability, typed
variables, questionnaires (AAR) and a document registry, stored as plain files. Every operation is
exposed identically through an MCP tool server and a CLI.

Source of truth: [`docs/specs/warlog/spec.md`](docs/specs/warlog/spec.md) (what/why, rule IDs
`WL-xx`/`SEC-xx`), [`plan.md`](docs/specs/warlog/plan.md) (how) and
[`tasks.md`](docs/specs/warlog/tasks.md) (backlog US-92..US-104). New work MUST NOT contradict
them; when it must, amend the spec/plan first.

**Non-goals:** secrets management; calling or syncing external trackers; automatic capture of
events; semantic search; staging/committing/pushing `.warlog/` changes.

## Current state

Package scaffold and quality gates (US-93): `src/bin/warlog.ts` (entry point),
`eslint.config.js`, `jest.config.ts` (projects `unit`, `integration`, `e2e-cli`, `e2e-mcp`,
`bench`), `scripts/rules-coverage/**` (rule proof check) and `scripts/verify-local.ts`; CI job
`verify` on Linux, macOS and Windows. Core storage foundation (US-94): `src/core/errors` (`WarlogError`), `src/core/ports` (side-effect
interfaces), `src/core/adapters` (Node implementations), `src/core/security` (linear matchers,
identifier validation, `PathGuard`), `src/core/git` (read-only `GitCliClient`, repository locator),
`src/core/storage` (YAML/front-matter codecs, store roots, entity paths, `EntityFileRepository`,
`ActivityLog`). Mediator and interfaces (US-95): `src/core/mediator` (registry, `buildPipeline` (the single ordered pipeline),
behaviors ErrorMapping → Context → Validation → SecretGuard → Activity, `StoreContextFactory`),
`src/core/presenter` (table/YAML/JSON rendering, field projection, cursors),
`src/adapters/shared/execute-operation.ts` (the single call path of both interfaces),
`src/adapters/mcp` (low-level SDK `Server`, one tool per registry entry), `src/adapters/cli`
(commander program generated from the registry: flags, `--file`, `--json-input`, `--validate`,
help, exit codes), `src/compose/**` (composition roots) and `src/domain/operations.ts` (product
registry content; field names reserved by the interfaces are rejected by the registry). Index (US-96):
`src/core/ports/store-view.port.ts` (read-only `StoreView` and `IndexSource` seen by operations),
`src/core/index` (`IndexBuilder` scans both roots with bounded concurrency, never following links
and refusing files above 2 MiB; `StoreIndex` view with relations, pending links and excluded
files; `WatcherService` with per-root rescan fallback; `IndexProvider` — lazy point reads in the
CLI, live index with watcher in the MCP server, `load: point` enforced in both) and
`src/domain/health` (`doctor`). Tracker (US-97): `src/domain/{project,epic,story,task,subtask,note,comment,template,tracker}` —
the `mcp-saga` operations with identical names, parameters, enums and defaults (ids are ULID
strings) plus stories and `note_restore`; `src/domain/shared` (`TrackerWriter`: writes through
`EntityFileRepository`, refreshes the view for read-your-writes and queues activity; lookup,
project/branch scope, literal token search, result rows); `task/dependency-engine.ts` (pure
block/unblock and cycle rules); `IndexSource.lookup`/`refresh` and `StoreView.ofType`;
`core/index/activity-reader.ts` (raw activity for `activity_log`, session diff, dashboard). The saga
parity contract (`test/integration/saga-parity.test.ts`) compares against fixtures captured from a
real `saga-mcp` by `scripts/capture-saga-fixtures.ts` — never edit them by hand. Variables (US-98): `src/domain/var` (`VarRepository` point reads/atomic writes of
`vars/<name>.yaml` per scope, strict type checks without coercion, `restricted-schema-validator`
over `ajv` with a keyword allow-list, `var_get/set/list/delete`); an operation may declare
`positional` (first CLI argument, same field as its flag) and an object result may carry `raw`
(printed alone unless a format or fields are requested). Test doubles live in `test/support/fakes`; fixture
operations (`test/support/fixture-operations.ts`) drive the interface-parity test. Document the real structure here as it
lands. `scripts/rules-pending.txt` lists code-level rules not yet proven —
each story removes the rules it proves.

**Source conventions:** relative imports use the `.ts` extension (rewritten to `.js` on build);
erasable TypeScript syntax only (no enums, no constructor parameter properties); Node ≥ 22 runs
`scripts/*.ts` directly.

## Architecture (planned — plan §1, §4, §7; materialized from US-93 on)

- One npm package `@scrapup/warlog`: a core library plus two thin adapters (MCP over stdio, CLI).
- **Operation registry → mediator → behaviors → handler.** Each operation is defined once (name,
  CLI path, kind, zod input, description, example, default format, load mode, handler). The
  mediator runs the pipeline ErrorMapping → Context → Validation → SecretGuard → Activity → handler.
  Adapters contain no business rules.
- **Ports and adapters:** every side effect behind a port (`FileSystem`, `Clock`, `IdGenerator`,
  `GitClient`, `MachineIdProvider`, `Env`, `Logger`, `Watcher`); constructor injection only; one
  composition root per entry point (`src/compose/compose-mcp.ts`, `src/compose/compose-cli.ts`).
- **Persistence:** one file per entity, atomic writes (temp + fsync + rename), optimistic
  concurrency via `rev`, in-memory index rebuilt from files (no persisted index), file watcher.
- **Where things live:** `src/core/**` (ports, adapters, security, storage, git, mediator,
  presenter, index), `src/domain/<group>/**` (operation definitions, handlers, repositories,
  schemas), `src/adapters/{mcp,cli}/**`, `src/compose/**`, `src/bin/warlog.ts`,
  `test/{unit,integration,e2e-cli,e2e-mcp,bench}/**`, `scripts/**`.

## Conventions

- **English** for every versioned artifact (code, comments, docs, commits, PRs, issues).
- **Conventional Commits**; PR title is a Conventional Commit (checked by `pr-title`); squash merge.
- **Explicit staging**, file by file — never `git add .` / `git add -A`. Never `--no-verify`.
- **No agent co-author trailer** in commits — authorship is human.
- **JSDoc on everything** (classes, methods, functions, properties, type members) — enforced by lint.
- **95 % unit coverage** (statements, branches, functions, lines), unit project alone.
- **Rule IDs in test titles:** `it('[WL-42] rejects an update with a stale rev', …)`; every
  code-level rule needs at least one passing test (`rules:coverage`).
- **ESLint guard rails:** no `any`, complexity ≤ 10, function ≤ 60 lines, file ≤ 300 lines, one class
  per file, domain code never imports `node:fs`/`node:child_process` or adapters; no
  `eslint-disable` in `src/**`.
- **README is trilingual:** `README.md` (source of truth), `README.pt.md`, `README.ja.md`; every
  README change is replicated to the three files in the same commit, structurally identical, with
  technical terms kept in English.
- **Never bump versions by hand** — release-please owns them.
- **Workflows:** every `uses:` pinned to a full commit SHA with `# vX.Y.Z`; `permissions: {}` at the
  top, minimum permissions per job; installs with `--ignore-scripts`.

## npm scripts

`build`, `typecheck`, `lint`, `test:unit`, `test:integration`, `test:e2e`, `bench`,
`rules:coverage`, `verify:local` (runs the same steps as the CI `verify` job); `gen:skill`
arrives with US-103.

## Adding an operation

1. Definition (`*.operation.ts`) with zod input, description and an example input.
2. Handler (`*.handler.ts`) with domain logic only; dependencies via constructor.
3. Unit tests named with the rule IDs it proves; integration/e2e when it touches a flow.
4. Register it in `src/domain/operations.ts`; the interface-parity test must stay green.
5. Regenerate the skill catalog (`npm run gen:skill`) and commit the result.
6. Update the three READMEs when user-visible behavior changes.

## Release flow

Feature/fix PRs are squash-merged to `main`; release-please opens/updates a Release PR; merging it
(the human-sealed gate) creates the tag `vX.Y.Z`, the GitHub Release and publishes
`@scrapup/warlog` to npm with provenance. Tags `v*` are immutable.
