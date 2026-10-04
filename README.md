# AgentHub

<p align="center">
  <strong>Local-first, privacy-respecting AI workspace for multi-agent chat, coding, and visual workflows.</strong><br/>
  Independent community fork of Ekko Studio / Hermes Studio, purged of commercial relays and mobile upsells.
</p>

<p align="center">
  <a href="./README_zh.md">简体中文</a> · <a href="./CUSTOMIZATION.md">Customization Spec</a> · <a href="./docs/upstream-sync-0.7.29.md">Upstream Sync (v0.7.29)</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-BSL--1.1-blue.svg" alt="License: BSL-1.1" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D23-brightgreen.svg" alt="Node.js >= 23" /></a>
  <a href="https://github.com/forhetale/agenthub"><img src="https://img.shields.io/badge/release-0.7.29--agenthub.1-informational.svg" alt="Release 0.7.29-agenthub.1" /></a>
  <a href="https://github.com/Finb/Bark"><img src="https://img.shields.io/badge/push-Bark-ff5a5f.svg" alt="Push: Bark" /></a>
</p>

---

## What is AgentHub?

**AgentHub** is a clean, local-first workbench that unifies premier AI coding agents, autonomous runtimes, and visual orchestration inside a self-hosted desktop and web console.

Forked from [Ekko Studio](https://github.com/EKKOLearnAI/ekko-studio) (originally Hermes Studio), AgentHub is maintained at [forhetale/agenthub](https://github.com/forhetale/agenthub.git). While maintaining full ecosystem compatibility (via the `hermes-web-ui` CLI, `~/.hermes-web-ui` state directory, and `ekko-studio-*` MCP toolsets), AgentHub permanently removes upstream commercial funnels, proprietary mobile-app tie-ins, referral relays, and closed hardware dependencies.

### Supported Agent Families

AgentHub coordinates agents across three integrated families:

1. **Hermes Family**: [Hermes Agent](https://github.com/NousResearch/hermes-agent) — multi-profile isolation, providers, models, memories, skills, plugins, tasks, kanban, terminal backends, and 10 messaging platform channels.
2. **Ekko Family**: Ekko Agent — approval gates, clarification dialogues, persistent memory, and dedicated provider runtimes.
3. **Coding Agent Family**: Full desktop & web lifecycle for **Claude Code**, **Codex**, **Pi**, **Grok**, **OpenCode**, **DeepSeek Harness (DSH)**, **Antigravity CLI**, and **Cursor CLI**.

---

## Key Features

- **Streaming Multi-Agent AI Chat**: Socket.IO-driven streaming with live tokens/sec speed, persisted usage attribution, Markdown formatting, tool execution traces, inline file preview, and context overflow recovery.
- **Group Chat Rooms**: Multi-agent collaborative rooms with `@mention` message routing, token usage bubbles on replies, context summarization, and invite management.
- **Visual DAG Workflows**: Vue Flow canvas orchestrating multi-agent nodes, conditional logic, approval gates, file attachments, and replayable execution snapshots ([docs/workflow.md](./docs/workflow.md)).
- **Integrated Workspace Tools**: Remote/local file browser with diff toolbar & workspace tree downloads, interactive web terminal (PTY via node-pty and xterm), cards, voice input & speech synthesis ([docs/voice-dialogue.md](./docs/voice-dialogue.md)).
- **Preserved Platform Channels**: Hermes platform messaging integration for 10 platforms: Telegram, Discord, Slack, WhatsApp, Matrix, Feishu, DingTalk, QQBot, WeChat, and Enterprise WeChat, plus incoming HTTP webhooks.
- **Bark Push Notifications**: Self-hosted, encrypted (AES-256-GCM) push notifications via [Bark](https://github.com/Finb/Bark) for completed runs, approvals, and questions with per-session toggles.
- **Cleaned & De-commercialized**: Completely stripped of mobile app download popups, paid subscription prompts, LittleBox MCU hardware, LAN device pairing, and commercial API partner relays (`apikey.fan`).
- **Privacy & Safety by Default**: Optional TypeSafe AI evaluation (JEV) is disabled by default ([docs/jev.md](./docs/jev.md)). Custom update guards protect custom builds from upstream overwrites.

---

## Quick Start (Build & Run)

> [!WARNING]
> **Do NOT install via `npm install -g hermes-web-ui`**: That command pulls the upstream release package from npm and will overwrite your AgentHub customization. Always build from this repository.

### Prerequisites

- **Node.js**: `v23.0.0` or newer (tested with Node 26 on macOS Homebrew / Linux / Windows).
- **Python**: Python 3.10+ (for Hermes Agent runtime).
- **Native Build Tools**: `make`, `gcc`/`clang`, `python3` (for native compilation).

### Source Build & Launch

```bash
# 1. Clone the repository
git clone https://github.com/forhetale/agenthub.git
cd agenthub

# 2. Install dependencies (skipping pre-install scripts)
npm ci --ignore-scripts

# 3. Rebuild native modules
npm rebuild node-pty sharp sherpa-onnx-node

# 4. Build frontend, server, and generate OpenAPI definitions
npm run build

# 5. Start the AgentHub server (default port 8648)
node bin/hermes-web-ui.mjs start 8648 --no-open
```

Open **http://localhost:8648** in your browser. Fresh installs use `admin` / `123456`; change this password before exposing the server remotely. Existing installs keep their accounts and passwords.

### User State & Data Directory

AgentHub stores server configuration, SQLite databases, login records, and Bark encryption keys in `~/.hermes-web-ui` (or the directory specified by `HERMES_WEB_UI_HOME`). Hermes profile data remains safely isolated in `~/.hermes`.

### Desktop Application (Electron)

Build desktop installers on the target operating system and supported architecture; the commands below do not guarantee cross-platform builds:

```bash
# Package desktop distribution (skips remote feed publish)
npm run build:desktop

# Platform specific targets:
npm run build:desktop:mac    # macOS (dmg, zip)
npm run build:desktop:win    # Windows (nsis)
npm run build:desktop:linux  # Linux (AppImage, deb)
```

Outputs land in `packages/desktop/release`. Bundled desktop applications inherit custom build protection guards.

### Docker Compose

Single-container deployment with bundled Hermes Agent runtime:

```bash
docker compose up -d --build
docker compose logs -f hermes-webui
```

Compose defaults to **http://localhost:6060**; set `PORT` to change it. See [docs/docker.md](./docs/docker.md) for full Docker deployment options and environment variables.

---

## CLI Management

When running from source, use `node bin/hermes-web-ui.mjs <command>`:

| Command | Description |
|---|---|
| `start [port] [--no-open]` | Start AgentHub daemon in background |
| `restart [port]` | Restart background server and bridge broker |
| `stop` | Gracefully stop the background server |
| `status` | Check the Web UI daemon process status |
| `clear-login-locks [--restart]` | Clear IP-based login rate limit locks |
| `reset-default-login` | Reset superadmin credentials to `admin` / `123456` |
| `update` / `upgrade` | Blocked on custom builds (`-agenthub.` / `-tatin.`) to prevent overwrite |

---

## Update Guards & Maintenance

AgentHub embeds protection guards in the server, CLI, and desktop launcher that block automated update paths (`POST /api/studio/update` returns `409 custom_build_protected`).

To update AgentHub:
1. Stop running processes: `node bin/hermes-web-ui.mjs stop`
2. Pull latest commits: `git pull origin <branch>`
3. Reinstall & rebuild: `npm ci --ignore-scripts && npm rebuild node-pty sharp sherpa-onnx-node && npm run build`
4. Restart: `node bin/hermes-web-ui.mjs start 8648 --no-open`

*Note: Built-in guards protect against in-app updates and API downloads; they cannot prevent manual shell commands such as `npm i -g hermes-web-ui`. Always update through git.*

---

## Documentation

- **Customization & Security**: [CUSTOMIZATION.md](./CUSTOMIZATION.md)
- **v0.7.29 Upstream Sync Ledger**: [docs/upstream-sync-0.7.29.md](./docs/upstream-sync-0.7.29.md)
- **Architecture**: [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Docker Deployment**: [docs/docker.md](./docs/docker.md)
- **Coding Agents**:
  - DeepSeek Harness: [docs/dsh-management.md](./docs/dsh-management.md)
  - Google Antigravity: [docs/antigravity-cli.md](./docs/antigravity-cli.md)
- **Visual Workflows**: [docs/workflow.md](./docs/workflow.md)
- **Voice & TTS/STT**: [docs/voice-dialogue.md](./docs/voice-dialogue.md)
- **Optional JEV Evaluation**: [docs/jev.md](./docs/jev.md)

---

## License & Attribution

AgentHub is licensed under the [Business Source License 1.1](./LICENSE) (Licensor: EKKOLearnAI). Non-commercial use is granted under BSL-1.1 terms; commercial use requires a separate license from the licensor.

All upstream copyright notices, authors, and source attributions are preserved.
