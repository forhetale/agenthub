# Upstream Sync Ledger: v0.8.32 (`0.8.32-agenthub.1`)

This document records the curated sync from upstream `EKKOLearnAI/ekko-studio` (`v0.7.32` through **`v0.8.32`**, commit `f57b784f7c529a406899d56586df1f8d8a313557`) into **AgentHub**.

AgentHub maintains a local-first, privacy-respecting, de-commercialized fork with complete internal rebranding (`Ekko Studio` → `AgentHub`, `Ekko Agent` → `Hub Agent`, `packages/ekko-agent` → `packages/hub-agent`, `modules/ekko` → `modules/hub-agent`).

---

## 1. Versioning & Scope

- **Root Package Version**: `0.8.32-agenthub.1` (`package.json`, keeping `"name": "hermes-web-ui"`)
- **Desktop Package Version**: `0.8.32` (`packages/desktop/package.json`)
- **Fork Repository**: [https://github.com/forhetale/agenthub.git](https://github.com/forhetale/agenthub.git)
- **Sync Range**: `v0.7.31` → `v0.8.32` (342 upstream commits curated)

---

## 2. Accepted Upstream Capabilities & Improvements

1. **Plugin System & `@agenthub/plugin-sdk` (`v0.8.15`–`v0.8.32`)**:
   - Canonical SDK v1 (`packages/plugin-sdk` retaining MIT `LICENSE` and `NOTICE`), scoped/global host APIs (`models`, `agents`, `sessions`, `bots`, `groupChats`, `workflows`, `files`, `browser`), inbound HTTP interception hooks, single-chat compression plugin hooks, dedicated/shared `agenthub-plugins` MCP server discovery, standalone `agenthub plugins` CLI workflow, and GitHub HTTPS / local / dev-link installations.
2. **Account-Wide Model Gateway & Provider Management**:
   - Unified `/api/agenthub/models/*` OpenAI Responses, Chat Completions, Anthropic Messages, and Gemini Contents gateway, account-scoped Provider credentials, per-API-key USD lifetime caps, prompt caching accounting, and on-demand provider catalogs.
3. **Personal Assistant (Person/BOT) & Task Workflows**:
   - Account-owned Person conversations (`zhezhe` / bots), shared workspaces, parallel/multi-round collaboration flows, background worker tasks with acceptance verification, cron schedules, and optional JEV memory evaluations (`personMemory*` + `hubAgentComputerUse*`).
4. **Desktop Browser & Windows ARM64 Packaging**:
   - Embedded Desktop browser automation (`agenthub_browser_*` MCP tools) and CDP bridge for plugins, Windows ARM64 native `sherpa-onnx-node` speech binding + `latest-arm64.yml` updater manifest support, and AppImage embedded blockmaps.
5. **14 Coding Agents & Runtime Improvements**:
   - Added local/CLI coding agent integrations (Qwen Code, Kimi Code, CodeBuddy, Qoder, GitHub Copilot, ZCode alongside Claude Code, Codex, Pi, Grok, OpenCode, DSH, Cursor, Antigravity), DSH agent presets, Grok reasoning replay, and `AGENTHUB_*_TIMEOUT_MS` ACP timeout configuration.
6. **UI & Session Reliability**:
   - Theme library ZIP export/import (`format: "agenthub-theme"`, accepting legacy `"ekko-studio-theme"`), workspace directory shortcuts, message multi-selection batch deletion, session-task ledgers, and voice stage improvements.

---

## 3. Excluded Upstream Features & De-Commercialization

1. **Mobile App, LAN/Relay & P2P Transport Stacks**:
   - Excluded `app-connections`, `app-relay`, `app-upload`, `session-shares`, `devices` / LAN discovery, `werift` / WebRTC P2P pairing, mobile App download hub, App Live Activity pushes, and `mobile-location` / `mobile-calendar` / `mobile-reminders` / `mobile-health` MCP/API routes.
2. **MCU / ESP32 Hardware Stack**:
   - Excluded `packages/mcu` (`esp32-c3` firmware), `mcu-devices` / `mcu-firmware` routes, `mcu:*` scripts, and `dist/mcu` build artifacts.
3. **Studio Outbound Social Channels**:
   - Excluded `social-messages` Telegram/Feishu/Weixin Studio sender adapters in favor of AgentHub's per-user encrypted **Bark push** (`modules/studio/routes/notifications.ts`, `/api/studio/notifications/bark*`). Hermes's built-in Channels remain intact.
4. **Commercial Links, Feeds & Dual-Package npm Publishing**:
   - Removed commercial `apikey.fan` API Relay presets/links, `api.ekkostudio.xyz` plugin marketplace & announcement defaults (unless explicitly configured via env), `download.ekkolearnai.com` & `ekkostudio.xyz` URLs, `/api/studio/models/cloud-link`, OpenRouter attribution defaults, and upstream-only `ekko-studio` npm publishing (`pack-npm-releases.mjs`, `publish-npm-releases.mjs`, `npm-publish.yml`).

---

## 4. Fork Invariants Maintained

- **Custom-Build Update Protection**: Refuses upstream self-updates on `-agenthub.` and legacy `-tatin.` builds across CLI (`bin/hermes-web-ui.mjs`), backend APIs (`custom_build_protected`), and Desktop (`updater.ts` / `updater-helpers.ts`).
- **Per-User Bark Push**: AES-256-GCM encrypted Device Keys, SSRF/redirect guards, default session push, and opt-in title/reply summary notifications preserved across v0.8.32.
- **User Custom Desktop Icons Preserved**: Custom branding assets under `packages/desktop/build/icon*` remain intact alongside non-commercial `AgentHub` build identifiers (`com.hermeswebui.studio`).
