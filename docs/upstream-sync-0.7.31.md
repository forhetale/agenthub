# Upstream Sync Ledger: v0.7.31 (`0.7.31-agenthub.1`)

This document records the curated sync from upstream `EKKOLearnAI/ekko-studio` up to release **v0.7.31** into **AgentHub**.

AgentHub maintains a local-first, privacy-respecting, de-commercialized fork. Upstream features, bug fixes, and runtime improvements are selectively imported through a curated branch, while commercial relays, proprietary mobile app dependencies, and upsell surfaces remain strictly excluded.

---

## 1. Versioning & Scope

- **Root Package Version**: `0.7.31-agenthub.1` (`package.json`)
- **Desktop Package Version**: `0.7.31` (`packages/desktop/package.json`)
- **Fork Repository**: [https://github.com/forhetale/agenthub.git](https://github.com/forhetale/agenthub.git)
- **Base Upstream Baseline**: v0.7.29 → v0.7.31
- **Build / Test Verification**: Verified with `vue-tsc`, `tsc`, full Vite and server production builds, and 303 passing unit/integration tests across client and server.

---

## 2. Accepted Upstream Commits

The following upstream commits were reviewed, adapted, and merged:

| Commit Hash | Upstream Title | Purpose & AgentHub Integration |
|---|---|---|
| `1eab1bcb` | `fix theme style persistence on reload (#3302)` | Fixes comic theme style persistence so saved styles survive page refreshes and reboots. |
| `f00b8c98` | `fix Copilot streamed tool arguments (#3286)` | Preserves empty arguments prefix during streaming instead of forcing object brackets that corrupt JSON. |
| `08833817` | `[codex] default chats to Ekko and avoid CLI probes during creation (#3284)` | Defaults new chats to Ekko and lists only installed Agents in catalog order, avoiding CLI probes on creation. |
| `6f703de9` | `[codex] avoid history loading for unsent chats (#3288)` | Avoids unnecessary history resume calls for unsent draft chats, eliminating loading stalls. |
| `333bdc60` | `[codex] unify model metadata and pricing resolution (#3298)` | Unifies model metadata, runtime capabilities, pricing resolution, and endpoint context windows. |
| `feff42e4` | `fix model ID matching by final path segment (#3300)` | Matches model metadata by final path segment for custom/relayed model IDs (e.g. `custom/deepseek-v4-pro`). |
| `82881c62` | `support coding agent images and Windows long prompts (#3285)` | Adds image input and stdin prompt support for Antigravity CLI and Cursor CLI. |

---

## 3. Excluded Upstream Commits

The following commits were intentionally excluded during curation:

1. **`bc649be5` / `0c4792e6` / `0c283647`**: `add authenticated direct App transport with relay fallback (#3290, #3292, #3303)`
   - **Reason**: Introduces WebRTC/P2P pairing and `werift` dependencies for official mobile app transport. AgentHub uses pure Web + self-hosted Bark push.
2. **`d6606a2f`**: `remove group chat upgrade notice (#3306)`
   - **Reason**: Upstream marketing/upgrade notices; AgentHub does not include upstream commercial banners.
3. **`2e3bf605` / `942bb78f`**: Desktop Linux autostart / diagnostic PRs
   - **Reason**: Desktop Linux specific adjustments; not relevant to current macOS/Web deployments.

---

## 4. Invariants & Security Architecture

- **No Marketing / Default Relays**: No hardcoded third-party referral links, affiliate provider presets, or sponsored models.
- **Bark Push Maintained**: Chat session event notifications remain routed exclusively through per-user self-hosted Bark channels.
- **Local Coding Agents First-Class**: First-class integration for Google Antigravity CLI and Cursor CLI with macOS Keychain access and image input.
- **Custom Build Protection**: Guard middleware and CLI handlers block automated updates (`409 custom_build_protected`), safeguarding custom source builds from being overwritten by upstream npm or release binaries.
