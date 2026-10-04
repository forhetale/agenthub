"""test_agenthub_upstream.py - Regression test suite for agenthub_upstream.py

Verifies:
  1. baseline / nochange gate behavior
  2. retagged tag upstream alert (immutable tag commit changed)
  3. invalid / prerelease tag filtering
  4. malformed stable release tag alerting
  5. busy lock and active lease concurrency handling (including preparing state)
  6. expired lease with incomplete worktree blocking
  7. duplicate closed/unmerged PR pausing
  8. stacked open sync PR pausing
  9. merged PR with unupdated main marker alerting
 10. failed tag pause / resume behavior
 11. path traversal & symlink prevention
 12. forbidden source path restoration detection in verify
 13. version mismatch detection in verify
 14. removed guards detection (custom-build.ts, CLI bins, appId, Bark)
 15. CLI skip argument rejection (--skip-build-test removed)
 16. environment isolation & secrets scrubbing (allowlist only, outside HOME/TMPDIR)
 17. node version requirement (node < 23 fails)
 18. stale worktree/HEAD after testing detection
 19. failed rerun invalidates previous PASS report
 20. full verification evidence recording
 21. stale source detection in publish
 22. missing/incomplete verification evidence refusal in publish
 23. duplicate PR query error refusal in publish
 24. mismatched PR readback refusal in publish
 25. publisher branch validation & strict refusal of main/merge/force-push/deploy
 26. malformed state.json error handling (no fail-open)
 27. fail command requires matching runid
 28. prepare saves preparing status before network clone
"""

import datetime
import io
import json
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import MagicMock, patch

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
import sys
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from scripts import agenthub_upstream as au


class TestAgentHubUpstream(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.mkdtemp(prefix="test_agenthub_sync_")
        self.state_dir = (Path(self.temp_dir) / "state").resolve()
        self.state_dir.mkdir(parents=True, exist_ok=True)
        self.repo_dir = (Path(self.temp_dir) / "repo").resolve()
        self.repo_dir.mkdir(parents=True, exist_ok=True)

        # Baseline marker matching parent specification
        self.marker_file = self.repo_dir / ".agenthub" / "upstream.json"
        self.marker_file.parent.mkdir(parents=True, exist_ok=True)
        self.baseline_marker = {
            "upstream_repo": "EKKOLearnAI/ekko-studio",
            "upstream_tag": "v0.7.29",
            "upstream_commit": "2ad72723b618273ee1bb4d21416c48e5b7d31549",
            "fork_repo": "forhetale/agenthub",
            "agenthub_version": "0.7.29-agenthub.1",
            "mode": "pr_only",
            "approval_required_for": ["merge", "deploy"],
        }
        with open(self.marker_file, "w", encoding="utf-8") as f:
            json.dump(self.baseline_marker, f, indent=2)

    def tearDown(self):
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _make_args(self, cmd: str, **kwargs):
        parser = au.build_parser()
        cmd_args = [cmd]
        if "--state-dir" not in kwargs and "state_dir" not in kwargs:
            cmd_args.extend(["--state-dir", str(self.state_dir)])
        if "--repo-dir" not in kwargs and "repo_dir" not in kwargs:
            cmd_args.extend(["--repo-dir", str(self.repo_dir)])
        for k, v in kwargs.items():
            if isinstance(v, bool):
                if v:
                    cmd_args.append(f"--{k.replace('_', '-')}")
            else:
                cmd_args.extend([f"--{k.replace('_', '-')}", str(v)])
        return parser.parse_args(cmd_args)

    def _create_valid_worktree(self, wt: Path, tag: str = "v0.7.30", target_commit: str = "3333333333333333333333333333333333333333"):
        wt.mkdir(parents=True, exist_ok=True)
        tag_base = tag.lstrip("v")
        # Root package.json with bin guards
        with open(wt / "package.json", "w", encoding="utf-8") as f:
            json.dump({
                "name": "hermes-web-ui",
                "version": f"{tag_base}-agenthub.1",
                "bin": {
                    "hermes-web-ui": "./bin/hermes-web-ui.mjs",
                    "hermes-web-ui-mcp": "./bin/hermes-web-ui-mcp.mjs",
                    "hermes-studio-mcp": "./bin/hermes-studio-mcp.mjs",
                    "ekko-studio-mcp": "./bin/ekko-studio-mcp.mjs",
                },
            }, f, indent=2)

        # Bin files
        bin_dir = wt / "bin"
        bin_dir.mkdir(parents=True, exist_ok=True)
        for b in ("hermes-web-ui.mjs", "hermes-web-ui-mcp.mjs", "hermes-studio-mcp.mjs", "ekko-studio-mcp.mjs"):
            (bin_dir / b).write_text("// bin stub\n", encoding="utf-8")

        # Desktop package.json
        (wt / "packages" / "desktop").mkdir(parents=True, exist_ok=True)
        with open(wt / "packages" / "desktop" / "package.json", "w", encoding="utf-8") as f:
            json.dump({"name": "hermes-studio", "version": tag_base}, f, indent=2)

        # Desktop electron-builder.yml
        with open(wt / "packages" / "desktop" / "electron-builder.yml", "w", encoding="utf-8") as f:
            f.write("appId: com.hermeswebui.studio\n")

        # Candidate marker
        (wt / ".agenthub").mkdir(parents=True, exist_ok=True)
        with open(wt / ".agenthub" / "upstream.json", "w", encoding="utf-8") as f:
            json.dump({
                "upstream_repo": "EKKOLearnAI/ekko-studio",
                "upstream_tag": tag,
                "upstream_commit": target_commit,
                "fork_repo": "forhetale/agenthub",
                "agenthub_version": f"{tag_base}-agenthub.1",
                "mode": "pr_only",
                "approval_required_for": ["merge", "deploy"],
            }, f, indent=2)

        # custom-build.ts
        pub_dir = wt / "packages" / "server" / "src" / "modules" / "studio" / "public"
        pub_dir.mkdir(parents=True, exist_ok=True)
        (pub_dir / "custom-build.ts").write_text("// recognizes -agenthub. and -tatin. builds\n", encoding="utf-8")

        # Bark controller
        ctrl_dir = wt / "packages" / "server" / "src" / "modules" / "studio" / "controllers"
        ctrl_dir.mkdir(parents=True, exist_ok=True)
        (ctrl_dir / "bark.ts").write_text("// bark push controller\n", encoding="utf-8")

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_baseline_no_change(self, mock_run):
        """When upstream matches marker tag & commit, gate outputs wakeAgent: false with exit 0."""
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "v0.7.29", "draft": False, "prerelease": False}), ""),
            (0, json.dumps({"object": {"sha": "2ad72723b618273ee1bb4d21416c48e5b7d31549", "type": "commit"}}), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_gate(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertFalse(res["wakeAgent"])
            self.assertEqual(res["reason"], "no_update")

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_retagged_alert(self, mock_run):
        """When upstream retags the same release with a different commit SHA, gate alerts and exits 1."""
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "v0.7.29", "draft": False, "prerelease": False}), ""),
            (0, json.dumps({"object": {"sha": "9999999999999999999999999999999999999999", "type": "commit"}}), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_gate(args)
            self.assertEqual(code, 1)
            self.assertIn("ALERT: Upstream tag v0.7.29 commit changed", fake_err.getvalue())

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_invalid_tag(self, mock_run):
        """Prerelease tags (e.g. v0.8.0-rc.1) must not trigger updates."""
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "v0.8.0-rc.1", "draft": False, "prerelease": True}), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_gate(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertFalse(res["wakeAgent"])
            self.assertEqual(res["reason"], "prerelease_or_draft")

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_malformed_stable_tag_alert(self, mock_run):
        """A stable release with a malformed tag format must alert non-zero rather than silent normalizer."""
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "release-2026-10", "draft": False, "prerelease": False}), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_gate(args)
            self.assertEqual(code, 1)
            self.assertIn("malformed or invalid", fake_err.getvalue())

    def test_busylock(self):
        """When an unexpired lease is held in state.json, gate cleanly skips."""
        now = datetime.datetime.now(datetime.timezone.utc)
        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "1234abcd",
            "lease_expires_at": (now + datetime.timedelta(minutes=30)).isoformat(),
        })
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_gate(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertFalse(res["wakeAgent"])
            self.assertEqual(res["reason"], "busy_lease")

    def test_busy_preparing_lease(self):
        """When a task is in preparing state with an active lease, gate cleanly skips."""
        now = datetime.datetime.now(datetime.timezone.utc)
        au.save_state(self.state_dir, {
            "status": "preparing",
            "runid": "prep1234",
            "lease_expires_at": (now + datetime.timedelta(minutes=30)).isoformat(),
        })
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_gate(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertFalse(res["wakeAgent"])
            self.assertEqual(res["reason"], "busy_lease")
            self.assertEqual(res["status"], "preparing")

    def test_expiredlock(self):
        """When an expired lease with incomplete worktree is detected, gate errors with exit 1."""
        now = datetime.datetime.now(datetime.timezone.utc)
        dummy_wt = self.state_dir / "worktrees" / "v0.7.30-1234abcd"
        dummy_wt.mkdir(parents=True, exist_ok=True)
        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "1234abcd",
            "worktree": str(dummy_wt),
            "lease_expires_at": (now - datetime.timedelta(minutes=10)).isoformat(),
        })
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_gate(args)
            self.assertEqual(code, 1)
            self.assertIn("BLOCK: Expired lease", fake_err.getvalue())

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_prduplicateclosed(self, mock_run):
        """When a closed unmerged PR exists for the new tag, gate pauses rather than recreating."""
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "v0.7.30", "draft": False, "prerelease": False}), ""),
            (0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""),
            (0, json.dumps([
                {"number": 42, "headRefName": "agenthub-sync/v0.7.30", "state": "CLOSED", "mergedAt": None, "url": "https://github.com/forhetale/agenthub/pull/42"}
            ]), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_gate(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertFalse(res["wakeAgent"])
            self.assertEqual(res["reason"], "pr_closed_unmerged_paused")

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_stacked_pr_pause(self, mock_run):
        """Any currently OPEN sync PR pauses gate even if a new tag is released (no stacked PRs)."""
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "v0.7.31", "draft": False, "prerelease": False}), ""),
            (0, json.dumps({"object": {"sha": "4444444444444444444444444444444444444444", "type": "commit"}}), ""),
            (0, json.dumps([
                {"number": 40, "headRefName": "agenthub-sync/v0.7.30", "state": "OPEN", "mergedAt": None, "url": "https://github.com/forhetale/agenthub/pull/40"}
            ]), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_gate(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertFalse(res["wakeAgent"])
            self.assertEqual(res["reason"], "sync_pr_already_open")
            self.assertEqual(res["open_branch"], "agenthub-sync/v0.7.30")

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_pr_merged_marker_unupdated_alert(self, mock_run):
        """When a PR for a new tag was merged but main marker is still old, gate alerts and exits 1."""
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "v0.7.30", "draft": False, "prerelease": False}), ""),
            (0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""),
            (0, json.dumps([
                {"number": 43, "headRefName": "agenthub-sync/v0.7.30", "state": "MERGED", "mergedAt": "2026-10-04T12:00:00Z", "url": "https://github.com/forhetale/agenthub/pull/43"}
            ]), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_gate(args)
            self.assertEqual(code, 1)
            self.assertIn("ERROR: Merged PR #43 found for v0.7.30, but main marker still at v0.7.29", fake_err.getvalue())

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_failed_tag_skip_unless_resume(self, mock_run):
        """Failed target tag is tracked and skipped on next gate run unless --resume is passed."""
        au.save_state(self.state_dir, {
            "status": "failed",
            "failed_tag": "v0.7.30",
            "failed_reason": "Broken build",
        })
        mock_run.side_effect = [
            (0, json.dumps({"tag_name": "v0.7.30", "draft": False, "prerelease": False}), ""),
        ]
        args = self._make_args("gate", marker_local=True)
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_gate(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertFalse(res["wakeAgent"])
            self.assertEqual(res["reason"], "tag_failed_needs_resume")

    def test_pathtraversal(self):
        """Verify and publish refuse paths outside owned worktrees directory or symlinks."""
        outside_path = self.temp_dir + "/malicious/path"
        os.makedirs(outside_path, exist_ok=True)
        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "worktree": outside_path,
        })
        args_verify = self._make_args("verify", worktree=outside_path)
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_verify(args_verify)
            self.assertEqual(code, 1)
            self.assertIn("outside owned directory", fake_err.getvalue())

    def test_verifyfail_forbidden_paths(self):
        """Verify fails if forbidden commercial/mobile/device stacks are present."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")

        # Inject forbidden path: esp32-c3
        forbidden = wt / "packages" / "esp32-c3"
        forbidden.mkdir(parents=True, exist_ok=True)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
        })

        args = self._make_args("verify", worktree=str(wt))
        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "", ""), # git status clean
                (0, "1234567890abcdef1234567890abcdef12345678", ""), # rev-parse HEAD
                (0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""), # resolve tag
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_verify(args)
                self.assertEqual(code, 1)
                self.assertIn("forbidden path restored: packages/esp32-c3", fake_err.getvalue())

    def test_verifyfail_version_mismatch(self):
        """Verify fails if root package.json version is not <tag>-agenthub.1."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")
        with open(wt / "package.json", "w", encoding="utf-8") as f:
            json.dump({"name": "hermes-web-ui", "version": "0.7.30"}, f)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
        })

        args = self._make_args("verify", worktree=str(wt))
        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "", ""),
                (0, "1234567890abcdef1234567890abcdef12345678", ""),
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_verify(args)
                self.assertEqual(code, 1)
                self.assertIn("expected '0.7.30-agenthub.1'", fake_err.getvalue())

    def test_removedguard_custom_build_and_cli_bins(self):
        """Verify fails if custom-build.ts is deleted or CLI bin mappings/files are missing."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")

        # 1. Test missing custom-build.ts
        cb_file = wt / "packages" / "server" / "src" / "modules" / "studio" / "public" / "custom-build.ts"
        cb_file.unlink()

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
        })
        args = self._make_args("verify", worktree=str(wt))
        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "", ""),
                (0, "1234567890abcdef1234567890abcdef12345678", ""),
                (0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""),
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_verify(args)
                self.assertEqual(code, 1)
                self.assertIn("custom-build.ts missing", fake_err.getvalue())

        # Restore custom-build.ts, test missing bin file
        cb_file.write_text("// recognizes -agenthub. and -tatin. builds\n")
        bin_mcp = wt / "bin" / "hermes-studio-mcp.mjs"
        bin_mcp.unlink()

        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "", ""),
                (0, "1234567890abcdef1234567890abcdef12345678", ""),
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_verify(args)
                self.assertEqual(code, 1)
                self.assertIn("required bin file missing: ./bin/hermes-studio-mcp.mjs", fake_err.getvalue())

    def test_skipargcannotaccepted(self):
        """CLI option --skip-build-test must be removed entirely and rejected by argparse."""
        parser = au.build_parser()
        with patch("sys.stderr", new=io.StringIO()):
            with self.assertRaises(SystemExit):
                parser.parse_args(["verify", "--worktree", "/tmp/wt", "--skip-build-test"])

    def test_envsecrets_isolation(self):
        """Subprocess executions during verify must strip secrets and use state-directed HOME and TMPDIR."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
        })

        captured_envs = []
        def _mock_run(cmd, cwd=None, env=None, check=False, timeout=None):
            cmd_str = " ".join(cmd)
            if "git status" in cmd_str:
                return 0, "", ""
            if "git rev-parse HEAD" in cmd_str:
                return 0, "1234567890abcdef1234567890abcdef12345678", ""
            if "gh api" in cmd_str:
                return 0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""
            if cmd == ["node", "-v"]:
                captured_envs.append(env)
                return 0, "v23.5.0", ""
            if "npm" in cmd[0] or "npx" in cmd[0]:
                captured_envs.append(env)
                return 0, "ok", ""
            return 0, "", ""

        test_environ = {
            "PATH": "/usr/bin:/bin",
            "GITHUB_TOKEN": "ghp_leakedsecret1234567890",
            "OPENAI_API_KEY": "sk-secret12345",
            "PYTHONPATH": "/malicious/python/path",
            "NODE_OPTIONS": "--require /evil.js",
            "NPM_CONFIG_USERCONFIG": "/tmp/npmrc",
        }
        with patch.dict(os.environ, test_environ, clear=True):
            with patch("scripts.agenthub_upstream.run_cmd", side_effect=_mock_run):
                args = self._make_args("verify", worktree=str(wt))
                with patch("sys.stdout", new=io.StringIO()):
                    code = au.cmd_verify(args)
                    self.assertEqual(code, 0)

        self.assertGreater(len(captured_envs), 0)
        for env in captured_envs:
            self.assertNotIn("GITHUB_TOKEN", env)
            self.assertNotIn("OPENAI_API_KEY", env)
            self.assertNotIn("PYTHONPATH", env)
            self.assertNotIn("NODE_OPTIONS", env)
            self.assertNotIn("NPM_CONFIG_USERCONFIG", env)
            expected_home = str(self.state_dir / "test-runs" / "abcd1234" / "home")
            expected_tmp = str(self.state_dir / "test-runs" / "abcd1234" / "tmp")
            self.assertEqual(env["HOME"], expected_home)
            self.assertEqual(env["TMPDIR"], expected_tmp)
            self.assertIn("/opt/homebrew/bin", env["PATH"])

    def test_nodeold_fails_verify(self):
        """Verify fails if node version is less than 23."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
        })

        def _mock_run(cmd, cwd=None, env=None, check=False, timeout=None):
            cmd_str = " ".join(cmd)
            if "git status" in cmd_str:
                return 0, "", ""
            if "git rev-parse HEAD" in cmd_str:
                return 0, "1234567890abcdef1234567890abcdef12345678", ""
            if "gh api" in cmd_str:
                return 0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""
            if cmd == ["node", "-v"]:
                return 0, "v20.18.0", ""
            return 0, "", ""

        with patch("scripts.agenthub_upstream.run_cmd", side_effect=_mock_run):
            args = self._make_args("verify", worktree=str(wt))
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_verify(args)
                self.assertEqual(code, 1)
                self.assertIn("Node version >=23 required, found 'v20.18.0'", fake_err.getvalue())

    def test_stalesource_aftertesting_fails_verify(self):
        """Verify fails if worktree becomes dirty during build or test execution."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
        })

        status_calls = 0
        def _mock_run(cmd, cwd=None, env=None, check=False, timeout=None):
            nonlocal status_calls
            cmd_str = " ".join(cmd)
            if "git status" in cmd_str:
                status_calls += 1
                if status_calls > 1:
                    return 0, "M package-lock.json", ""
                return 0, "", ""
            if "git rev-parse HEAD" in cmd_str:
                return 0, "1234567890abcdef1234567890abcdef12345678", ""
            if "gh api" in cmd_str:
                return 0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""
            if cmd == ["node", "-v"]:
                return 0, "v23.5.0", ""
            if "npm" in cmd[0] or "npx" in cmd[0]:
                return 0, "ok", ""
            return 0, "", ""

        with patch("scripts.agenthub_upstream.run_cmd", side_effect=_mock_run):
            args = self._make_args("verify", worktree=str(wt))
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_verify(args)
                self.assertEqual(code, 1)
                self.assertIn("candidate worktree became dirty during verification", fake_err.getvalue())

    def test_failedreruninvalidate(self):
        """A failed re-verification run invalidates prior PASS report and state verified flag."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")

        # Existing PASS receipt
        reports_dir = self.state_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        report_file = reports_dir / "abcd1234-verify.json"
        with open(report_file, "w", encoding="utf-8") as f:
            json.dump({"runid": "abcd1234", "status": "PASS", "verified_head": "1234567890abcdef1234567890abcdef12345678"}, f)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
            "verified": True,
            "verified_head": "1234567890abcdef1234567890abcdef12345678",
        })

        # Inject unit test failure
        def _mock_run(cmd, cwd=None, env=None, check=False, timeout=None):
            cmd_str = " ".join(cmd)
            if "git status" in cmd_str:
                return 0, "", ""
            if "git rev-parse HEAD" in cmd_str:
                return 0, "1234567890abcdef1234567890abcdef12345678", ""
            if "gh api" in cmd_str:
                return 0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""
            if cmd == ["node", "-v"]:
                return 0, "v23.5.0", ""
            if "npm test" in cmd_str:
                return 1, "", "Unit test failed: regression found"
            if "npm" in cmd[0] or "npx" in cmd[0]:
                return 0, "ok", ""
            return 0, "", ""

        with patch("scripts.agenthub_upstream.run_cmd", side_effect=_mock_run):
            args = self._make_args("verify", worktree=str(wt))
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_verify(args)
                self.assertEqual(code, 1)
                self.assertIn("step 'unit_tests' failed with code 1", fake_err.getvalue())

        # Verify receipt was deleted and state.verified is False
        self.assertFalse(report_file.exists())
        state = au.load_state(self.state_dir)
        self.assertFalse(state.get("verified"))
        self.assertIsNone(state.get("verified_head"))

    def test_happy_path_verify_records_full_evidence(self):
        """When all checks and steps pass, verify creates evidence record and marks state verified."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        self._create_valid_worktree(wt, tag="v0.7.30")

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "target_commit": "3333333333333333333333333333333333333333",
            "worktree": str(wt),
        })

        def _mock_run(cmd, cwd=None, env=None, check=False, timeout=None):
            cmd_str = " ".join(cmd)
            if "git status" in cmd_str:
                return 0, "", ""
            if "git rev-parse HEAD" in cmd_str:
                return 0, "1234567890abcdef1234567890abcdef12345678", ""
            if "gh api" in cmd_str:
                return 0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""
            if cmd == ["node", "-v"]:
                return 0, "v23.5.0", ""
            if "npm" in cmd[0] or "npx" in cmd[0]:
                return 0, "ok", ""
            return 0, "", ""

        with patch("scripts.agenthub_upstream.run_cmd", side_effect=_mock_run):
            args = self._make_args("verify", worktree=str(wt))
            with patch("sys.stdout", new=io.StringIO()) as fake_out:
                code = au.cmd_verify(args)
                self.assertEqual(code, 0)
                res = json.loads(fake_out.getvalue())
                self.assertEqual(res["status"], "PASS")

        # Inspect report
        report_file = self.state_dir / "reports" / "abcd1234-verify.json"
        self.assertTrue(report_file.exists())
        report = json.loads(report_file.read_text(encoding="utf-8"))
        self.assertEqual(report["status"], "PASS")
        self.assertEqual(report["runid"], "abcd1234")
        self.assertEqual(report["target_tag"], "v0.7.30")
        self.assertEqual(len(report["steps"]), 6)
        for s in report["steps"]:
            self.assertEqual(s["exit_code"], 0)

    def test_stalesource_publish_refusal(self):
        """Publish refuses if code was modified after verification (git HEAD mismatch)."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        wt.mkdir(parents=True, exist_ok=True)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "worktree": str(wt),
            "base_commit": "0000000000000000000000000000000000000000",
        })
        reports_dir = self.state_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        with open(reports_dir / "abcd1234-verify.json", "w") as f:
            json.dump({
                "runid": "abcd1234",
                "target_tag": "v0.7.30",
                "status": "PASS",
                "verified_head": "1111111111111111111111111111111111111111",
                "steps": [{"step": s, "exit_code": 0} for s in au.REQUIRED_VERIFY_STEPS],
            }, f)

        body_file = self.temp_dir + "/body.md"
        with open(body_file, "w") as f:
            f.write("PR description")

        args = self._make_args("publish", worktree=str(wt), body_file=body_file)
        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "agenthub-sync/v0.7.30", ""),
                (0, "", ""),
                (0, "2222222222222222222222222222222222222222", ""),
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_publish(args)
                self.assertEqual(code, 1)
                self.assertIn("code has changed since verification", fake_err.getvalue())

    def test_fullreportabsentpublish_refuses(self):
        """Publish refuses if verification report is missing required steps or not PASS."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        wt.mkdir(parents=True, exist_ok=True)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "worktree": str(wt),
            "base_commit": "0000000000000000000000000000000000000000",
        })
        reports_dir = self.state_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        # Missing playwright_tests in steps
        with open(reports_dir / "abcd1234-verify.json", "w") as f:
            json.dump({
                "runid": "abcd1234",
                "target_tag": "v0.7.30",
                "status": "PASS",
                "verified_head": "1111111111111111111111111111111111111111",
                "steps": [{"step": s, "exit_code": 0} for s in au.REQUIRED_VERIFY_STEPS if s != "playwright_tests"],
            }, f)

        body_file = self.temp_dir + "/body.md"
        with open(body_file, "w") as f:
            f.write("PR description")

        args = self._make_args("publish", worktree=str(wt), body_file=body_file)
        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "agenthub-sync/v0.7.30", ""),
                (0, "", ""),
                (0, "1111111111111111111111111111111111111111", ""),
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_publish(args)
                self.assertEqual(code, 1)
                self.assertIn("verification report missing required step evidence", fake_err.getvalue())

    def test_duplicatequeryerror_publish_refuses(self):
        """Publish refuses if gh pr list returns an API error."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        wt.mkdir(parents=True, exist_ok=True)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "worktree": str(wt),
            "base_commit": "0000000000000000000000000000000000000000",
        })
        reports_dir = self.state_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        with open(reports_dir / "abcd1234-verify.json", "w") as f:
            json.dump({
                "runid": "abcd1234",
                "target_tag": "v0.7.30",
                "status": "PASS",
                "verified_head": "1111111111111111111111111111111111111111",
                "steps": [{"step": s, "exit_code": 0} for s in au.REQUIRED_VERIFY_STEPS],
            }, f)

        body_file = self.temp_dir + "/body.md"
        with open(body_file, "w") as f:
            f.write("PR description")

        args = self._make_args("publish", worktree=str(wt), body_file=body_file)
        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "agenthub-sync/v0.7.30", ""),
                (0, "", ""),
                (0, "1111111111111111111111111111111111111111", ""),
                (0, "0000000000000000000000000000000000000000 refs/heads/main", ""),
                (0, "https://github.com/forhetale/agenthub.git", ""), # git remote get-url origin
                (1, "", "GitHub API rate limit exceeded"), # gh pr list error
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_publish(args)
                self.assertEqual(code, 1)
                self.assertIn("Error checking existing PRs", fake_err.getvalue())

    def test_mismatchedPRreadback_publish_refuses(self):
        """Publish refuses if created PR view readback has mismatched HEAD SHA or base."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        wt.mkdir(parents=True, exist_ok=True)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "worktree": str(wt),
            "base_commit": "0000000000000000000000000000000000000000",
        })
        reports_dir = self.state_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        with open(reports_dir / "abcd1234-verify.json", "w") as f:
            json.dump({
                "runid": "abcd1234",
                "target_tag": "v0.7.30",
                "status": "PASS",
                "verified_head": "1111111111111111111111111111111111111111",
                "steps": [{"step": s, "exit_code": 0} for s in au.REQUIRED_VERIFY_STEPS],
            }, f)

        body_file = self.temp_dir + "/body.md"
        with open(body_file, "w") as f:
            f.write("PR description")

        args = self._make_args("publish", worktree=str(wt), body_file=body_file)
        with patch("scripts.agenthub_upstream.run_cmd") as mock_run:
            mock_run.side_effect = [
                (0, "agenthub-sync/v0.7.30", ""),
                (0, "", ""),
                (0, "1111111111111111111111111111111111111111", ""),
                (0, "0000000000000000000000000000000000000000 refs/heads/main", ""),
                (0, "https://github.com/forhetale/agenthub.git", ""), # git remote get-url origin
                (0, "[]", ""), # gh pr list empty
                (0, "", ""),   # git push
                (0, "", ""),   # gh pr create
                (0, json.dumps({ # gh pr view with mismatched headRefOid
                    "number": 105,
                    "url": "https://github.com/forhetale/agenthub/pull/105",
                    "headRefName": "agenthub-sync/v0.7.30",
                    "baseRefName": "main",
                    "headRefOid": "9999999999999999999999999999999999999999", # Mismatched!
                    "state": "OPEN",
                    "autoMergeRequest": None,
                }), ""),
            ]
            with patch("sys.stderr", new=io.StringIO()) as fake_err:
                code = au.cmd_publish(args)
                self.assertEqual(code, 1)
                self.assertIn("does not match verified HEAD", fake_err.getvalue())

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_publisher_branch_validation_and_no_deploy_commands(self, mock_run):
        """Publish validates branch != main, creates PR without autoMerge, and never executes merge/main-push/deploy."""
        wt = self.state_dir / "worktrees" / "v0.7.30-abcd1234"
        wt.mkdir(parents=True, exist_ok=True)

        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "abcd1234",
            "target_tag": "v0.7.30",
            "worktree": str(wt),
            "base_commit": "0000000000000000000000000000000000000000",
        })
        reports_dir = self.state_dir / "reports"
        reports_dir.mkdir(parents=True, exist_ok=True)
        with open(reports_dir / "abcd1234-verify.json", "w") as f:
            json.dump({
                "runid": "abcd1234",
                "target_tag": "v0.7.30",
                "status": "PASS",
                "verified_head": "9999999999999999999999999999999999999999",
                "steps": [{"step": s, "exit_code": 0} for s in au.REQUIRED_VERIFY_STEPS],
            }, f)

        body_file = self.temp_dir + "/body.md"
        with open(body_file, "w") as f:
            f.write("Verified PR description")

        # First test: branch is 'main' -> should refuse immediately
        args = self._make_args("publish", worktree=str(wt), body_file=body_file)
        mock_run.side_effect = [
            (0, "main", ""),
        ]
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_publish(args)
            self.assertEqual(code, 1)
            self.assertIn("Refusing publish", fake_err.getvalue())

        # Second test: branch is agenthub-sync/v0.7.30 -> valid publish flow
        mock_run.reset_mock()
        mock_run.side_effect = [
            (0, "agenthub-sync/v0.7.30", ""),  # rev-parse --abbrev-ref
            (0, "", ""),                       # status --porcelain clean
            (0, "9999999999999999999999999999999999999999", ""), # rev-parse HEAD
            (0, "0000000000000000000000000000000000000000\trefs/heads/main", ""), # ls-remote origin refs/heads/main
            (0, "https://github.com/forhetale/agenthub.git", ""), # git remote get-url origin
            (0, "[]", ""),                     # pr list -> no duplicate
            (0, "", ""),                       # git push origin HEAD:refs/heads/agenthub-sync/v0.7.30
            (0, "https://github.com/forhetale/agenthub/pull/101", ""), # gh pr create
            (0, json.dumps({                   # gh pr view
                "number": 101,
                "url": "https://github.com/forhetale/agenthub/pull/101",
                "headRefName": "agenthub-sync/v0.7.30",
                "baseRefName": "main",
                "headRefOid": "9999999999999999999999999999999999999999",
                "state": "OPEN",
                "autoMergeRequest": None,
            }), ""),
        ]

        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_publish(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertEqual(res["status"], "published")
            self.assertEqual(res["pr_number"], 101)

        # Assert no illegal commands were ever issued
        for call_args in mock_run.call_args_list:
            cmd = call_args[0][0]
            cmd_str = " ".join(cmd)
            # Refuse push to main
            self.assertNotIn("git push origin main", cmd_str)
            # Refuse force push
            self.assertNotIn("--force", cmd)
            self.assertNotIn("-f", cmd)
            # Refuse git merge
            self.assertFalse(cmd[0] == "git" and "merge" in cmd)
            # Refuse auto-merge
            self.assertNotIn("--auto-merge", cmd)
            # Refuse deployment / npm publish
            self.assertFalse(cmd[0] == "npm" and "publish" in cmd)

    def test_malformed_state_error(self):
        """Malformed state.json must raise an error and not fail open."""
        state_file = self.state_dir / "state.json"
        state_file.write_text("{ broken json content", encoding="utf-8")

        args = self._make_args("gate", marker_local=True)
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_gate(args)
            self.assertEqual(code, 1)
            self.assertIn("Malformed state file", fake_err.getvalue())

    def test_fail_requires_runid_and_matches(self):
        """CLI fail requires --runid and errors if it does not match active state."""
        au.save_state(self.state_dir, {
            "status": "in_progress",
            "runid": "active111",
            "target_tag": "v0.7.30",
        })

        # Mismatched runid
        args_mismatch = self._make_args("fail", runid="wrong222", reason="Some error")
        with patch("sys.stderr", new=io.StringIO()) as fake_err:
            code = au.cmd_fail(args_mismatch)
            self.assertEqual(code, 1)
            self.assertIn("active runid 'active111' does not match requested runid 'wrong222'", fake_err.getvalue())

        # Matching runid
        args_match = self._make_args("fail", runid="active111", reason="Operator aborted")
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_fail(args_match)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertEqual(res["status"], "failed_recorded")

        state = au.load_state(self.state_dir)
        self.assertEqual(state["status"], "failed")
        self.assertEqual(state["failed_reason"], "Operator aborted")
        self.assertIsNone(state["lease_expires_at"])

    @patch("scripts.agenthub_upstream.run_cmd")
    def test_prepare_saves_preparing_before_clone(self, mock_run):
        """Prepare sets state 'preparing' with lease before invoking git clone."""
        mock_run.side_effect = [
            (0, json.dumps({"object": {"sha": "3333333333333333333333333333333333333333", "type": "commit"}}), ""), # resolve tag
            (0, "", ""), # git clone
            (0, "1111111111111111111111111111111111111111", ""), # rev-parse HEAD
            (0, "", ""), # git remote add upstream
            (0, "", ""), # git fetch upstream
            (0, "", ""), # git checkout -b
        ]

        args = self._make_args("prepare", tag="v0.7.30")
        with patch("sys.stdout", new=io.StringIO()) as fake_out:
            code = au.cmd_prepare(args)
            self.assertEqual(code, 0)
            res = json.loads(fake_out.getvalue())
            self.assertEqual(res["status"], "prepared")
            self.assertEqual(res["target_tag"], "v0.7.30")

        state = au.load_state(self.state_dir)
        self.assertEqual(state["status"], "in_progress")
        self.assertEqual(state["target_commit"], "3333333333333333333333333333333333333333")


if __name__ == "__main__":
    unittest.main()
