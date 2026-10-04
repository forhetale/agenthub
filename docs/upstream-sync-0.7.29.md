# Upstream Sync Ledger: v0.7.29 (`0.7.29-agenthub.1`)

This document records the curated sync from upstream `EKKOLearnAI/ekko-studio` up to release **v0.7.29** into **AgentHub**.

AgentHub maintains a local-first, privacy-respecting, de-commercialized fork. Upstream features, bug fixes, and runtime improvements are selectively imported through a curated branch, while commercial relays, proprietary mobile app dependencies, and upsell surfaces remain strictly excluded.

---

## 1. Versioning & Scope

- **Root Package Version**: `0.7.29-agenthub.1` (`package.json`)
- **Desktop Package Version**: `0.7.29` (`packages/desktop/package.json`)
- **Fork Repository**: [https://github.com/forhetale/agenthub.git](https://github.com/forhetale/agenthub.git)
- **Base Upstream Baseline**: v0.7.26 / v0.7.28 → v0.7.29
- **Build / Test Verification**: Verification runs (Vitest suites, type checks, build artifacts) are managed and recorded by the parent orchestration pipeline.

---

## 2. Accepted Upstream Commits (14 Commits)

The following 14 upstream commits were reviewed, adapted, and merged:

| Commit Hash | Upstream Title | Purpose & AgentHub Integration |
|---|---|---|
| `94d206e7` | `[codex] show persisted usage and token speed for completed runs (#3241)` | Displays persisted token usage count and token speed (tokens/sec) for completed Codex runs. |
| `f918e0fb` | `fix Grok Chat Completions roles for DeepSeek (#3244)` | Normalizes role mapping in Grok completions when routing to DeepSeek models. |
| `96469c57` | `Fix agent usage attribution, interrupted cards and cumulative totals (#3246)` | Corrects agent-specific token attribution, handles interrupted run cards gracefully, and computes cumulative totals. |
| `97203089` | `fix coding agent context overflow recovery (#3204)` | Prevents unhandled context overflow crashes during long coding agent sessions with automatic context recovery. |
| `1ecc1115` | `fix(chat-run): allow reading a session owned by another profile on the same socket (#3242)` | Enables socket clients to inspect authorized sessions across profiles on the same socket connection. |
| `fe6754b0` | `feat: show group chat run usage inside reply bubbles (#3248)` | Renders token usage and timing metadata inline within group chat message bubbles. |
| `3a247543` | `[codex] fix Studio drawers and workspace picker UI (#3247)` | Resolves layout and positioning glitches in Studio drawer components and workspace directory pickers. |
| `4b722037` | `feat(usage): select configured providers and models for pricing (#3253)` | Allows users to map custom providers and models into the usage and cost estimation catalog. |
| `8564948c` | `fix(claude): drain native stdout before persisting turn completion (#3260)` | Ensures the stdout stream from Claude Code is completely drained before writing completion records, eliminating truncated output. |
| `d8c7b5e0` | `fix(claude): reconcile text snapshots by message instead of block index (#3263)` | Reconciles streaming text snapshots by message ID rather than unstable block indices. |
| `ea5bcb9f` | `fix(agent-updates): refresh manual update state and guard active sessions (#3261)` | Refreshes UI state on manual agent updates and protects running sessions from unexpected agent binary restarts. |
| `1e8704c0` | `feat(coding-agents): add Antigravity CLI global integration (#3256)` | Adds full first-class integration for Google Antigravity CLI into the Coding Agent manager and workspace. |
| `78b71bf5` | `fix(antigravity): preserve macOS keychain access in global mode (#3266)` | Preserves macOS Keychain environment and credentials when running Antigravity CLI in global mode. |
| `c1505041` | `fix(files): restore workspace downloads in tree menu and diff toolbar (#3268)` | Restores direct file downloads from the workspace file tree context menu and the diff viewer toolbar. |

---

## 3. Excluded Upstream Commits

The following commits were intentionally excluded or reverted during curation:

1. **`2c27ee49`**: `fix(navigation): distinguish device connections with monitor and phone icon (#3262)`
   - **Reason**: Targets navigation UI for mobile phone connections and LAN devices. AgentHub has permanently removed device connection and phone app synchronization stacks.
2. **`354894f8`**: `feat: add API relay partner page and per-key usage (#3257)`
   - **Reason**: Introduces commercial affiliate/partner relay marketing pages (`apikey.fan`). AgentHub enforces zero commercial promotions, affiliate referrals, or proprietary upsells.
3. **`49909062`**: `fix: preserve Antigravity identity in Live Activity pushes (#3272)`
   - **Reason**: Targets iOS Live Activity pushes routed through upstream proprietary push servers. AgentHub does not use upstream mobile push channels and exclusively provides self-hosted Bark push.

---

## 4. Invariants & Security Architecture

- **No Marketing / Default Relays**: No hardcoded third-party referral links, affiliate provider presets, or sponsored default image generation models (`fun-codex`).
- **No Mobile App Resurrection**: Device pairing, LAN discovery, MCU voice hardware (LittleBox), and closed-source mobile relay layers remain purged.
- **Bark Push Maintained**: Chat session event notifications (turn complete, approval required, question asked) are routed exclusively through per-user self-hosted Bark channels.
- **JEV Evaluation Guarded**: The TypeSafe AI (JEV) evaluation service remains completely optional and disabled by default. It transmits no data unless explicitly configured with an API key by a super administrator.
- **Custom Build Protection**: Guard middleware and CLI handlers block automated updates on both `-agenthub.` and legacy `-tatin.` releases (`409 custom_build_protected`), safeguarding custom source builds from being overwritten by upstream npm or release binaries.
