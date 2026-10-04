# Repository baseline evidence — `scrapup/warlog`

> Proof of the repository and process rules of [`spec.md`](../specs/warlog/spec.md) §3.11–§3.12
> (WL-50..WL-55, WL-76, SEC-01..SEC-20, SEC-26..SEC-30). Collected with `gh` (account with org
> admin) on 2026-10-03/04. SEC-31 is evidenced at the first release (US-104).

## Waivers (SEC-30)

None.

## Evidence

| Rule | Command / probe | Observed | Date |
|---|---|---|---|
| WL-50 | `gh api orgs/scrapup/memberships/EarthW0rm --jq .role` | `admin` | 2026-10-03 |
| WL-50 | `gh repo view scrapup/warlog` (before) | `Could not resolve to a Repository` | 2026-10-03 |
| WL-50 | `gh repo view scrapup/warlog --json visibility` | `PUBLIC` | 2026-10-03 |
| WL-51 | `git -C ~/Develop/scrapup/warlog remote get-url origin` | `git@github.com:scrapup/warlog.git` | 2026-10-03 |
| WL-52 | `git log --oneline origin/main \| wc -l` | `1` (`88ee643 chore: bootstrap repository`) | 2026-10-03 |
| SEC-06 | `gh api repos/scrapup/warlog --jq '{s:.allow_squash_merge,m:.allow_merge_commit,r:.allow_rebase_merge,t:.squash_merge_commit_title,a:.allow_auto_merge,w:.has_wiki,d:.has_discussions}'` | `s:true m:false r:false t:PR_TITLE a:false w:false d:false` | 2026-10-03 |
| SEC-09 | `gh api repos/scrapup/warlog/actions/permissions/fork-pr-contributor-approval` | `approval_policy: all_external_contributors` | 2026-10-03 |
| SEC-10 | `gh api repos/scrapup/warlog/actions/permissions/workflow` | `default_workflow_permissions: read` | 2026-10-03 |
| SEC-11 | `gh api repos/scrapup/warlog/actions/permissions/selected-actions` | `github_owned_allowed: true`, `verified_allowed: false`, patterns = P-04 | 2026-10-03 |
| SEC-17 | `gh api repos/scrapup/warlog --jq .security_and_analysis` | secret scanning + push protection `enabled`; `vulnerability-alerts` 204 | 2026-10-03 |
| SEC-18 | `gh api repos/scrapup/warlog/dependency-graph/sbom` | HTTP 200 (dependency graph enabled) | 2026-10-03 |
| SEC-20 | `gh api repos/scrapup/warlog/private-vulnerability-reporting` | `enabled: true` | 2026-10-03 |
| SEC-07 | `gh api orgs/scrapup/teams/scrapup/repos/scrapup/warlog --jq .permissions` | `push: true` | 2026-10-03 |
| SEC-29 | Dependency graph needed no UI action (public repo default); verified by API | — | 2026-10-03 |
| SEC-01, SEC-26 | `gh api repos/scrapup/warlog/rulesets --jq '.[]\|[.name,.enforcement]'` | `main-review active`, `main-integrity active`, `release-tags active` (created before the first PR) | 2026-10-03 |
| SEC-01 | `git push origin HEAD:main` (empty probe commit) | `GH013: Repository rule violations … Changes must be made through a pull request` — rejected | 2026-10-03 |
| SEC-03, SEC-04 | ruleset `main-review` | 1 approval, code-owner review, dismiss stale, thread resolution, squash; bypass `RepositoryRole 5` mode `pull_request` | 2026-10-03 |
| SEC-08 | ruleset `release-tags` (`refs/tags/v*`) | rules `update`, `deletion`; no bypass | 2026-10-03 |
| SEC-02 | `gh api repos/scrapup/warlog/rulesets/<main-integrity> --jq '.rules[]\|select(.type=="required_status_checks")\|.parameters'` | strict; `validate`, `dependency-review` (`integration_id` 15368); added after both reported on PR #1 head | 2026-10-04 |
| SEC-02, SEC-19 | `main-integrity` rule types | `deletion, non_fast_forward, required_linear_history, pull_request, required_status_checks, code_scanning` | 2026-10-04 |
| SEC-19 | `gh api repos/scrapup/warlog/code-scanning/default-setup` | `configured`, languages `[actions]` (JS/TS added in US-93); first analysis `CodeQL /language:actions`, 0 results; rule `code_scanning` CodeQL `high_or_higher` / `errors` | 2026-10-04 |
| SEC-05 | PR #1 retitled `update stuff` | `validate` **fail**; retitled to a Conventional Commit → `validate` pass | 2026-10-04 |
| SEC-03 | `gh pr view 1 --json reviewDecision,mergeStateStatus` | `REVIEW_REQUIRED`, `BLOCKED` | 2026-10-04 |
| SEC-04 | `gh pr merge 1 --squash --admin` | merged `4a00d24` with checks green; admin bypass used only for the approval (`main-integrity` has no bypass) | 2026-10-04 |
| SEC-01 | `git push origin HEAD:main` after protections complete | `GH013 … Changes must be made through a pull request` — rejected | 2026-10-04 |
| SEC-07 | `gh api repos/scrapup/warlog/codeowners/errors --jq '.errors\|length'` | `0`; `* @scrapup/scrapup`, team has `push` | 2026-10-04 |
| SEC-10 | `grep -c "^permissions: {}" .github/workflows/*.yml` | 1 per workflow; job-level minimum permissions; publish job `contents: read` + `id-token: write` | 2026-10-04 |
| SEC-12, SEC-13 | `grep -rnE "uses: [^@]+@v[0-9]" .github/workflows` | no output; every action pinned to the SHA of the latest release of its major (checkout v7.0.1, setup-node v7.0.0, dependency-review-action v5.0.0, action-semantic-pull-request v6.1.1, release-please-action v5.0.0) | 2026-10-04 |
| SEC-14 | `.github/dependabot.yml` | `github-actions` + `npm`, weekly Monday, limit 5; automated security fixes enabled | 2026-10-04 |
| SEC-15, SEC-16 | `release-please.yml` | `npm ci --ignore-scripts`; no tool fetched unpinned | 2026-10-04 |
| SEC-18 | `dependency-review.yml` | `fail-on-severity: moderate`; required check | 2026-10-04 |
| SEC-20 | `SECURITY.md` | supported: latest minor of `@scrapup/warlog`; private reporting link; release-then-advisory | 2026-10-04 |
| SEC-27 | Order of `main-integrity` updates | checks added only after reporting on PR #1; `code_scanning` added only after the first CodeQL analysis (CodeQL `actions` could not be configured before `main` had workflows — HTTP 422) | 2026-10-04 |
| SEC-28 | `git log --oneline origin/main` | `4a00d24 … (#1)`, `88ee643 chore: bootstrap repository` — every change after bootstrap via PR | 2026-10-04 |
| WL-53 | Rulesets created 2026-10-03 23:52; PR #1 opened afterwards | baseline active before the first PR | 2026-10-04 |
| WL-54 | PR #1 file list | `docs/specs/warlog/**`, CODEOWNERS, SECURITY.md, Dependabot, `pr-title`, `dependency-review`, `release-please`, guides | 2026-10-04 |
| WL-55 | `git log origin/main` | English Conventional Commits; no agent co-author trailer; explicit staging | 2026-10-04 |
| WL-76 | `head -1 README*.md`; `grep -c '^## '` | nav line first in EN/PT/JA; 8 sections each; `CLAUDE.md`, `CONTRIBUTING.md` present | 2026-10-04 |
| P-03, SEC-27 | `gh pr checks 3` then `main-integrity` update | `verify (ubuntu-latest)`, `verify (macos-latest)`, `verify (windows-latest)` reported pass on PR #3 head, then added to `required_status_checks` (with `validate`, `dependency-review`) | 2026-10-04 |
| P-03 | Probe PR #5 (undocumented method in `src/core/probe.ts`), closed unmerged | `verify` **fail** on the 3 OSes: `3:6 error Missing JSDoc comment jsdoc/require-jsdoc` | 2026-10-04 |

## Known open items

- Release PRs opened with `GITHUB_TOKEN` do not trigger `pull_request` workflows; the required checks must be satisfiable for the first Release PR — decided before US-104.
