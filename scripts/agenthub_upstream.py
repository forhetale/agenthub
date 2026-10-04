#!/usr/bin/env python3
"""agenthub_upstream.py - Deterministic PR-only Upstream Sync Helper for AgentHub

Commands:
  gate     - Checks upstream releases and fork state; outputs wakeAgent: false when up-to-date.
  prepare  - Allocates an isolated clone/worktree under ~/.hermes/agenthub-sync/worktrees/.
  verify   - Runs static checks, forbidden path checks, builds, and test suite with sanitized env.
  publish  - Validates verified HEAD, pushes sync branch (no force), and opens human-review PR.
  fail     - Records failure reason and releases active lease for manual operator review.
"""

from __future__ import annotations

import argparse
import base64
import datetime
import fcntl
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
from typing import Any

UPSTREAM_REPO = "EKKOLearnAI/ekko-studio"
FORK_REPO = "forhetale/agenthub"
DEFAULT_STATE_DIR = Path.home() / ".hermes" / "agenthub-sync"
TAG_REGEX = re.compile(r"^v(\d+)\.(\d+)\.(\d+)$")
HEX40_REGEX = re.compile(r"^[0-9a-f]{40}$")
DEFAULT_LEASE_MINUTES = 180

FORBIDDEN_PATHS = [
    "packages/esp32-c3",
    "packages/server/src/modules/studio/controllers/app-connections.ts",
    "packages/server/src/modules/studio/controllers/app-relay.ts",
    "packages/server/src/modules/studio/controllers/devices.ts",
    "packages/server/src/modules/studio/controllers/mcu-devices.ts",
    "packages/server/src/modules/studio/controllers/mcu-firmware.ts",
    "packages/server/src/modules/studio/controllers/social-messages.ts",
    "packages/client/src/api/studio/app-connections.ts",
    "packages/client/src/api/studio/app-relay.ts",
    "packages/client/src/views/social-messages",
    "packages/server/src/assets/mcu-prompts",
    "packages/server/src/bootstrap/app-relay.ts",
    "packages/server/src/bootstrap/lan-discovery.ts",
]

REQUIRED_BIN_ENTRIES = {
    "hermes-web-ui": "./bin/hermes-web-ui.mjs",
    "hermes-web-ui-mcp": "./bin/hermes-web-ui-mcp.mjs",
    "hermes-studio-mcp": "./bin/hermes-studio-mcp.mjs",
    "ekko-studio-mcp": "./bin/ekko-studio-mcp.mjs",
}

REQUIRED_VERIFY_STEPS = [
    "node_version",
    "npm_ci",
    "npm_rebuild",
    "npm_build",
    "unit_tests",
    "playwright_tests",
]

ENV_ALLOWLIST = {
    "PATH",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "no_proxy",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "TMPDIR",
}


class LockContext:
    def __init__(self, lock_file: Path):
        self.lock_file, self.fd = lock_file, None

    def __enter__(self):
        self.lock_file.parent.mkdir(parents=True, exist_ok=True)
        self.fd = open(self.lock_file, "a+")
        try:
            fcntl.flock(self.fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.fd.close()
            self.fd = None
            raise
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.fd:
            try:
                fcntl.flock(self.fd, fcntl.LOCK_UN)
            finally:
                self.fd.close()
                self.fd = None


def run_cmd(
    cmd: list[str],
    cwd: Path | None = None,
    env: dict[str, str] | None = None,
    check: bool = False,
    timeout: float | None = None,
) -> tuple[int, str, str]:
    try:
        res = subprocess.run(
            cmd,
            cwd=str(cwd) if cwd else None,
            env=env,
            text=True,
            capture_output=True,
            timeout=timeout,
        )
        if check and res.returncode != 0:
            raise RuntimeError(f"Command failed ({res.returncode}): {' '.join(cmd)}\nStdout: {res.stdout}\nStderr: {res.stderr}")
        return res.returncode, res.stdout.strip(), res.stderr.strip()
    except subprocess.TimeoutExpired as e:
        if check:
            raise RuntimeError(f"Command timed out ({timeout}s): {' '.join(cmd)}") from e
        stdout = e.stdout.decode() if isinstance(e.stdout, bytes) else (e.stdout or "")
        stderr = e.stderr.decode() if isinstance(e.stderr, bytes) else (e.stderr or "")
        return 124, stdout.strip(), (stderr + f"\nCommand timed out after {timeout}s").strip()


def parse_tag(tag: str) -> tuple[int, int, int] | None:
    m = TAG_REGEX.match(tag)
    return (int(m.group(1)), int(m.group(2)), int(m.group(3))) if m else None


def load_state(state_dir: Path) -> dict[str, Any]:
    state_file = state_dir / "state.json"
    if not state_file.exists():
        return {}
    with open(state_file, "r", encoding="utf-8") as f:
        try:
            return json.load(f)
        except Exception as e:
            raise RuntimeError(f"Malformed state file at {state_file}: {e}") from e


def save_state(state_dir: Path, data: dict[str, Any]) -> None:
    state_dir.mkdir(parents=True, exist_ok=True)
    state_file = state_dir / "state.json"
    temp_file = state_dir / f"state.{secrets.token_hex(4)}.tmp"
    with open(temp_file, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)
    temp_file.replace(state_file)


def resolve_upstream_commit(upstream_repo: str, tag: str, timeout: float = 90.0) -> str:
    code, out, _ = run_cmd(["gh", "api", f"repos/{upstream_repo}/git/ref/tags/{tag}"], timeout=timeout)
    sha = ""
    if code == 0:
        try:
            ref_obj = json.loads(out)
            obj = ref_obj.get("object", {})
            if obj.get("type") == "tag":
                c, tag_out, _ = run_cmd(["gh", "api", f"repos/{upstream_repo}/git/tags/{obj.get('sha')}"], timeout=timeout)
                if c == 0:
                    sha = json.loads(tag_out).get("object", {}).get("sha", obj.get("sha"))
            else:
                sha = obj.get("sha", "")
        except Exception:
            sha = ""
    if not sha:
        code, out, _ = run_cmd(["git", "ls-remote", f"https://github.com/{upstream_repo}.git", f"refs/tags/{tag}*"], timeout=timeout)
        if code != 0:
            raise RuntimeError(f"Could not resolve upstream tag commit for {tag}")
        lines = [line.strip().split() for line in out.splitlines() if line.strip()]
        for s, ref in lines:
            if ref == f"refs/tags/{tag}^{{}}":
                sha = s
                break
        if not sha:
            for s, ref in lines:
                if ref == f"refs/tags/{tag}":
                    sha = s
                    break
    if not sha or not HEX40_REGEX.match(sha):
        raise RuntimeError(f"Invalid or unresolved tag commit '{sha}' for {tag}")
    return sha


def cmd_gate(args: argparse.Namespace) -> int:
    state_dir = Path(args.state_dir).resolve()
    try:
        with LockContext(state_dir / "lock"):
            return _execute_gate(args, state_dir)
    except BlockingIOError:
        print(json.dumps({"wakeAgent": False, "reason": "busy_lock", "message": "File lock active"}))
        return 0
    except Exception as e:
        sys.stderr.write(f"Error in gate: {e}\n")
        return 1


def _execute_gate(args: argparse.Namespace, state_dir: Path) -> int:
    state = load_state(state_dir)
    now = datetime.datetime.now(datetime.timezone.utc)

    # 1. Concurrency / lease check
    if state.get("status") in ("in_progress", "preparing"):
        expires_str = state.get("lease_expires_at")
        if expires_str:
            try:
                expires_at = datetime.datetime.fromisoformat(expires_str)
                if now < expires_at:
                    print(json.dumps({"wakeAgent": False, "reason": "busy_lease", "status": state.get("status"), "runid": state.get("runid")}))
                    return 0
                worktree = state.get("worktree")
                sys.stderr.write(f"BLOCK: Expired lease with status '{state.get('status')}' detected (worktree: {worktree}).\nManual recovery required.\n")
                return 1
            except ValueError:
                sys.stderr.write(f"Error: invalid lease_expires_at timestamp: '{expires_str}'\n")
                return 1

    # 2. Upstream release check
    upstream = args.upstream or UPSTREAM_REPO
    code, out, err = run_cmd(["gh", "api", f"repos/{upstream}/releases/latest"], timeout=90.0)
    if code != 0:
        sys.stderr.write(f"Error querying upstream latest release: {err}\n")
        return code or 1
    rel = json.loads(out)
    if rel.get("draft") or rel.get("prerelease"):
        print(json.dumps({"wakeAgent": False, "reason": "prerelease_or_draft", "tag": rel.get("tag_name")}))
        return 0
    latest_tag = rel.get("tag_name", "")
    parsed_latest = parse_tag(latest_tag)
    if not parsed_latest:
        sys.stderr.write(f"Error: upstream latest release tag '{latest_tag}' is malformed or invalid\n")
        return 1

    # 3. Failed tag pause
    if state.get("status") == "failed" and state.get("failed_tag") == latest_tag and not getattr(args, "resume", False):
        print(json.dumps({"wakeAgent": False, "reason": "tag_failed_needs_resume", "failed_tag": latest_tag, "failed_reason": state.get("failed_reason")}))
        return 0

    latest_commit = resolve_upstream_commit(upstream, latest_tag, timeout=90.0)

    # 4. Marker check
    fork = args.fork or FORK_REPO
    if args.marker_local:
        local_marker = Path(args.repo_dir).resolve() / ".agenthub" / "upstream.json"
        if not local_marker.exists():
            sys.stderr.write(f"Error: local marker file {local_marker} does not exist\n")
            return 1
        with open(local_marker, "r", encoding="utf-8") as f:
            marker = json.load(f)
    else:
        code, out, err = run_cmd(["gh", "api", f"repos/{fork}/contents/.agenthub/upstream.json?ref=main"], timeout=90.0)
        if code != 0:
            sys.stderr.write(f"Error: remote marker .agenthub/upstream.json not found on {fork}:main ({err}).\nUse --marker-local for dry-run.\n")
            return 1
        marker = json.loads(base64.b64decode(json.loads(out).get("content", "")).decode("utf-8"))

    # Marker invariant checks
    if marker.get("mode") != "pr_only":
        sys.stderr.write(f"Error: marker mode must be 'pr_only', found '{marker.get('mode')}'\n")
        return 1
    approval = marker.get("approval_required_for")
    if not isinstance(approval, list) or "merge" not in approval or "deploy" not in approval:
        sys.stderr.write("Error: marker approval_required_for must contain 'merge' and 'deploy'\n")
        return 1

    current_tag = marker.get("upstream_tag", "")
    current_commit = marker.get("upstream_commit", "")
    parsed_current = parse_tag(current_tag)
    if not parsed_current:
        sys.stderr.write(f"Error: invalid current marker tag: '{current_tag}'\n")
        return 1
    if not HEX40_REGEX.match(current_commit):
        sys.stderr.write(f"Error: current marker commit '{current_commit}' is not a valid 40-hex SHA\n")
        return 1

    # 5. Version comparison & retag alert
    if latest_tag == current_tag:
        if current_commit and latest_commit and current_commit != latest_commit:
            sys.stderr.write(f"ALERT: Upstream tag {latest_tag} commit changed from {current_commit} to {latest_commit}!\nRetag detected.\n")
            return 1
        print(json.dumps({"wakeAgent": False, "reason": "no_update", "current_tag": current_tag, "latest_tag": latest_tag}))
        return 0
    if parsed_latest <= parsed_current:
        print(json.dumps({"wakeAgent": False, "reason": "no_update", "current_tag": current_tag, "latest_tag": latest_tag}))
        return 0

    # 6. Check existing PRs (no stacked PRs; limit 1000)
    code, out, err = run_cmd(["gh", "pr", "list", "--repo", fork, "--state", "all", "--limit", "1000", "--json", "number,headRefName,state,mergedAt,url"], timeout=90.0)
    if code != 0:
        sys.stderr.write(f"Error listing PRs on {fork}: {err}\n")
        return code or 1
    prs = json.loads(out)

    # Any OPEN sync PR pauses gate (no stacked PRs)
    for pr in prs:
        head_name = pr.get("headRefName", "")
        if head_name.startswith("agenthub-sync/") and pr.get("state") == "OPEN":
            print(json.dumps({"wakeAgent": False, "reason": "sync_pr_already_open", "open_branch": head_name, "pr_url": pr.get("url"), "pr_number": pr.get("number")}))
            return 0

    target_branch = f"agenthub-sync/{latest_tag}"
    for pr in prs:
        if pr.get("headRefName") == target_branch:
            if pr.get("mergedAt") or pr.get("state") == "MERGED":
                sys.stderr.write(f"ERROR: Merged PR #{pr.get('number')} found for {latest_tag}, but main marker still at {current_tag}!\n")
                return 1
            if pr.get("state") == "CLOSED":
                print(json.dumps({"wakeAgent": False, "reason": "pr_closed_unmerged_paused", "pr_url": pr.get("url"), "pr_number": pr.get("number")}))
                return 0

    print(json.dumps({"wakeAgent": True, "latest_tag": latest_tag, "latest_commit": latest_commit, "current_tag": current_tag, "branch": target_branch}))
    return 0


def cmd_prepare(args: argparse.Namespace) -> int:
    tag = args.tag
    if not parse_tag(tag):
        sys.stderr.write(f"Error: tag '{tag}' does not match required format ^v\\d+\\.\\d+\\.\\d+$\n")
        return 1
    fork = args.fork or FORK_REPO
    upstream = args.upstream or UPSTREAM_REPO
    state_dir = Path(args.state_dir).resolve()
    try:
        with LockContext(state_dir / "lock"):
            state = load_state(state_dir)
            now = datetime.datetime.now(datetime.timezone.utc)
            if state.get("status") in ("in_progress", "preparing"):
                exp_str = state.get("lease_expires_at")
                if exp_str:
                    try:
                        exp_at = datetime.datetime.fromisoformat(exp_str)
                        if now < exp_at:
                            sys.stderr.write("Error: Active sync task already holds the lease.\n")
                            return 1
                        sys.stderr.write("Error: Expired lease with incomplete worktree. Manual cleanup required.\n")
                        return 1
                    except ValueError:
                        sys.stderr.write("Error: Malformed lease_expires_at in state.\n")
                        return 1

            # Resolve upstream commit before starting
            target_commit = resolve_upstream_commit(upstream, tag, timeout=90.0)

            runid = secrets.token_hex(8)
            worktrees_dir = state_dir / "worktrees"
            worktrees_dir.mkdir(parents=True, exist_ok=True)
            worktree_path = (worktrees_dir / f"{tag}-{runid}").resolve()
            branch_name = f"agenthub-sync/{tag}"

            lease_expires = now + datetime.timedelta(minutes=args.lease_minutes)
            # Save 'preparing' status BEFORE network clone
            save_state(state_dir, {
                "status": "preparing",
                "runid": runid,
                "target_tag": tag,
                "target_commit": target_commit,
                "worktree": str(worktree_path),
                "branch": branch_name,
                "created_at": now.isoformat(),
                "lease_expires_at": lease_expires.isoformat(),
            })

            repo_dir = Path(args.repo_dir).resolve() if args.repo_dir else None
            clone_cmd = ["git", "clone", "--branch", "main"]
            if repo_dir and (repo_dir / ".git").exists():
                clone_cmd.extend(["--reference", str(repo_dir)])
            clone_cmd.extend([f"https://github.com/{fork}.git", str(worktree_path)])
            run_cmd(clone_cmd, check=True, timeout=90.0)

            _, base_sha, _ = run_cmd(["git", "rev-parse", "HEAD"], cwd=worktree_path, check=True)
            if not HEX40_REGEX.match(base_sha):
                raise RuntimeError(f"Invalid base commit SHA: '{base_sha}'")

            run_cmd(["git", "remote", "add", "upstream", f"https://github.com/{upstream}.git"], cwd=worktree_path, check=True, timeout=90.0)
            run_cmd(["git", "fetch", "upstream", f"refs/tags/{tag}:refs/tags/{tag}"], cwd=worktree_path, check=True, timeout=90.0)
            run_cmd(["git", "checkout", "-b", branch_name], cwd=worktree_path, check=True)

            save_state(state_dir, {
                "status": "in_progress",
                "runid": runid,
                "target_tag": tag,
                "target_commit": target_commit,
                "worktree": str(worktree_path),
                "branch": branch_name,
                "base_commit": base_sha,
                "created_at": now.isoformat(),
                "lease_expires_at": lease_expires.isoformat(),
            })
            print(json.dumps({
                "status": "prepared",
                "runid": runid,
                "target_tag": tag,
                "target_commit": target_commit,
                "worktree": str(worktree_path),
                "branch": branch_name,
                "base_commit": base_sha,
                "lease_expires_at": lease_expires.isoformat(),
            }))
            return 0
    except BlockingIOError:
        sys.stderr.write("Error: state directory is locked by another process.\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"Error in prepare: {e}\n")
        return 1


def cmd_verify(args: argparse.Namespace) -> int:
    state_dir = Path(args.state_dir).resolve()
    try:
        with LockContext(state_dir / "lock"):
            return _execute_verify(args, state_dir)
    except BlockingIOError:
        sys.stderr.write("Error: state directory is locked by another process.\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"Error in verify: {e}\n")
        return 1


def _execute_verify(args: argparse.Namespace, state_dir: Path) -> int:
    raw_worktree = Path(args.worktree)
    if raw_worktree.is_symlink():
        sys.stderr.write(f"Error: worktree {raw_worktree} cannot be a symlink\n")
        return 1
    worktree_path = raw_worktree.resolve()

    state = load_state(state_dir)
    if state.get("status") != "in_progress":
        sys.stderr.write(f"Error: no active sync in progress (state: {state.get('status')})\n")
        return 1

    expected_worktree = Path(state.get("worktree", "")).resolve()
    worktrees_root = (state_dir / "worktrees").resolve()
    if worktree_path != expected_worktree or not str(worktree_path).startswith(str(worktrees_root) + "/"):
        sys.stderr.write(f"Error: worktree {worktree_path} is outside owned directory {worktrees_root}\n")
        return 1

    runid = state.get("runid")
    target_tag = state.get("target_tag", "")
    target_commit = state.get("target_commit", "")
    tag_base = target_tag.lstrip("v")

    # Invalidate prior receipts BEFORE each verify
    reports_dir = state_dir / "reports"
    report_file = reports_dir / f"{runid}-verify.json"
    if report_file.exists():
        report_file.unlink()
    state["verified"] = False
    state["verified_head"] = None
    save_state(state_dir, state)

    _, status_out, _ = run_cmd(["git", "status", "--porcelain"], cwd=worktree_path, check=True)
    if status_out.strip():
        sys.stderr.write("Error: candidate worktree is dirty. Commit all changes before verify.\n")
        return 1
    _, head_sha, _ = run_cmd(["git", "rev-parse", "HEAD"], cwd=worktree_path, check=True)
    if not HEX40_REGEX.match(head_sha):
        sys.stderr.write("Error: invalid git HEAD SHA\n")
        return 1

    # Static checks
    root_pkg_path = worktree_path / "package.json"
    if not root_pkg_path.exists():
        sys.stderr.write("Error: missing root package.json\n")
        return 1
    try:
        root_pkg = json.loads(root_pkg_path.read_text(encoding="utf-8"))
    except Exception as e:
        sys.stderr.write(f"Error: invalid root package.json: {e}\n")
        return 1
    if root_pkg.get("name") != "hermes-web-ui" or root_pkg.get("version") != f"{tag_base}-agenthub.1":
        sys.stderr.write(f"Error: package invalid (name: {root_pkg.get('name')}, version: {root_pkg.get('version')}, expected '{tag_base}-agenthub.1')\n")
        return 1

    # CLI bin guards in package.json & filesystem
    root_bin = root_pkg.get("bin", {})
    for bin_name, bin_rel_path in REQUIRED_BIN_ENTRIES.items():
        if root_bin.get(bin_name) != bin_rel_path:
            sys.stderr.write(f"Error: package.json bin missing or invalid entry for '{bin_name}' (expected '{bin_rel_path}')\n")
            return 1
        bin_file = worktree_path / bin_rel_path.lstrip("./")
        if not bin_file.exists():
            sys.stderr.write(f"Error: required bin file missing: {bin_rel_path}\n")
            return 1

    desktop_pkg_path = worktree_path / "packages" / "desktop" / "package.json"
    if not desktop_pkg_path.exists():
        sys.stderr.write("Error: packages/desktop/package.json missing\n")
        return 1
    try:
        desktop_pkg = json.loads(desktop_pkg_path.read_text(encoding="utf-8"))
    except Exception as e:
        sys.stderr.write(f"Error: invalid desktop package.json: {e}\n")
        return 1
    if desktop_pkg.get("version") != tag_base:
        sys.stderr.write(f"Error: desktop package version invalid, expected '{tag_base}'\n")
        return 1

    marker_path = worktree_path / ".agenthub" / "upstream.json"
    if not marker_path.exists():
        sys.stderr.write("Error: candidate missing .agenthub/upstream.json\n")
        return 1
    try:
        cand_marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except Exception as e:
        sys.stderr.write(f"Error: invalid candidate marker JSON: {e}\n")
        return 1

    expected_upstream = args.upstream or UPSTREAM_REPO
    expected_fork = args.fork or FORK_REPO
    if cand_marker.get("upstream_repo") != expected_upstream:
        sys.stderr.write(f"Error: candidate marker upstream_repo mismatch ('{cand_marker.get('upstream_repo')}' != '{expected_upstream}')\n")
        return 1
    if cand_marker.get("fork_repo") != expected_fork:
        sys.stderr.write(f"Error: candidate marker fork_repo mismatch ('{cand_marker.get('fork_repo')}' != '{expected_fork}')\n")
        return 1
    if cand_marker.get("agenthub_version") != f"{tag_base}-agenthub.1":
        sys.stderr.write(f"Error: candidate marker agenthub_version mismatch ('{cand_marker.get('agenthub_version')}' != '{tag_base}-agenthub.1')\n")
        return 1
    if cand_marker.get("upstream_tag") != target_tag:
        sys.stderr.write(f"Error: candidate marker upstream_tag mismatch ('{cand_marker.get('upstream_tag')}' != '{target_tag}')\n")
        return 1
    cand_commit = cand_marker.get("upstream_commit", "")
    if not HEX40_REGEX.match(cand_commit):
        sys.stderr.write(f"Error: candidate marker upstream_commit '{cand_commit}' is not a 40-hex SHA\n")
        return 1
    if target_commit and cand_commit != target_commit:
        sys.stderr.write(f"Error: candidate marker upstream_commit '{cand_commit}' does not match prepare target commit '{target_commit}'\n")
        return 1
    if cand_marker.get("mode") != "pr_only":
        sys.stderr.write(f"Error: candidate marker mode must be 'pr_only', found '{cand_marker.get('mode')}'\n")
        return 1
    approval = cand_marker.get("approval_required_for")
    if not isinstance(approval, list) or "merge" not in approval or "deploy" not in approval:
        sys.stderr.write("Error: candidate marker approval_required_for must contain 'merge' and 'deploy'\n")
        return 1

    # Re-verify freshly resolved tag commit against candidate marker
    fresh_commit = resolve_upstream_commit(expected_upstream, target_tag, timeout=90.0)
    if fresh_commit != cand_commit:
        sys.stderr.write(f"ALERT: Upstream tag {target_tag} commit changed from {cand_commit} to {fresh_commit}! Immutable tag changed.\n")
        return 1

    builder_yml = worktree_path / "packages" / "desktop" / "electron-builder.yml"
    if not builder_yml.exists() or "appId: com.hermeswebui.studio" not in builder_yml.read_text(encoding="utf-8"):
        sys.stderr.write("Error: electron-builder.yml missing appId: com.hermeswebui.studio\n")
        return 1

    custom_build_ts = worktree_path / "packages" / "server" / "src" / "modules" / "studio" / "public" / "custom-build.ts"
    if not custom_build_ts.exists():
        sys.stderr.write("Error: custom-build.ts missing\n")
        return 1
    cb_text = custom_build_ts.read_text(encoding="utf-8")
    if "-agenthub." not in cb_text or "-tatin." not in cb_text:
        sys.stderr.write("Error: custom-build.ts must recognize both -agenthub. and -tatin. versions\n")
        return 1

    bark_controller = worktree_path / "packages" / "server" / "src" / "modules" / "studio" / "controllers" / "bark.ts"
    if not bark_controller.exists():
        sys.stderr.write("Error: Bark controller missing from server modules\n")
        return 1

    for fb in FORBIDDEN_PATHS:
        if (worktree_path / fb).exists():
            sys.stderr.write(f"Error: forbidden path restored: {fb}\n")
            return 1

    # Isolated test environment outside worktree
    test_run_dir = state_dir / "test-runs" / str(runid)
    test_home = test_run_dir / "home"
    test_tmp = test_run_dir / "tmp"
    test_home.mkdir(parents=True, exist_ok=True)
    test_tmp.mkdir(parents=True, exist_ok=True)

    sanitized_env = {}
    for k in ENV_ALLOWLIST:
        if k in os.environ:
            sanitized_env[k] = os.environ[k]
    sanitized_env["HOME"] = str(test_home)
    sanitized_env["TMPDIR"] = str(test_tmp)
    base_path = sanitized_env.get("PATH", os.environ.get("PATH", ""))
    sanitized_env["PATH"] = f"/opt/homebrew/bin:{base_path}"

    logs_dir = state_dir / "logs" / str(runid)
    logs_dir.mkdir(parents=True, exist_ok=True)

    steps = [
        ("node_version", ["node", "-v"]),
        ("npm_ci", ["npm", "ci", "--ignore-scripts"]),
        ("npm_rebuild", ["npm", "rebuild", "node-pty", "sharp", "sherpa-onnx-node"]),
        ("npm_build", ["npm", "run", "build"]),
        ("unit_tests", ["npm", "test", "--", "--maxWorkers=3"]),
        ("playwright_tests", ["npx", "playwright", "test", "tests/e2e/auth.spec.ts", "tests/e2e/bark-push.spec.ts", "tests/e2e/link-opening-preference.spec.ts", "--workers=2"]),
    ]

    step_records = []
    for step_name, step_cmd in steps:
        s_env = sanitized_env.copy()
        if step_name == "playwright_tests":
            s_env["PLAYWRIGHT_CHANNEL"] = "chrome"
        code, stdout, stderr = run_cmd(step_cmd, cwd=worktree_path, env=s_env, timeout=1800.0)
        with open(logs_dir / f"{step_name}.log", "w", encoding="utf-8") as lf:
            lf.write(f"COMMAND: {' '.join(step_cmd)}\nEXIT: {code}\n--- STDOUT ---\n{stdout}\n--- STDERR ---\n{stderr}\n")

        if code != 0:
            sys.stderr.write(f"Error: step '{step_name}' failed with code {code}. See {logs_dir / f'{step_name}.log'}\n")
            return 1

        if step_name == "node_version":
            m = re.search(r"v(\d+)\.", stdout)
            if not m or int(m.group(1)) < 23:
                sys.stderr.write(f"Error: Node version >=23 required, found '{stdout.strip()}'. See {logs_dir / 'node_version.log'}\n")
                return 1

        step_records.append({"step": step_name, "exit_code": code, "command": step_cmd})

    # Verify all required steps succeeded
    executed_steps = {r["step"]: r["exit_code"] for r in step_records}
    for req_step in REQUIRED_VERIFY_STEPS:
        if req_step not in executed_steps or executed_steps[req_step] != 0:
            sys.stderr.write(f"Error: required step '{req_step}' was not successfully executed\n")
            return 1

    # Recheck clean status and HEAD after build+tests
    _, status_after, _ = run_cmd(["git", "status", "--porcelain"], cwd=worktree_path, check=True)
    if status_after.strip():
        sys.stderr.write("Error: candidate worktree became dirty during verification.\n")
        return 1
    _, head_after, _ = run_cmd(["git", "rev-parse", "HEAD"], cwd=worktree_path, check=True)
    if head_after != head_sha:
        sys.stderr.write(f"Error: HEAD changed during verification (was {head_sha}, now {head_after})\n")
        return 1

    reports_dir = state_dir / "reports"
    reports_dir.mkdir(parents=True, exist_ok=True)
    report_file = reports_dir / f"{runid}-verify.json"
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump({
            "runid": runid,
            "target_tag": target_tag,
            "status": "PASS",
            "verified_head": head_sha,
            "verified_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "steps": step_records,
            "logs_dir": str(logs_dir),
        }, f, indent=2)

    state["verified"] = True
    state["verified_head"] = head_sha
    save_state(state_dir, state)
    print(json.dumps({"status": "PASS", "runid": runid, "target_tag": target_tag, "verified_head": head_sha}))
    return 0


def cmd_publish(args: argparse.Namespace) -> int:
    state_dir = Path(args.state_dir).resolve()
    try:
        with LockContext(state_dir / "lock"):
            return _execute_publish(args, state_dir)
    except BlockingIOError:
        sys.stderr.write("Error: state directory is locked by another process.\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"Error in publish: {e}\n")
        return 1


def _execute_publish(args: argparse.Namespace, state_dir: Path) -> int:
    raw_worktree = Path(args.worktree)
    if raw_worktree.is_symlink():
        sys.stderr.write(f"Error: worktree {raw_worktree} cannot be a symlink\n")
        return 1
    worktree_path = raw_worktree.resolve()
    body_file = Path(args.body_file).resolve()

    state = load_state(state_dir)
    if state.get("status") != "in_progress":
        sys.stderr.write(f"Error: no active sync task in progress (state: {state.get('status')})\n")
        return 1

    expected_worktree = Path(state.get("worktree", "")).resolve()
    worktrees_root = (state_dir / "worktrees").resolve()
    if worktree_path != expected_worktree or not str(worktree_path).startswith(str(worktrees_root) + "/"):
        sys.stderr.write(f"Error: worktree {worktree_path} is outside owned directory {worktrees_root}\n")
        return 1

    target_tag = state.get("target_tag", "")
    if not target_tag or not parse_tag(target_tag):
        sys.stderr.write(f"Error: state target_tag '{target_tag}' is invalid\n")
        return 1

    expected_branch = f"agenthub-sync/{target_tag}"
    _, cur_branch, _ = run_cmd(["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd=worktree_path, check=True)
    if cur_branch != expected_branch:
        sys.stderr.write(f"Error: current branch '{cur_branch}' is not '{expected_branch}'. Refusing publish.\n")
        return 1

    _, status_out, _ = run_cmd(["git", "status", "--porcelain"], cwd=worktree_path, check=True)
    if status_out.strip():
        sys.stderr.write("Error: working directory is dirty. Refusing publish.\n")
        return 1
    _, cur_head, _ = run_cmd(["git", "rev-parse", "HEAD"], cwd=worktree_path, check=True)
    if not HEX40_REGEX.match(cur_head):
        sys.stderr.write("Error: invalid HEAD SHA\n")
        return 1

    runid = state.get("runid")
    if not runid:
        sys.stderr.write("Error: state missing runid\n")
        return 1
    report_file = state_dir / "reports" / f"{runid}-verify.json"
    if not report_file.exists():
        sys.stderr.write("Error: verification report missing. Run verify first.\n")
        return 1
    try:
        report = json.loads(report_file.read_text(encoding="utf-8"))
    except Exception as e:
        sys.stderr.write(f"Error: malformed verification report: {e}\n")
        return 1

    if report.get("status") != "PASS" or report.get("verified_head") != cur_head or report.get("runid") != runid or report.get("target_tag") != target_tag:
        sys.stderr.write("Error: code has changed since verification or verification did not PASS.\n")
        return 1

    recorded_steps = {s.get("step"): s.get("exit_code") for s in report.get("steps", [])}
    for req_step in REQUIRED_VERIFY_STEPS:
        if req_step not in recorded_steps or recorded_steps[req_step] != 0:
            sys.stderr.write(f"Error: verification report missing required step evidence: {req_step}\n")
            return 1

    fork = args.fork or FORK_REPO
    _, remote_out, _ = run_cmd(["git", "ls-remote", "origin", "refs/heads/main"], cwd=worktree_path, check=True, timeout=90.0)
    if not remote_out or (remote_out.split()[0] if remote_out else "") != state.get("base_commit"):
        sys.stderr.write("Error: remote main has drifted. Rebase and re-verify required.\n")
        return 1

    # Validate exact origin remote URL before any network push
    _, origin_url, _ = run_cmd(["git", "remote", "get-url", "origin"], cwd=worktree_path, check=True)
    allowed_origins = {
        f"https://github.com/{fork}.git",
        f"https://github.com/{fork}",
        f"git@github.com:{fork}.git",
        f"git@github.com:{fork}",
    }
    if origin_url.strip() not in allowed_origins:
        sys.stderr.write(f"Error: origin remote URL '{origin_url}' does not match expected fork repo '{fork}'. Refusing push.\n")
        return 1

    code, pr_out, pr_err = run_cmd(["gh", "pr", "list", "--repo", fork, "--head", expected_branch, "--state", "all", "--limit", "1000", "--json", "number"], timeout=90.0)
    if code != 0:
        sys.stderr.write(f"Error checking existing PRs on {fork}: {pr_err}\n")
        return 1
    if json.loads(pr_out):
        sys.stderr.write(f"Error: a PR for {expected_branch} already exists on {fork}.\n")
        return 1

    if not body_file.exists() or body_file.stat().st_size == 0:
        sys.stderr.write(f"Error: PR body file {body_file} missing or empty.\n")
        return 1

    # Push with explicit refspec
    run_cmd(["git", "push", "origin", f"HEAD:refs/heads/{expected_branch}"], cwd=worktree_path, check=True, timeout=90.0)

    code, _, pr_err = run_cmd(["gh", "pr", "create", "--repo", fork, "--head", expected_branch, "--base", "main", "--title", f"feat(agenthub): curated sync upstream {target_tag}", "--body-file", str(body_file)], cwd=worktree_path, timeout=90.0)
    if code != 0:
        sys.stderr.write(f"Error creating PR: {pr_err}\n")
        return code

    code, view_out, view_err = run_cmd(["gh", "pr", "view", expected_branch, "--repo", fork, "--json", "number,url,headRefName,baseRefName,headRefOid,state,autoMergeRequest"], timeout=90.0)
    if code != 0:
        sys.stderr.write(f"Error reading back created PR: {view_err}\n")
        return 1
    pr_meta = json.loads(view_out)
    if pr_meta.get("state") != "OPEN":
        sys.stderr.write(f"Error: created PR state is '{pr_meta.get('state')}', expected 'OPEN'\n")
        return 1
    if pr_meta.get("baseRefName") != "main":
        sys.stderr.write(f"Error: created PR baseRefName is '{pr_meta.get('baseRefName')}', expected 'main'\n")
        return 1
    if pr_meta.get("headRefName") != expected_branch:
        sys.stderr.write(f"Error: created PR headRefName is '{pr_meta.get('headRefName')}', expected '{expected_branch}'\n")
        return 1
    if pr_meta.get("headRefOid") != cur_head:
        sys.stderr.write(f"Error: created PR headRefOid '{pr_meta.get('headRefOid')}' does not match verified HEAD '{cur_head}'\n")
        return 1
    if not pr_meta.get("url"):
        sys.stderr.write("Error: created PR missing url\n")
        return 1
    if pr_meta.get("autoMergeRequest") is not None:
        sys.stderr.write("SECURITY ALERT: autoMergeRequest was unexpectedly enabled!\n")
        return 1

    state["status"] = "published"
    state["pr_number"] = pr_meta.get("number")
    state["pr_url"] = pr_meta.get("url")
    state["lease_expires_at"] = None
    save_state(state_dir, state)
    print(json.dumps({"status": "published", "pr_url": pr_meta.get("url"), "pr_number": pr_meta.get("number"), "branch": expected_branch}))
    return 0


def cmd_fail(args: argparse.Namespace) -> int:
    state_dir = Path(args.state_dir).resolve()
    try:
        with LockContext(state_dir / "lock"):
            state = load_state(state_dir)
            if not state:
                sys.stderr.write("Error: no state found to fail\n")
                return 1
            active_runid = state.get("runid")
            if not active_runid or active_runid != args.runid:
                sys.stderr.write(f"Error: active runid '{active_runid}' does not match requested runid '{args.runid}'. Refusing clobber.\n")
                return 1
            target_tag = args.tag or state.get("target_tag", "")
            state["status"] = "failed"
            state["failed_tag"] = target_tag
            state["failed_reason"] = args.reason
            state["failed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
            state["lease_expires_at"] = None
            save_state(state_dir, state)
            print(json.dumps({"status": "failed_recorded", "runid": args.runid, "failed_tag": target_tag, "reason": args.reason}))
            return 0
    except BlockingIOError:
        sys.stderr.write("Error: state directory is locked by another process.\n")
        return 1
    except Exception as e:
        sys.stderr.write(f"Error in fail: {e}\n")
        return 1


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--state-dir", default=str(DEFAULT_STATE_DIR), help="Path to sync state directory")
    common.add_argument("--repo-dir", default=str(Path.home() / "agenthub"), help="Path to local reference repo")
    common.add_argument("--upstream", default=UPSTREAM_REPO, choices=[UPSTREAM_REPO], help="Approved upstream repo slug")
    common.add_argument("--fork", default=FORK_REPO, choices=[FORK_REPO], help="Approved fork repo slug")

    parser = argparse.ArgumentParser(prog="agenthub_upstream.py", description="Deterministic PR-only upstream sync helper for AgentHub", parents=[common])
    sub = parser.add_subparsers(dest="command", required=True)

    p_gate = sub.add_parser("gate", parents=[common], help="Check upstream for new releases and verify pre-conditions")
    p_gate.add_argument("--marker-local", action="store_true", help="Read .agenthub/upstream.json from local repo")
    p_gate.add_argument("--resume", action="store_true", help="Resume/retry a tag that previously failed")

    p_prep = sub.add_parser("prepare", parents=[common], help="Prepare an isolated worktree for curated sync")
    p_prep.add_argument("--tag", required=True, help="Approved stable upstream tag (e.g. v0.7.30)")
    p_prep.add_argument("--lease-minutes", type=int, default=DEFAULT_LEASE_MINUTES, help=f"Lease timeout duration in minutes (default: {DEFAULT_LEASE_MINUTES})")

    p_ver = sub.add_parser("verify", parents=[common], help="Run static invariant checks and automated test suite")
    p_ver.add_argument("--worktree", required=True, help="Path to prepared worktree")

    p_pub = sub.add_parser("publish", parents=[common], help="Push branch and create human-review PR")
    p_pub.add_argument("--worktree", required=True, help="Path to verified worktree")
    p_pub.add_argument("--body-file", required=True, help="Path to PR markdown body file")

    p_fail = sub.add_parser("fail", parents=[common], help="Record failure reason and release active lease")
    p_fail.add_argument("--runid", required=True, help="Active task runid")
    p_fail.add_argument("--reason", required=True, help="Failure explanation")
    p_fail.add_argument("--tag", help="Target tag being failed")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    cmds = {"gate": cmd_gate, "prepare": cmd_prepare, "verify": cmd_verify, "publish": cmd_publish, "fail": cmd_fail}
    handler = cmds.get(args.command)
    return handler(args) if handler else 1


if __name__ == "__main__":
    sys.exit(main())
