# Functional Specification: warlog — file-based memory and execution ledger for AI agents

> SDD Phase 1 — business intent (What / Why). Technology choices live in `plan.md` (Phase 2).
> Origin: brainstorming session of 2026-10-03 (approved design: architecture & layout, API surface,
> data flow & errors, testing). Repository: `github.com/scrapup/warlog` (to be created — §3.11).

## 1. Overview and Objective

- **The Problem:** AI coding agents lose their working memory between sessions and between
  machines. The current tracker used by the `scrapup` workflows keeps execution state in a single
  opaque local database: it cannot be read or edited by a human, cannot be versioned or audited,
  does not travel between the user's machines, and corrupts easily if placed in a synchronized
  folder. It also tracks only execution state: lessons learned, project know-how (commands that work
  or fail, known issues, how to run/debug/read logs), configuration toggles and post-execution
  reviews have no home, so every session rediscovers them.
- **The Solution (What):** **warlog** — a standalone tool that stores an agent's execution state
  **and** its accumulated knowledge as human-readable files in a user-configured folder, designed to
  be synchronized across machines. It offers the same operations as the current tracker (drop-in
  replacement for its consumers), plus: knowledge memories with a lifecycle, a project playbook,
  links and traceability, references to the user's task tracker, scoped variables usable as feature
  toggles, and questionnaires — with the After-Action Review (AAR) as a built-in questionnaire. Every
  operation is available identically to agents (tool protocol) and to humans/scripts (command line).
- **The Value (Why):** an agent resumes on any machine with the same state and the same lessons
  ("battle memory"); mistakes recorded once are not repeated; humans can read, edit, review and
  audit everything the agent remembers; the store is open (plain files) with no proprietary lock-in.

## 2. User Journeys

Actors:

- **Agent** — an AI coding agent session (e.g. Claude Code) calling warlog operations.
- **User** — the human who configures warlog, reads/edits the files and decides on conflicts.
- **Script** — a hook or shell script reading variables or recording data through the command line.
- **Sync service** — the third-party service that replicates the folder between machines.
- **Adopter / Validator** — who creates the repository and applies the security baseline (§3.11, §3.12).
- **System** — warlog itself.

**Main journey — resume work on another machine (global data via the sync service; repository data via the repository itself):**
1. On machine A, the Agent creates a project, epics, stories and tasks, updates statuses and adds
   notes and comments while executing.
2. The User versions the repository's `.warlog/` changes with the code; the Sync service replicates
   the global folder to machine B.
3. On machine B, after updating the repository, a new Agent session asks for the dashboard; the
   System returns the same state, including the next task to execute, plus the global lessons.

**Main journey — learn and reuse a lesson:**
1. An execution fails or deviates; the Agent decides an AAR is needed and answers the built-in AAR
   questionnaire linked to the task.
2. The Agent promotes one lesson from the AAR to a knowledge memory (scope: repository or global);
   the memory keeps a link back to the AAR.
3. In a later session, before acting, the Agent recalls memories for the topic and receives the
   lesson, ranked by scope specificity and recency.

**Main journey — ask the project playbook:**
1. The Agent asks "how do I run / test / debug / read logs in this repository?".
2. The System answers with the consolidated playbook: runbooks, commands known to work and to fail
   (per environment), open known issues and relevant patterns.
3. After running a relevant command, the Agent decides to record the outcome (works / fails), which
   updates the command's status for that environment.

**Alternative journey — feature toggle read by a script:**
1. The User sets `forge.parallel_executors = false` at repository scope; a global value `true` exists.
2. A Script runs `warlog var get forge.parallel_executors` and receives `false` (the most specific
   scope wins); the Agent asking the same variable also learns the scope it came from.

**Alternative journey — command line with a file:**
1. The User writes a note as a file and runs the note-save command pointing to it.
2. The System validates the file against the operation's contract and reports every error with file,
   line and field, writing nothing; or saves it. A validate-only mode checks without writing.
3. Every command, group and operation has built-in help with parameters and an example file.

**Alternative journey — traceability:**
1. Tasks are linked to their story, to the specification section they implement, to the tests that
   verify them, to commits and to the item key in the User's task tracker (e.g. Jira, ClickUp).
2. From any node, the Agent or User asks for the trace and receives the matrix
   use case ↔ story ↔ task ↔ test ↔ commit ↔ external tracker key.

**Main journey — register specification documents without spending context:**
1. The Agent (or User) points warlog to a document or to a whole opportunity folder
   (`docs/specs/<epic>/<opportunity>/`), produced by the SDD workflow or by hand, choosing the
   repository or the global area.
2. The System reads the files from disk itself, validates them, copies the documents and the
   diagram images (and their diagram sources) they reference, keeps the images rendering inside the
   stored Markdown, and answers with a short summary only (identifier, kind, sections, warnings).
3. Re-registering a changed document replaces it by default; when asked, the previous content is
   kept as an immutable version.
4. Later, the Agent asks for one section (or page) of a large document, searches inside it, lists the
   documents of an epic sorted by inclusion or last-change date, or exports a document back to disk —
   without loading the whole document into its context.

**Exception journey — synchronization conflict:**
1. Two machines changed the same entity before syncing; the Sync service produces a conflict copy.
2. The System excludes the conflict copy from its view, keeps working, and reports it in the
   dashboard and in the health check (`doctor`); the User resolves it by hand.

**Main journey — create the repository (one-time):**
1. The Adopter creates the public repository `scrapup/warlog` with the GitHub command-line client,
   from the local folder that already holds this specification.
2. The Adopter applies the security baseline (§3.12) in the safe order (SEC-26..SEC-28).
3. The first pull request contains the documentation (this spec, and plan/tasks when approved) plus
   the governance files; it is merged under the baseline.

## 3. Business Rules and Constraints

### 3.1 Store and scopes

| # | Rule | Type |
|---|---|---|
| WL-01 | All data lives as plain files. **Global** data lives under one root folder configured by the User (default location when none is configured), meant to be synchronized across machines. **Repository** data (including its projects and documents) lives by default in a `.warlog/` folder at the repository root and is **versioned with the repository**; the User can instead keep it out of version control or in the global root (WL-70) | Mandatory |
| WL-02 | Data has three scopes: **global**, **repository** and **project** (an execution project inside a repository). Repository data travels with the repository itself (`.warlog/`); when kept in the global root, a repository is identified by its normalized remote address, so it maps to the same data on every machine regardless of local path | Mandatory |
| WL-03 | A working directory that is not a repository gets no repository scope (global only); a repository without a remote using the global root gets a local-only key, and the System warns that it is not portable across machines | Conditional |
| WL-04 | **One file per entity** (project, epic, story, task, note, comment, memory, variable, questionnaire, response, template, documentation epic, opportunity, document); comments and activity records are append-only, and activity is written per machine, so two machines never write the same activity file | Mandatory |
| WL-05 | Entities are Markdown with a YAML front matter (structured fields in the front matter, free text in the body); variables are YAML. The format must stay readable and editable by hand and navigable by Markdown note tools (e.g. Obsidian) | Mandatory |
| WL-06 | No persisted index: the System rebuilds its view from the files at start and keeps it current when files change (other session, Sync service, hand edit) | Mandatory |
| WL-07 | Identifiers are generated locally, are unique across machines without coordination and sort by creation time | Mandatory |
| WL-08 | Deletion is soft (entity marked deleted, restorable); physical removal is a manual User action | Mandatory |
| WL-09 | warlog stores **no secrets**. Writing a value that matches a known secret pattern (token prefixes, private keys) is rejected | Restrictive |

### 3.2 Execution tracking (parity with the current tracker)

| # | Rule | Type |
|---|---|---|
| WL-10 | Every operation of the current tracker exists with the same name and the same semantics (tracker, project, epic, task, subtask, note, comment, template, activity, export/import, session diff, next task); a consumer switches by changing only the server it calls | Mandatory |
| WL-11 | Identifiers are opaque strings; consumers must not rely on numeric identifiers (none of the current consumers do) | Mandatory |
| WL-12 | Hierarchy: project → epic → **story** → task → subtask. Stories are new; creating a task with only an epic (current behavior) remains valid | Mandatory |
| WL-13 | Task dependencies keep the current behavior: a task with unfinished dependencies is blocked and is unblocked automatically when they finish; "next task" respects dependencies and priority | Mandatory |
| WL-14 | Import accepts the export of the current tracker (one-off import on demand; no automatic migration) | Mandatory |

### 3.3 Knowledge memory and lifecycle

| # | Rule | Type |
|---|---|---|
| WL-15 | A knowledge memory has a kind: `fact`, `decision`, `guardrail`, `pattern`, `command`, `known_issue`, `runbook`; each kind carries its own fields (e.g. `pattern`: paths it applies to; `command`: purpose, status works/fails/flaky per environment, last verification, known error; `known_issue`: symptom, cause, workaround, open/resolved; `runbook`: purpose run/debug/logs/deploy and steps) | Mandatory |
| WL-16 | Memories exist at global or repository scope; recall searches text, tags and scope and ranks the most specific scope and most recent first | Mandatory |
| WL-17 | Lifecycle: active → stale → superseded / archived. A review operation **lists candidates** (unused for a period, likely duplicates); nothing is consolidated, superseded or archived without an explicit call | Restrictive |
| WL-18 | Memory usage (recalls) and command outcomes are recorded as per-machine activity, never by rewriting the memory file; a command's status is derived from its latest observation per environment | Mandatory |
| WL-19 | Recording is **deliberate**: the Agent decides when to record a command outcome, an issue or a memory; warlog captures nothing automatically | Restrictive |
| WL-20 | The playbook operation returns, for the current repository: runbooks, commands that work and fail (per environment), open known issues and relevant patterns, optionally filtered by topic; a patterns-for-path operation returns the patterns that apply to a given file | Mandatory |

### 3.4 Links, traceability and external tracker references

| # | Rule | Type |
|---|---|---|
| WL-21 | Any entity can link to another entity or to an external reference (specification section, commit, test, URL) with a typed relation: `implements`, `tests`, `commit`, `derived_from`, `supersedes`, `relates`; links are navigable in both directions | Mandatory |
| WL-22 | The trace operation builds, from any node, the matrix use case ↔ story ↔ task ↔ test ↔ commit ↔ external key | Mandatory |
| WL-23 | Epics, stories and tasks can hold one or more references to items in the User's task tracker (system, key, URL); an item can be found by its external key | Mandatory |
| WL-24 | warlog **only references** external trackers: it never calls them, stores no credential for them and does not synchronize status | Restrictive |

### 3.5 Variables

| # | Rule | Type |
|---|---|---|
| WL-25 | Variables exist at global, repository and project scope; a read resolves project → repository → global, returns the value **and** the scope it came from; the whole value of the most specific scope wins (no deep merge across scopes) | Mandatory |
| WL-26 | A variable has a declared type: string, number, integer, boolean, array or object (nested to any depth); an optional structural schema validates objects/arrays; writing a value that does not match its type or schema is rejected; changing the type requires an explicit force | Mandatory |
| WL-27 | Dots in a variable name are namespaces; reading a field inside an object value uses a separate path argument | Mandatory |
| WL-28 | Typed values are read safely: values such as `no`, `off`, `012`, `1.10` keep the type they were written with (no implicit coercion) | Mandatory |

### 3.6 Questionnaires and After-Action Review

| # | Rule | Type |
|---|---|---|
| WL-29 | A questionnaire is defined at global or repository scope (repository overrides global for the same identifier) with a version and a list of questions; question types: short text, long text, single choice (optional "other"), multiple choice (min/max), checklist (each item ticked, optional all-required), list of items (min/max), yes/no, number (min/max, integer), rating scale, date | Mandatory |
| WL-30 | A question has an identifier, prompt, required flag, help text for whoever answers (Agent included) and an optional simple condition on previous answers | Mandatory |
| WL-31 | A response is linked to a subject (task, story, epic or project), stores a **copy of the questions** it answered (auditable after the questionnaire changes) and is rejected, with every invalid question listed, when required answers are missing or answers do not match their type | Mandatory |
| WL-32 | Any answer (or list item) can be promoted to a knowledge memory that links back to the response | Mandatory |
| WL-33 | A built-in global questionnaire `aar` exists: outcome (success / partial / failure), trigger, what was expected, what happened, why the difference, what to sustain (list), what to improve (list) | Mandatory |
| WL-34 | warlog does not decide **when** an AAR is opened; the triggering criteria belong to the consuming workflows | Restrictive |

### 3.7 Interfaces

| # | Rule | Type |
|---|---|---|
| WL-35 | Every operation is defined once and exposed identically through the agent tool protocol and the command line: same name, parameters, validation, behavior and errors. An operation cannot exist in only one interface | Mandatory |
| WL-36 | The command line accepts each operation's input from flags and/or a file (YAML, JSON, or Markdown with front matter; standard input allowed); flags override file fields; the file is validated before any write, and errors report file, line and field; a validate-only mode writes nothing | Mandatory |
| WL-37 | The command line has help at every level (all groups, a group's operations, an operation's parameters with type, required flag, default, description and an example input file) | Mandatory |
| WL-38 | Responses are compact for the Agent's context: lists as tables, single entities as front matter + body, an optional structured (JSON) output per call; read operations accept field selection and pagination; list defaults omit entity bodies | Mandatory |
| WL-39 | Command-line exit codes are stable: 0 success, 1 error, 2 not found, 3 validation, 4 conflict; scalar variable values print raw | Mandatory |
| WL-40 | Error categories are stable and shared by both interfaces: not found, validation, conflict, invalid file, secret rejected, no repository context | Mandatory |

### 3.8 Concurrency and synchronization safety

| # | Rule | Type |
|---|---|---|
| WL-41 | Writes are atomic: an interrupted write never leaves a partial file | Mandatory |
| WL-42 | Optimistic concurrency: an update based on a stale version of an entity is rejected with a conflict error carrying the current state; there is no silent last-write-wins | Restrictive |
| WL-43 | Conflict copies produced by sync services (Dropbox, Syncthing, iCloud naming patterns) and files left with version-control merge conflict markers are excluded from the view and reported; files that cannot be parsed are excluded, flagged as invalid and reported; the System keeps running | Mandatory |
| WL-44 | Links and dependencies to entities not (yet) present are kept as pending, not as errors (the target may still be syncing), and are reported | Mandatory |
| WL-45 | A health-check operation (`doctor`) lists conflict copies, merge-conflicted files, invalid files, pending links, broken or changed document references and memories due for review; it **never repairs anything automatically** | Restrictive |
| WL-46 | Conflict detection never depends on wall-clock agreement between machines. Every entity records its inclusion date and last-change date; these dates are used for sorting and history, never for conflict resolution | Mandatory |

### 3.9 Untrusted input (warlog-specific scope of SEC-21..SEC-24)

Untrusted inputs: files in the store (hand-edited or arriving from another machine), command-line
input files, documents and images registered by path (and the links inside them), operation arguments sent by an Agent, recall/search query text, path patterns of
`pattern` memories, variable values checked against secret patterns, repository remote addresses.

| # | Rule | Type |
|---|---|---|
| WL-47 | Search/recall text is matched literally, never interpreted as a pattern supplied by the caller | Restrictive |
| WL-48 | Every pattern match over untrusted input (secret detection, path patterns, conflict-copy names, remote normalization, front matter parsing) completes in linear time in the input length | Mandatory |
| WL-49 | Paths built from identifiers, names or scopes can never resolve outside the configured root folder | Restrictive |

### 3.10 Documents (specifications, plans, backlogs, diagrams)

| # | Rule | Type |
|---|---|---|
| WL-57 | warlog registers documentation files — `spec`, `plan`, `tasks`, `single-tasks`, plus `design`, `adr`, `other` — whether produced by the SDD workflow or not | Mandatory |
| WL-58 | Documents are organized as **epic → opportunity → documents**, mirroring `docs/specs/<epic>/<opportunity>/`. An opportunity holds at most one document of each kind and **either** `tasks` **or** `single-tasks`, never both; an epic holds many opportunities | Restrictive |
| WL-59 | The User chooses where documents are stored: the **repository** area or the **global** area; in both, documents are categorized by epic/opportunity. Document epics/opportunities are categories, distinct from execution epics; they can be linked to execution entities (project, epic, story) | Mandatory |
| WL-60 | Registration takes a **path** (one file or a whole opportunity folder); warlog reads and copies the files itself, so the content never passes through the Agent's context; the answer is a short summary | Mandatory |
| WL-61 | Images referenced by a document (relative links) are copied with it, together with their diagram sources when present beside them; links are rewritten so the stored Markdown still renders the images in Markdown viewers | Mandatory |
| WL-62 | Registration validates before writing: readable Markdown, every image link resolves, no link leaves the document's folder tree, no remote download, no secret patterns, size limits (WL-65); for SDD kinds also the expected sections and the US/TF heading format. Nothing is written when validation fails | Mandatory |
| WL-63 | Document content is stored **as is**: registration never edits, merges or derives tracker entities from it (only image links are rewritten, WL-61) | Restrictive |
| WL-64 | Re-registering a document **replaces** it by default; on request, the current content (with its images) is kept as an immutable numbered version before the replacement | Mandatory |
| WL-65 | Limits: **10 MB** per image/asset and **2 MB** per Markdown document; larger files are rejected | Restrictive |
| WL-66 | Every document has a section index (heading tree). Documents above **500 KB** are served only in pages or by section; any document can be searched inside, returning the matching sections | Mandatory |
| WL-67 | Epics, opportunities and documents record inclusion date and last-change date; listings and the document history timeline can be sorted and filtered by them | Mandatory |
| WL-68 | A registered document (and its images) can be exported back to a path on disk, again without passing through the Agent's context | Mandatory |
| WL-69 | Registration reads only paths inside the current repository working tree (repository area) or a path explicitly given by the User (global area); it never follows links outside the document's folder tree | Restrictive |

### 3.10.1 Repository storage, document references and agent skill

| # | Rule | Type |
|---|---|---|
| WL-70 | Repository storage mode is configurable per repository: **in-repository, versioned** (default), **in-repository, not versioned** (the User excludes `.warlog/` from version control), or **global root** | Mandatory |
| WL-71 | All working trees of one repository (e.g. parallel executors in separate worktrees) share the **same** repository data — the `.warlog/` of the main working tree — so state never diverges between worktrees | Mandatory |
| WL-72 | warlog **never** stages, commits, pushes or edits version-control ignore files; versioning `.warlog/` changes is the User's or the workflow's action | Restrictive |
| WL-73 | Documents can be registered in two modes: **copy** (default, WL-60..WL-61) or **reference** — only metadata, section index and content fingerprint are stored, pointing to the file's path inside the repository; reads use the live file. A referenced file that changed since registration is reported as changed (and its section index refreshed on read); one that moved or disappeared is reported as broken. Reference mode is allowed only for files inside the repository | Mandatory |
| WL-74 | warlog is distributed also as an agent plugin that registers the tool server and ships a **skill** describing the available operations, when to use each group and the usage rules (deliberate recording, no secrets, read sections instead of whole documents, re-read on conflict, force only with human authorization) | Mandatory |
| WL-75 | The skill's operation catalog is generated from the operation definitions; a check fails when the catalog and the operations diverge | Mandatory |

### 3.11 Repository creation and bootstrap

| # | Rule | Type |
|---|---|---|
| WL-50 | The repository `scrapup/warlog` is **public**, created with the GitHub command-line client (`gh`) by an authenticated account with admin rights on the `scrapup` organization; license MIT © 2026 scrapup | Mandatory |
| WL-51 | The local folder `~/Develop/scrapup/warlog` (holding this specification) becomes the repository's working copy | Mandatory |
| WL-52 | The default branch `main` starts with a minimal bootstrap commit (license, README, ignore file) pushed before any protection exists; it is the only direct push ever made to `main` | Conditional |
| WL-53 | The security baseline (§3.12) settings and enforcement rules are active **before** the first pull request is opened (SEC-26) | Mandatory |
| WL-54 | The **first pull request** carries the documentation (`docs/specs/warlog/`, WL-76 guides and READMEs) and the governance files (code owners, security policy, update automation, title check, dependency review, code scanning); required checks are made required only after they have reported on that pull request (SEC-27) | Mandatory |
| WL-55 | Artifacts follow the organization conventions: every versioned artifact in English; Conventional Commits; commits carry no agent co-authorship trailer; files staged explicitly one by one | Mandatory |
| WL-76 | The repository carries: an agent guide (`CLAUDE.md`) on how to contribute to and maintain the codebase; a README in **English, Portuguese and Japanese** (`README.md` source of truth, `README.pt.md`, `README.ja.md`), each opening with a language navigation line, structurally identical, with every README change replicated to the three files in the same commit; and a contribution guide (`CONTRIBUTING.md`) | Mandatory |
| WL-56 | Releases are automated from Conventional Commits (release PR merged by the Validator → tag, GitHub Release, package `scrapup/warlog` published with provenance); versions are never bumped by hand | Mandatory |

### 3.12 Repository security baseline (applied to `scrapup/warlog`)

**Parameters:**

| ID | Parameter | Value for `scrapup/warlog` |
|---|---|---|
| P-01 | Repository and visibility | `scrapup/warlog`, public |
| P-02 | Code-owner team (must have write access) | `scrapup/scrapup` |
| P-03 | Required quality checks (exact job names, frozen once required) | `verify (ubuntu-latest)`, `verify (macos-latest)`, `verify (windows-latest)` (type check, lint incl. documentation rules, unit tests with 95 % gate, integration, end-to-end, rule-coverage check); added to the required set only after the first code pull request reports them |
| P-04 | Approved third-party automation steps | `amannn/action-semantic-pull-request`, `googleapis/release-please-action` |
| P-05 | Release and publication steps to preserve | Release PR + tag + GitHub Release; npm publish of `scrapup/warlog` with provenance |
| P-06 | Dependency ecosystems under update automation | `github-actions`, `npm` |
| P-07 | Languages under code scanning | JavaScript/TypeScript, workflow files |
| P-08 | Supported versions / distribution channel in the security policy | Latest minor of `scrapup/warlog` on npm |
| P-09 | Tools executed by the pipeline outside the lockfile | None |
| P-10 | Untrusted inputs | §3.9 |

**Default branch governance:**

| # | Rule | Type |
|---|---|---|
| SEC-01 | `main` changes only via pull request: no direct push, no force-push, no deletion, linear history | Restrictive |
| SEC-02 | Merge requires every required check (title check, P-03, dependency review, code scanning) to pass on a branch up to date with `main` | Restrictive |
| SEC-03 | Merge requires 1 approval from a code owner; stale approvals dismissed on new pushes; all conversations resolved | Mandatory |
| SEC-04 | The admin may skip **only** the approval and **only** when merging a pull request; nobody, admin included, skips the checks or pushes directly | Restrictive |
| SEC-05 | Every pull request title is a valid Conventional Commit (feat, fix, docs, refactor, perf, test, build, ci, chore, revert); otherwise merge is blocked | Restrictive |
| SEC-06 | Squash merge only; squash commit title = pull request title; auto-merge off; wiki and discussions off | Mandatory |
| SEC-07 | A code-owner file assigns P-02 to every path, and P-02 has write access (otherwise the requirement silently has no effect) | Mandatory |
| SEC-08 | Release tags `v*` are created only by the release automation and can never be moved or deleted | Restrictive |
| SEC-09 | Automation triggered by a pull request from any external contributor (fork) runs only after a maintainer approves it | Restrictive |

**Automation and supply chain:**

| # | Rule | Type |
|---|---|---|
| SEC-10 | Automation permission is read-only by default; every workflow grants nothing at top level and each job declares the minimum permissions it needs | Mandatory |
| SEC-11 | Only platform-owned automation steps and P-04 may run; any other is rejected by the platform | Restrictive |
| SEC-12 | Every automation step is referenced by full commit identifier (human-readable version alongside); container images by content digest | Mandatory |
| SEC-13 | Pins follow the latest release of the major in use; major upgrades arrive only as update pull requests gated by the checks | Mandatory |
| SEC-14 | Update automation proposes updates for every P-06 ecosystem weekly (max 5 open pull requests per ecosystem) and security fixes as soon as published; update pull requests are never merged red | Mandatory |
| SEC-15 | Dependency installs in automation do not run install-time lifecycle scripts; a package that needs one gets a targeted rebuild, the global setting is never dropped | Mandatory |
| SEC-16 | Pipeline tools are pinned to exact versions, installed with scripts disabled, never fetched on demand unpinned | Mandatory |

**Scanning and disclosure:**

| # | Rule | Type |
|---|---|---|
| SEC-17 | Secret scanning, push protection and vulnerability alerts enabled; push protection bypassed only via the per-push flow by a human, never by disabling it | Mandatory |
| SEC-18 | A pull request adding a dependency with a known vulnerability of moderate severity or higher is blocked (no bypass); the dependency graph is enabled | Restrictive |
| SEC-19 | Code and workflow files (P-07) are scanned; a high/critical finding or a scanning error blocks the merge (no bypass) | Restrictive |
| SEC-20 | A security policy states supported versions (P-08), forbids public disclosure channels, points to private vulnerability reporting (enabled) and describes the release-then-advisory flow | Mandatory |

**Code-level controls (P-10):**

| # | Rule | Type |
|---|---|---|
| SEC-21 | Pattern matching over untrusted input runs in linear time: no overlapping quantifiers, no unbounded repetition of groups matching the same text, bounded counts where the format allows; trimming via index scans | Mandatory |
| SEC-22 | Each such matcher has an adversarial test (pathological input ≥ 20 000 characters under a fixed time budget) plus equivalence cases | Mandatory |
| SEC-23 | Validators and parsers fail closed: input outside the expected shape is rejected, never passed through | Mandatory |
| SEC-24 | A safety check is never loosened to fix a finding; security fixtures are never edited to make a change pass | Restrictive |
| SEC-25 | Static-analysis findings are triaged: real ones fixed with a test; false positives closed with a written justification attached to the finding | Mandatory |

**Adoption order (new repository):**

| # | Rule | Type |
|---|---|---|
| SEC-26 | `main` is never unprotected once the bootstrap commit exists: enforcement rules are active before the first pull request | Mandatory |
| SEC-27 | A check becomes required only after it has reported at least once under its exact name | Mandatory |
| SEC-28 | All versioned changes after the bootstrap commit enter through pull requests, prepared in isolation from uncommitted local work | Mandatory |
| SEC-29 | Settings only a human can perform on the platform are performed by the Validator; the Adopter verifies the result and never works around the limitation | Mandatory |
| SEC-30 | Any deviation from a SEC rule is an explicit waiver (rule, reason, compensating control) approved by the Validator and recorded in `plan.md` | Mandatory |
| SEC-31 | The release flow (P-05) works end to end on the first release; a break is fixed by the minimum permission/allowlist change through a pull request, never by a bypass | Mandatory |

## 4. Edge Cases and Exception Flows (Zero Trust)

| Scenario | Expected Behavior | Severity |
|---|---|---|
| Root folder not configured and default not writable | Fail fast at start with a clear message naming the folder; no partial structure | High |
| Working directory without git remote | Local-only scope, warning returned with every response of that session (WL-03) | Medium |
| Two Agent sessions on the same machine update the same task | One succeeds; the other gets a conflict with the current state and must re-read (WL-42) | High |
| Process killed during a write | No partial or empty file remains; previous content intact (WL-41) | Critical |
| Sync conflict copy appears | Excluded from the view; reported in dashboard and `doctor` (WL-43) | High |
| Hand-edited file with broken front matter / YAML | File excluded and flagged invalid; other data keeps working; reported (WL-43) | High |
| Task depends on an entity not yet synced | Dependency kept as pending; task stays blocked; reported (WL-44) | Medium |
| Variable read with no value in any scope | Not-found error (exit 2); never an implicit default | Medium |
| Variable write changes type (e.g. boolean → string) | Rejected unless forced (WL-26) | High |
| Variable value hand-edited to a different type | File flagged invalid; read returns invalid-file error (WL-28) | High |
| Value or note matches a secret pattern | Rejected with secret-rejected error; nothing written (WL-09) | Critical |
| Response missing a required answer or with an invalid option | Rejected; every invalid question listed (WL-31) | Medium |
| Questionnaire changed after responses exist | Old responses keep their copied questions and stay valid (WL-31) | Medium |
| Command-line input file invalid | Exit 3 with file, line and field; nothing written (WL-36) | Medium |
| Identifier or name crafted to escape the root folder (`../`) | Rejected (WL-49) | Critical |
| Pathological search text or path pattern (very long, repetitive) | Completes in linear time; treated literally (WL-47, WL-48) | Critical |
| Two machines change the same versioned `.warlog/` file and merge | Merge conflict markers → file excluded, flagged, reported by `doctor`; User resolves (WL-43) | High |
| Parallel executors in different worktrees update tasks | All write to the main working tree's `.warlog/`; optimistic concurrency applies (WL-71, WL-42) | High |
| Referenced document edited after registration | Reported as changed; section index refreshed on read (WL-73) | Low |
| Referenced document moved or deleted | Reported as broken by `doctor` and on read; no data lost in warlog | Medium |
| Clock skew between machines | No effect on conflict detection; may only change the displayed order of history (WL-46) | Low |
| Opportunity folder with both `tasks.md` and `single-tasks.md` | Rejected; nothing registered (WL-58) | High |
| Document references a missing image | Rejected with the missing links listed (WL-62) | Medium |
| Image link pointing outside the document folder (`../../`) or to a remote URL | Rejected (WL-62, WL-69) | Critical |
| Document above 2 MB or asset above 10 MB | Rejected with size and limit (WL-65) | Medium |
| Document above 500 KB requested whole | Returns the section index and the first page; full content only by page/section (WL-66) | Low |
| Re-registration without versioning request | Previous content replaced; last-change date updated (WL-64) | Low |
| Same image name referenced by two documents of one opportunity with different content | Stored once per document; no silent overwrite across documents | Medium |
| Import of a malformed tracker export | Rejected before writing; report of invalid records | High |
| `gh` not authenticated or lacking org admin | Stop before creating anything; report the error; no alternative credentials | High |
| Repository name `scrapup/warlog` already taken | Stop; report; no rename without the User's decision | High |
| A required check never reports (renamed job, workflow not triggered) | Not made required until it reports (SEC-27); a rename updates the rules in the same pull request | Critical |
| Enabling secret scanning surfaces a secret in the bootstrap or first PR | Push rejected/alert raised; secret removed and commit rewritten locally; never bypassed | Critical |

## 5. Success Criteria and SLAs

**Functional criteria:**

- [ ] Every operation of the current tracker passes a parity contract: same names and required
      parameters, and the same scenario (projects, dependencies, auto-block/unblock, next task, soft
      delete/restore, session diff) produces equivalent results on both, after normalizing
      identifiers and timestamps (WL-10..WL-13)
- [ ] Every operation exists in both interfaces with identical parameters and behavior (WL-35)
- [ ] Journeys of §2 executed end to end, including two processes on one folder and simulated sync
      conflicts
- [ ] Rules WL-01..WL-49 and WL-57..WL-75 validated by automated tests; WL-50..WL-56 and WL-76 by recorded repository evidence; WL-48 / SEC-21 matchers have adversarial tests
- [ ] Repository `scrapup/warlog` exists, public, with the first pull request (documentation +
      governance files) merged under the baseline
- [ ] Every SEC rule evidenced from the platform (active rulesets, settings, security features,
      probes: direct push rejected, invalid PR title blocked) or covered by an approved waiver
- [ ] First release produces tag, GitHub Release and the npm package with provenance (SEC-31)

**SLAs:**

- Start-up indexing of the store: **≤ 5 s** for a store of up to **10 000 entity files** (volume confirmed by the Validator).
- Other operation latencies: not SLA-bound in this phase; measured and reported in `plan.md`.

**Quality criteria:**

- [ ] Every class, method, function, attribute/property and exported type carries documentation
      comments (purpose, parameters, return, errors raised); enforced automatically
- [ ] Unit tests cover at least **95 %** of statements, branches, functions and lines (unit suite
      alone); the build fails below it
- [ ] Single responsibility: one responsibility per unit (one handler per operation, one adapter per
      transport); dependencies are injected, never created inside the unit, so every unit is testable
      in isolation
- [ ] Integration tests (real files, real version control) and end-to-end tests of **both**
      interfaces (command line and agent tool protocol, run as real processes)
- [ ] **Every implementation is proven:** each code-level rule (WL-xx, SEC-21..SEC-24) has at least
      one automated test that names the rule; a check fails when a rule has no test; repository and process rules
      (SEC-01..SEC-20, SEC-25, SEC-26..SEC-31) are proven by recorded platform evidence and probes
- [ ] CI green on `main`; `verify` required after it first reports

## 6. Glossary

| Term | Definition in this context |
|---|---|
| Store | The configured root folder holding all warlog files |
| Scope | Visibility level of data: global, repository, project |
| Repository key | Normalized remote address identifying a repository across machines |
| Current tracker | The existing database-backed tracker (`mcp-saga`) used by the `scrapup` workflows |
| Parity | Same operation names and semantics as the current tracker |
| Knowledge memory | A durable lesson or piece of project know-how, typed by kind, with a lifecycle |
| Playbook | Consolidated answer on how to work in a repository (run, test, debug, logs, issues, patterns) |
| Variable | Typed, scoped value; a boolean variable used to switch behavior is a feature toggle |
| Questionnaire | Versioned definition of typed questions; a response answers it for a subject |
| AAR | After-Action Review: expected / happened / why the difference / sustain-improve |
| Conflict copy | Duplicate file created by a sync service when two machines changed the same file |
| Pending link | Link to an entity not present (yet) in the store |
| Bootstrap commit | The single initial commit pushed to `main` before protection exists |
| Opportunity | A unit of work inside a documentation epic holding one spec, one plan and one backlog (`tasks` or `single-tasks`) |
| Document version | Immutable copy of a document and its images kept on request before replacement |
| Section index | Heading tree of a document used to read or search parts of it |
| Waiver | Approved, recorded deviation from a SEC rule with reason and compensating control |

## 7. Out of Scope

- Secrets management of any kind (WL-09).
- Calling or synchronizing with external task trackers (WL-24).
- Automatic capture of commands or events (WL-19); deciding when an AAR is opened (WL-34).
- Automatic migration from the current tracker (only on-demand import, WL-14).
- Semantic/embedding search.
- Changing any `scrapup` skill or agent to use warlog — warlog is isolated; see §8.
- Organization-level GitHub settings.
- Staging, committing or pushing `.warlog/` changes (WL-72).

## 8. Candidate Benefits for `scrapup` (informative, not in scope)

Features that `scrapup` workflows could adopt later, each in its own specification:

| Capability | Candidate use in `scrapup` |
|---|---|
| Parity + portable store | `forge`, TDAD, `mimic-loop` resume a run on another machine; state reviewable by the Validator as files |
| AAR questionnaire | `forge` / `mimic-loop` open an AAR on a blocked task, repeated test failure, critical review finding or GUTTER signal; lessons promoted to guardrails |
| `guardrail` memories | Replace the accumulated guardrails carried in `forge` briefings; recalled per repository |
| Playbook + `command` memories | Replace the `toolchain` / `baseline` context notes of `forge` and `baseline-assessment`; commands known to fail are not retried blindly |
| `patterns_for(path)` | Executors and reviewer lenses (homogeneity, architecture) load repository patterns before editing/reviewing a file |
| `known_issue` | Reviewer findings and recurring failures become tracked issues with workaround and resolution link |
| Stories + external references | `blueprint` US/TF map to stories/tasks; `expert-clickup` records the tracker key back |
| Trace | Roadmap item (5): traceability matrix use case ↔ task ↔ test ↔ commit |
| Questionnaires | LCO gate checklist for `inception`; milestone seal (LCO/LCA/IOC/Release) recorded as a Validator response; per-task risk questionnaire for roadmap item (1) |
| Document registry | `blueprint` registers spec/plan/tasks and diagrams after each approval; `forge` executors read only the TF section they need (section reads) instead of the whole `tasks.md` |
| Variables / toggles | Per-repository switches for skill behavior (e.g. parallel executors, review lenses enabled) readable by skills and hooks |

---

> Status: **Approved** (2026-10-03) — Validator. **Amendment 1 (2026-10-03, approved):** §3.10 Documents (WL-57..WL-69), WL-46 reworded (dates used for sorting/history). **Amendment 2 (2026-10-03, approved):** in-repository `.warlog/` storage versioned by default, shared across worktrees, document reference mode, agent plugin + skill (WL-01..WL-03, WL-43, WL-45 reworded; WL-70..WL-75).
