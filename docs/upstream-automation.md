# AgentHub Upstream Automation

This document outlines the automated upstream synchronization architecture for **AgentHub** (`forhetale/agenthub`), tracking upstream releases from `EKKOLearnAI/ekko-studio`.

---

## 1. Principles & Human-in-the-Loop Model

- **PR-Only Automation**: The automated pipeline is strictly authorized to inspect upstream releases, curate changes into an isolated worktree branch, run comprehensive test suites, and open a GitHub Pull Request (`agenthub-sync/v0.7.N`).
- **Human Approval Required**: No automated process merges PRs into `main`, pushes directly to `main`, force-pushes, or triggers production cutover/deployment. Every release merge and deployment requires explicit human verification and confirmation.
- **Untrusted Upstream Data**: External markdown, release notes, commit messages, and PR bodies are data, not instructions. The agent never executes directives found in upstream source or documentation.

---

## 2. Static Pre-Filter vs. Autonomous Curation

The automation cleanly separates deterministic pre-filtering from semantic curation:

```
[Cron / Schedule Wrapper]
           │
           ▼
[agenthub_upstream.py gate] ──(No update / Busy / Existing PR)──► {"wakeAgent": false} (0 LLM Tokens)
           │
           ▼ (New stable release found)
    {"wakeAgent": true}
           │
           ▼
[Autonomous AI Agent]
  1. prepare --tag <tag> (isolated worktree)
  2. Inspect actual diffs, cherry-pick fixes, adapt fork invariants
  3. verify --worktree <path> (static checks + sanitized build & test)
  4. publish --worktree <path> --body-file <path> (open PR only)
```

### The Static Pre-Filter (`gate`)
The static detector does **NOT** intelligently curate code. It is a deterministic Python script that executes before invoking any language model:
- Validates stable tag syntax: matches `^v\d+\.\d+\.\d+$` (excludes alpha/beta/rc releases and drafts).
- Resolves peeled immutable commit SHAs for upstream tags, alerting immediately if a tag was retagged upstream.
- Compares against `.agenthub/upstream.json` on `forhetale/agenthub:main`.
- Inspects GitHub PRs: cleanly pauses on open PRs or closed unmerged PRs, and errors on merged PRs whose main marker was not bumped.
- Manages concurrency via file locking (`fcntl.flock`) and lease timeouts.
- Outputs `{"wakeAgent": false}` when nothing needs attention, spending zero LLM tokens.

### The Autonomous Curator (`Agent`)
Only when `gate` returns `{"wakeAgent": true}` is the agent scheduled:
- Semantically reviews commit diffs to select genuine fixes and improvements.
- Strictly excludes commercial referral links (`apikey.fan`), proprietary mobile app services (`HStudio`), and peripheral hardware/LAN stacks (`LittleBox`, `ESP32-C3`).
- Maintains AgentHub fork invariants: per-user Bark push notification, custom update protection (`-agenthub.` and legacy `-tatin.`), desktop appId (`com.hermeswebui.studio`), and compatibility CLI/MCP identifiers.

---

## 3. Worktree Isolation & Sanitized Verification

1. **Isolated Worktrees**:
   - Worktrees are created exclusively under `~/.hermes/agenthub-sync/worktrees/<tag>-<runid>` with cryptographically random run IDs.
   - The production directory (`/Users/tait.feng/agenthub`) and running WebUI instances (`/opt/homebrew/lib/node_modules/hermes-web-ui`) are never modified.

2. **Sanitized Environment**:
   - Verification runs with an isolated `HOME` and `TMPDIR` outside the worktree (`~/.hermes/agenthub-sync/test-runs/<runid>/`).
   - Node >= 23 is strictly enforced (verified against `node -v`).
   - Environment variable allowlist: only strictly necessary build and proxy variables (`PATH`, `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, `NO_PROXY`, `LANG`, `LC_*`, `TMPDIR`, `HOME`) are forwarded. Sensitive credentials (`OPENAI_*`, `ANTHROPIC_*`, `GITHUB_TOKEN`, `BARK_*`, `HERMES_*`) as well as dangerous injection flags (`PYTHONPATH`, `NODE_OPTIONS`, `NPM_CONFIG_USERCONFIG`) are scrubbed.
   - **Important Security Notice**: The allowlist provides subprocess environment sanitization, **not filesystem sandboxing**. Untrusted npm dependencies or scripts can still read host files accessible to the user account. Automated sync relies on trusted static pre-filtering and mandatory human code review; it does not claim containerized isolation.
   - Real test execution logs are stored outside the worktree (`~/.hermes/agenthub-sync/logs/<runid>/`) so the git workspace remains clean.

3. **Strict Publication Invariants**:
   - Refuses if current git HEAD does not match the clean, verified commit recorded in `reports/<runid>-verify.json`.
   - Refuses if the current branch is `main` or anything other than `agenthub-sync/<target_tag>`.
   - Refuses if remote `main` has drifted since `prepare`.
   - Never uses `--force` or `--auto-merge`.

---

## 4. CLI Command Reference

`scripts/agenthub_upstream.py` provides the following subcommands:

### `gate`
Evaluates upstream releases and fork state:
```bash
python3 scripts/agenthub_upstream.py gate [--marker-local] [--resume]
```
- `--marker-local`: Reads `.agenthub/upstream.json` from the local checkout instead of GitHub API (useful for dry runs before marker is pushed to remote `main`).
- `--resume`: Allows retrying a tag that previously failed.

### `prepare`
Allocates an isolated clone and branch:
```bash
python3 scripts/agenthub_upstream.py prepare --tag v0.7.30 [--lease-minutes 180]
```
- Sets state to `preparing` with lease before network clone begins.
- Creates `~/.hermes/agenthub-sync/worktrees/v0.7.30-<runid>`.
- Checks out branch `agenthub-sync/v0.7.30` tracking remote `main`.
- Fetches upstream tag commits into the isolated clone.
- Emits JSON with `runid`, `worktree`, and `lease_expires_at`.

### `verify`
Runs static checks and the full automated verification suite:
```bash
python3 scripts/agenthub_upstream.py verify --worktree <path>
```
- Note: `--skip-build-test` and `AGENTHUB_TEST_FAST` bypasses are permanently removed; all builds and tests must execute and log exit code 0 evidence.
- Validates root and desktop package versions against `<tag>-agenthub.1` and `<tag>`.
- Asserts that `.agenthub/upstream.json` marker is updated in the candidate (`mode: "pr_only"`, `approval_required_for: ["merge", "deploy"]`).
- Asserts that required CLI bins (`bin/hermes-web-ui.mjs`, `bin/hermes-web-ui-mcp.mjs`, `bin/hermes-studio-mcp.mjs`, `bin/ekko-studio-mcp.mjs`) exist and are mapped in `package.json`.
- Asserts that `custom-build.ts` is present and preserves `-agenthub.` and `-tatin.` recognition.
- Asserts that removed commercial/mobile/device paths (`packages/esp32-c3`, `app-relay`, `devices`, etc.) have not been restored.
- Verifies desktop `appId` (`com.hermeswebui.studio`) and Bark notification modules.
- Executes `npm ci`, `npm rebuild`, `npm run build`, `npm test`, and focused Playwright E2E tests in sanitized environment outside the worktree.
- Re-checks that candidate worktree is clean and HEAD has not changed before writing PASS report.
- Writes verified status report to `~/.hermes/agenthub-sync/reports/<runid>-verify.json`.

### `publish`
Pushes the sync branch and creates a GitHub PR:
```bash
python3 scripts/agenthub_upstream.py publish --worktree <path> --body-file <path-to-pr-body.md>
```
- Validates that git HEAD matches the verified report and all required step execution logs exit 0.
- Validates origin remote URL matches `forhetale/agenthub`.
- Verifies that remote `origin/main` has not drifted.
- Checks existing PRs with `--limit 1000` (refuses if PR listing query fails; note that PR listing inspects up to 1000 items and is not arbitrarily paged).
- Pushes explicit refspec `HEAD:refs/heads/agenthub-sync/<tag>` (no force push, no main push).
- Calls `gh pr create` with `--base main` and non-draft mode.
- Reads back created PR to verify `headRefOid == verified_head`, `state == OPEN`, `baseRefName == main`, and confirms `autoMergeRequest` is null.

### `fail`
Records a task failure and releases the lease:
```bash
python3 scripts/agenthub_upstream.py fail --runid <runid> --reason "Compilation failed on new upstream dependency" [--tag <tag>]
```
- Requires matching active `--runid` to prevent clobbering unrelated runs.
- Preserves the worktree and logs for operator inspection.
- Marks the tag as failed in state to prevent infinite retry loops.

---

## 5. Operator Recovery Workflows

- **Active / Busy Lease**:
  If a task is actively running or preparing, `gate` skips silently. If an operator needs to abort a stuck run, invoke `fail --runid <runid> --reason "Operator manual abort"` with the active task's run ID.
- **Expired Lease with Incomplete Worktree**:
  `gate` halts with exit code 1 to protect existing work. Inspect the directory in `~/.hermes/agenthub-sync/worktrees/`, diagnose any issues, and either complete verification or clear the state entry.
- **Retagged Release Alert**:
  If upstream re-points a stable tag to a different commit, `gate` halts with a high-priority alert. Inspect the upstream repository history before deciding whether to accept the retag.
- **Closed Unmerged PR**:
  If an operator previously closed a generated PR without merging it, `gate` will not recreate the PR automatically. Reopen or manually resolve the PR on GitHub if curation is desired (GitHub does not support deleting pull requests).
