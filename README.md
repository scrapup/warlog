🌐 **English** | [日本語](./README.ja.md) | [Português](./README.pt.md)

# warlog

> File-based memory and execution ledger for AI coding agents.

## What warlog is

AI coding agents lose their working memory between sessions and between machines. **warlog** keeps
an agent's execution state **and** its accumulated knowledge as human-readable files (Markdown with
YAML front matter) in folders you control:

- **Execution tracking** — projects, epics, stories, tasks, subtasks, notes, comments, templates and
  dependencies, as a drop-in replacement for the `mcp-saga` tracker used by the `scrapup` workflows.
- **Battle memory** — typed knowledge memories (facts, decisions, guardrails, patterns, commands,
  known issues, runbooks) with a lifecycle, recalled by relevance.
- **Project playbook** — how to run, test, debug and read logs in a repository, with commands known
  to work and to fail per environment.
- **Links and traceability** — use case ↔ story ↔ task ↔ test ↔ commit ↔ external tracker key.
- **Typed, scoped variables** — usable as feature toggles by agents, hooks and scripts.
- **Questionnaires** — including a built-in After-Action Review (AAR).
- **Document registry** — specs, plans, backlogs and diagrams registered by path and read by section.

Every operation is exposed identically to agents (MCP tool server) and to humans and scripts
(command line).

## Status

**Pre-release — not yet published.** The specification, plan and backlog live in
[`docs/specs/warlog/`](./docs/specs/warlog/). Nothing below is available until `v0.1.0`.

## Installation

> Available from `v0.1.0`.

**Via npm** — the package `@scrapup/warlog`:

```bash
npm install -g @scrapup/warlog
```

**As a Claude Code plugin** — registers the `mcp-warlog` server and the `warlog` *skill*:

```bash
/plugin marketplace add scrapup/warlog
/plugin install warlog
```

## Quick start

> Available from `v0.1.0`.

```bash
warlog --help                          # help at every level: groups, operations, parameters
warlog var set forge.parallel_executors --value false --scope repo   # typed; --value true keeps its type
warlog var get forge.parallel_executors  # scalar printed raw; project > repository > global wins
warlog memory recall --query "windows paths"   # lessons first: repository scope, matches, recency
warlog playbook test                   # how to run/test here, commands that work or fail
warlog patterns-for src/a.ts           # patterns that apply to a file
warlog mcp                             # start the MCP server over stdio
```

Manual MCP registration:

```json
{ "mcpServers": { "mcp-warlog": { "command": "npx", "args": ["-y", "@scrapup/warlog", "mcp"] } } }
```

## Switching from `mcp-saga`

warlog offers every `mcp-saga` tool with the same name, parameters, enums and defaults, so a workflow
switches by pointing at `mcp-warlog` instead. The deliberate differences:

- Identifiers are opaque strings (ULIDs), not integers.
- `note_delete` is a soft delete; `note_restore` brings a note back.
- Stories sit between epics and tasks (`story_*`); `task_create` accepts `story_id`, and `epic_id`
  becomes optional when a story is given.
- Existing state comes over on demand: `tracker_export` from `mcp-saga`, then `tracker_import` in
  warlog (every id is remapped; an invalid export writes nothing).

## Storage model

| Root | Location | Holds | Travels via |
|---|---|---|---|
| Global | `$WARLOG_DIR` (default `~/.warlog`) | Global memories, variables, questionnaires, templates, global documents | A sync service of your choice |
| Repository | `.warlog/` at the main *worktree* of the repository | Repository memories, variables, projects, documents | The repository itself (versioned by default) |

All *worktrees* of one repository share the same `.warlog/`. warlog never stages, commits or pushes
`.warlog/` changes — versioning them is your decision.

## Security

warlog stores **no secrets**: values matching known secret patterns (tokens, private keys) are
rejected. It makes no network calls and never contacts external trackers. Report vulnerabilities
privately as described in [SECURITY.md](./SECURITY.md).

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). Agents working on this codebase follow
[CLAUDE.md](./CLAUDE.md).

## License

[MIT](./LICENSE) © 2026 scrapup
