# AgentHub Customization

**AgentHub** (formerly TATin Studio) is a source-level customization of
[Ekko Studio / Hermes Studio](https://github.com/EKKOLearnAI/ekko-studio), synced through upstream
**v0.8.32** and published under the version string **`0.8.32-agenthub.1`** (desktop package `0.8.32`).

This fork is not affiliated with the upstream project. All upstream code, documentation, and
the upstream BSL-1.1 license remain in effect except for the deliberate deltas described below.

- [English](#english)
- [简体中文](#简体中文)

---

## English

### What this fork changes

1. **Rebranding & Symbol Unification.** The user-visible product name is **AgentHub**: page title,
   PWA manifest, login screen, chat tab titles, i18n strings across all locales, push notification
   texts, desktop app product name, and generated OpenAPI title. The version string is
   `0.8.32-agenthub.1`. The bundled runtime is renamed to **Hub Agent** (`hub-agent`,
   `packages/hub-agent`, `modules/hub-agent`, `/api/hub-agent/*`, `.hub-agent`), CLI binaries expose
   `agenthub` and `agenthub-mcp` alongside compatibility aliases (`hermes-web-ui`,
   `hermes-web-ui-mcp`, `hermes-studio-mcp`), managed MCP servers use `agenthub-*` (`agenthub_*`
   tools with `hermes_studio_*` alias), the Model Gateway uses `/api/agenthub/models/*` (provider
   `agenthub`, `sk-agenthub-` keys), and exported theme ZIPs use `format: "agenthub-theme"` (still
   accepting legacy `"ekko-studio-theme"` on import). The npm package `"name"` (`hermes-web-ui`) and
   state directory (`~/.hermes-web-ui`) remain unchanged for upgrade continuity. Upstream LICENSE and
   copyright notices are preserved; this fork does not impersonate the upstream product.

2. **Bark push channel.** A per-user outbound Bark channel for chat-session notifications,
   available at **sidebar → Message push** (that page contains only this Bark panel).
   Upstream surfaces this fork does not use are completely removed:
   the **App download hub** (mobile platform cards, download QR codes, mobile release
   manifest), the **Little Box / MCU voice** stack (device management with remote relay,
   firmware OTA distribution, the ESP32-C3 firmware package, MCU voice endpoints,
   socket events, prompt audio, and tables), the **App connections/relay, session sharing, and LAN device stacks**
   (app-login, app_connections/app_relay_tokens/authorization-code/session_shares tables,
   app relay servers/clients, chunked app uploads, app_access tokens, App event subscriptions,
   `/api/devices/*`, the devices table, LAN discovery and peer terminals, `/api/studio/models/cloud-link`,
   and matching MCP toolsets), and the **Studio social-channel senders** (Telegram/Feishu/Weixin
   adapters with their account tables). Every Device Connections tab except the Bark panel is
   removed, and session push runs through **Bark only** with a notification-language setting
   (default Chinese). Hermes' own Channels platform page (10 platforms) and the HTTP webhook
   pipeline remain intact.
   - Each user chooses whether chats they start **push by default** (on unless turned off);
     each chat can still toggle push off or on in its settings, including before its first
     message, and a chat started with a slash command counts as one the user starts. A
     `/branch` keeps its parent's setting. Sessions created by system automation (workflows, group chat
     agents) never push unless explicitly enabled by their creator.
   - **Title and reply summary** is an opt-in per user (off by default): notifications are
     titled with the chat title, and completed runs show a plain summary of the final reply
     (up to 160 characters). Approvals and questions keep their descriptive status text.

3. **Paid & commercial surfaces removed.** Every upstream surface that sells, upsells, or links
   commercial services is removed: the mobile-app download page with pricing/purchase buttons,
   App access-failure purchase prompts and entitlement messaging, the Little Box hardware purchase
   entry, App-bound session sharing with purchase-entitlement checks, and the App/relay stacks behind them.
   - The navigation's **API Relay** entry (a referral link to apikey.fan) and built-in
     `apikey.fan` presets (`Codex-apikey.fan`, `Claude-apikey.fan`, auto-renaming, `fun-codex` default)
     are removed; configure image generation under Models → Auxiliary Models (Hermes), otherwise
     it returns `image_provider_not_configured`.
   - The sidebar footer does not link to the commercial product site (`ekkostudio.xyz`); the
     GitHub link to the upstream repository remains as attribution.
   - Requests to OpenRouter do not carry upstream app attribution (`HTTP-Referer:
     https://ekkostudio.xyz`, `X-OpenRouter-Title: Ekko Studio`). `HERMES_OPENROUTER_APP_*` can
     still set custom attribution for Hermes bridge runs when explicitly configured; Hub Agent,
     coding-agent gateway, and model-discovery requests send none.
   - Studio announcements and plugin marketplace submissions do not contact upstream commercial APIs
     (`api.ekkostudio.xyz`) unless explicitly configured via environment variables
     (`HERMES_WEB_UI_ANNOUNCEMENTS_URL` / `VITE_AGENTHUB_PLUGIN_MARKET_URL`).
   - Upstream Cloudflare update feeds (`download.ekkolearnai.com`) and `ekko-studio` npm
     dual-publishing scripts/workflows (`pack-npm-releases.mjs`, `publish-npm-releases.mjs`,
     `npm-publish.yml`) are removed.

4. **Custom-build update protection.** On `-agenthub.` builds (as well as legacy `-tatin.` builds),
   every internal path that could replace this build with an upstream package is blocked:
   - the CLI `update` / `upgrade` command refuses to run;
   - `POST /api/studio/update` returns `409 custom_build_protected`;
   - `POST /api/hermes/runtime-versions/webui/download` and
     `POST /api/hermes/runtime-versions/active-webui` return `409 custom_build_protected`
     (Hermes Agent runtime downloads and deleting downloaded versions still work);
   - npm update checks are disabled, so the UI never offers an upstream update;
   - the desktop app skips the startup update check, explains in tray → "Check for Updates"
     that custom builds are updated by rebuilding from source, and refuses update downloads/installs.
   The desktop package version is `0.8.32`; the bundled Web UI's `-agenthub.` version marks
   the desktop build as custom. Note: built-in guards protect running instances and APIs; they do
   not prevent an external manual shell command like `npm install -g hermes-web-ui` from
   overwriting files, so always install and update via source build.

   Version preview (`/api/studio/update/preview/*`, super administrators only) remains available:
   it checks out a tag into a separate directory with its own Web UI state and ports
   without replacing the running install.

5. **Tests & OpenAPI.** Focused Vitest coverage for Bark (encryption at rest, per-user isolation,
   redaction semantics, transport error mapping, session push, default push, and previews) and
   desktop/custom-build guards (`tests/desktop/updater.test.ts`); `docs/openapi.json` is generated
   with Bark and `/api/agenthub/models/*` / `/api/hub-agent/*` endpoints (without removed
   App/MCU/device/social/share routes).

---

### Upstream Sync History & v0.8.32 Sync

The fork preserves upstream history starting from v0.7.21 as a common ancestor:
- **v0.7.22 through v0.7.26**: Merged release-by-release via curated branches, removing mobile app and paid features (legacy `0.7.26-tatin.1`).
- **v0.7.29 (`0.7.29-agenthub.1`)**: Curated sync importing 14 useful upstream commits while excluding commercial, device, and proprietary mobile app commits. Ledger: [`docs/upstream-sync-0.7.29.md`](./docs/upstream-sync-0.7.29.md).
- **v0.7.31 (`0.7.31-agenthub.1`)**: Curated sync importing 7 upstream improvements while excluding mobile P2P/WebRTC relays. Ledger: [`docs/upstream-sync-0.7.31.md`](./docs/upstream-sync-0.7.31.md).
- **v0.8.32 (`0.8.32-agenthub.1`)**: Integrated upstream v0.7.32 through v0.8.32 features (Person workspace/accounts, Desktop Agent Browser, JEV evaluation harness, DSH profiles/plugins, ZCode/Qwen/Kimi/CodeBuddy/Qoder/Copilot/OpenCode/Cursor/Antigravity agents, Hub Agent `/context`/`/usage`/`/status`/`/compact`, theme ZIP archives, session tasks, voice stage, and security fixes) while complete rebranding (`Ekko Studio` → `AgentHub`, `Ekko Agent` → `Hub Agent`) and stripping all mobile App/P2P/MCU/devices/commercial feeds. Ledger: [`docs/upstream-sync-0.8.32.md`](./docs/upstream-sync-0.8.32.md).

- **Fork Invariants**:
  - **JEV (TypeSafe AI)**: Included but strictly disabled by default (`hubAgentMemoryEnabled`, `hubAgentSkillsEnabled`, `hubAgentComputerUseMatchEnabled`, `hubAgentComputerUseVerifyEnabled`, etc. all `false` until explicitly configured by a super administrator).
  - **Agents**: Supports Hermes, Hub Agent (`hub-agent`), and all 14 Coding Agents (`claude-code`, `codex`, `pi`, `grok`, `opencode`, `dsh`, `cursor`, `antigravity`, `qwen`, `kimi`, `codebuddy`, `qoder`, `copilot`, `zcode`).
  - **Verification**: Full test suites, harness checks, automation tests, and build artifacts are verified on isolated `HOME`/`TMPDIR` environments.

---

### Bark Security Design

- **Credential storage.** The Device Key is encrypted per user with AES-256-GCM. The key file
  lives at `~/.hermes-web-ui/notifications/.bark-key` with `0600` permissions, and per-user
  configs under `notifications/bark-<userId>.json`. HTTP reads never return the key; a blank key
  field keeps the previous value; deletion requires explicit confirmation. When backing up or
  restoring, keep `.bark-key` and the per-user configs together.
- **Transport.** HTTPS-only by default; URLs containing credentials, query, or fragment are
  rejected. Plain HTTP or private-network targets require a **super administrator** to enable
  "Allow private network / HTTP" (for trusted self-hosted Bark servers). DNS is validated and
  the connection is pinned to the resolved address with Host/SNI preserved; redirects are not
  followed; responses are capped at 64 KB and requests time out after 10 s. Per-user rate limit:
  30 requests/min. A request is retried only once and only after an explicit HTTP 429/503, never
  after ambiguous network failures. Before each attempt, the session switch and configuration
  are re-checked and sending is cancelled if they changed.
- **Privacy.** By default only the notification text (agent display name + event) is sent. With
  the title and reply summary turned on, the chat title and a summary of the final reply are
  sent as well; they pass through the Bark server and Apple's push service and can appear on
  the lock screen. Transport errors can embed credentials, so logs record identifiers only.

---

### Build & Run

Requires Node.js ≥ 23 (e.g. Node 26 on macOS Homebrew).

```sh
git clone https://github.com/forhetale/agenthub.git
cd agenthub
npm ci --ignore-scripts
npm rebuild node-pty sharp sherpa-onnx-node
npm run build
node bin/hermes-web-ui.mjs start 8648 --no-open
```

Do NOT run `npm install -g hermes-web-ui` — it installs the upstream package from the npm registry and overwrites the custom build.

---

## 简体中文

### 本分支的改动

1. **品牌与内部命名统一**：产品显示名为 **AgentHub**（历史定制版曾用 TATin Studio）：页面标题、PWA manifest、登录页、会话标签标题、各语言界面文案、推送提示文案、桌面应用名与生成的 OpenAPI 标题均已更新，版本号为 `0.8.32-agenthub.1`（桌面包 `0.8.32`）。内置 Agent 更名为 **Hub Agent**（`hub-agent`、`packages/hub-agent`、`modules/hub-agent`、`/api/hub-agent/*`、`.hub-agent`），CLI 提供 `agenthub` 与 `agenthub-mcp` 并保留兼容别名（`hermes-web-ui`、`hermes-web-ui-mcp`、`hermes-studio-mcp`），托管 MCP 服务名使用 `agenthub-*`（工具名 `agenthub_*`，保留 `hermes_studio_*` 兼容），Model Gateway 使用 `/api/agenthub/models/*`（Provider `agenthub`、`sk-agenthub-` 密钥前缀），主题 ZIP 导入导出使用 `format: "agenthub-theme"`（仍兼容导入 `"ekko-studio-theme"`）。npm 包名（`hermes-web-ui`）与默认数据目录（`~/.hermes-web-ui`）保持不变以确保持久状态升级兼容。上游 LICENSE 与版权声明原样保留；本分支与上游团队无关联，不冒充上游产品。

2. **Bark 推送通道**：按登录用户隔离的 Bark 消息推送，入口在 **侧边栏 → 消息推送**（该页面仅包含 Bark 面板）。本分支不需要的上游功能已全部移除：**App 下载页**（手机平台下载卡片、下载二维码、移动版本清单请求）、**小方盒 / MCU 语音**（设备管理与远程中继、固件 OTA 分发、ESP32-C3 固件包、MCU 语音接口与事件、提示音与数据表）、**App 互联与中继、会话分享及局域网设备**（app-login、连接与授权码/中继令牌/会话分享表、云端/本地中继、App 分片上传、app_access 令牌、App 事件订阅、`/api/devices/*`、devices 表、局域网发现与对等终端、`/api/studio/models/cloud-link` 与对应 MCP 工具集）、**Studio 社交渠道消息**（Telegram / 飞书 / 微信适配器与账号表），以及「消息推送」页除 Bark 面板外的全部标签。会话推送**只走 Bark**，并提供通知语言选项（默认中文）；Hermes 自带「频道」平台页（10 个平台）与 HTTP Webhook 链路保持不变。
   - 粘贴 Bark App 复制的推送地址即可解析服务地址与 Device Key，也可手动填写；保存后可用测试按钮验证。
   - 只发送三类会话状态通知：**运行完成、等待审批、等待回答**；中断不推送；点击通知不会审批任何操作。
   - **新会话默认推送**：每个用户可自行选择（默认开启），各会话仍可在设置里单独开关，以斜杠命令开始的会话也算用户发起的会话，`/branch` 分支沿用父会话设置。系统自动创建的会话（工作流、群聊 Agent）除非创建者显式开启，否则不推送。
   - **推送附带标题和回复摘要**：每个用户可选，默认关闭。开启后通知标题为会话标题，运行完成时正文为最终回复摘要（最多 160 字）；审批与提问仍使用状态文案。
   - 推送在服务端发送，后端需保持运行；无持久发送队列，最近结果与去重缓存随重启清空。

3. **移除商业与付费项**：上游商业售卖与推广入口全部删除——手机 App 下载页及其购买按钮、App 访问失败时的购买提示与付费权益文案、小方盒硬件购买入口、带 App 付费权益校验的 App 会话分享，以及背后的 App 互联/中继链路。
   - 导航中的 **API Relay** 入口（apikey.fan 推广注册链接）与内置 `apikey.fan` 中转站预设（`Codex-apikey.fan`、`Claude-apikey.fan`、推广注册链接、自动改名与 `fun-codex` 默认配置）已全部删除；图片生成需在「模型 → 辅助模型（Hermes）」中配置自定义供应商，否则返回 `image_provider_not_configured`。
   - 侧边栏底部不再链接上游商业官网（`ekkostudio.xyz`）；保留指向上游仓库的 GitHub 链接作为署名。
   - 发往 OpenRouter 的请求默认不再附带上游应用归属（`HTTP-Referer: https://ekkostudio.xyz` 等）；Hermes Bridge 仅在显式配置 `HERMES_OPENROUTER_APP_*` 时附加。
   - Studio 公告与插件市场提交默认不联系上游商业服务器（`api.ekkostudio.xyz`），仅在显式配置自建环境变量（`HERMES_WEB_UI_ANNOUNCEMENTS_URL` / `VITE_AGENTHUB_PLUGIN_MARKET_URL`）时请求指定源。
   - 移除上游 Cloudflare 自动更新源（`download.ekkolearnai.com`）及 `ekko-studio` 双包 npm 发布脚本与工作流（`pack-npm-releases.mjs`、`publish-npm-releases.mjs`、`npm-publish.yml`）。

4. **定制版升级保护**：在 `-agenthub.` 版本及旧版 `-tatin.` 上，所有可能用上游包替换本定制版的内部路径都被拦截：
   - `agenthub` / `hermes-web-ui` 的 `update` / `upgrade` 拒绝执行；
   - `POST /api/studio/update` 返回 `409 custom_build_protected`；
   - `POST /api/hermes/runtime-versions/webui/download` 与 `POST /api/hermes/runtime-versions/active-webui` 返回 `409 custom_build_protected`；
   - npm 升级检查停用，界面不提示上游更新；
   - 桌面端启动时不检查更新，托盘提示定制版需从源码重新构建，更新的下载与安装入口拒绝定制版。
   注意：内置保护仅拦截运行中服务与 API；外部手动执行 `npm install -g hermes-web-ui` 会覆盖源码构建，请始终通过源码更新。

5. **测试与 OpenAPI**：Bark 相关 Vitest 覆盖（加密存储、用户隔离、脱敏语义、传输错误映射、会话推送等）、桌面更新保护单测（`tests/desktop/updater.test.ts`）与结构化 Harness 检查；`docs/openapi.json` 包含 Bark 与 `/api/agenthub/models/*`、`/api/hub-agent/*` 接口并移除已排除路由。

---

### 上游同步历史与 v0.8.32 同步

本分支将上游 v0.7.21 记录为共同祖先：
- **v0.7.22 至 v0.7.26**：逐个版本通过定制分支合并，剔除 App 与商业付费改动（历史 `0.7.26-tatin.1`）。
- **v0.7.29（`0.7.29-agenthub.1`）**：合并 14 个高价值上游提交，排除商业中继、设备连接与移动 App 提交。记录见 [`docs/upstream-sync-0.7.29.md`](./docs/upstream-sync-0.7.29.md)。
- **v0.7.31（`0.7.31-agenthub.1`）**：合并 7 个核心改动，排除移动端 P2P 直连堆栈。记录见 [`docs/upstream-sync-0.7.31.md`](./docs/upstream-sync-0.7.31.md)。
- **v0.8.32（`0.8.32-agenthub.1`）**：合入上游 v0.7.32 至 v0.8.32 功能改进（Person 工作区与记忆、桌面 Agent 浏览器、JEV 评估流水线、DSH 预设与插件、14 种 Coding Agent、Hub Agent `/context`/`/usage`/`/status`/`/compact`、主题 ZIP 压缩包导出导入、会话任务账本、实时语音舞台与安全加固），同时完成全仓库 `AgentHub` / `Hub Agent` 更名并彻底剔除 App/P2P/MCU/局域网设备/商业化端点。记录见 [`docs/upstream-sync-0.8.32.md`](./docs/upstream-sync-0.8.32.md)。

- **架构保证**：
  - **JEV 评估服务**：保留但默认完全关闭（`hubAgentMemoryEnabled`、`hubAgentSkillsEnabled`、`hubAgentComputerUse*` 等均默认 `false`），需超级管理员手动配置 API Key。
  - **Agent 支持列表**：Hermes、Hub Agent（`hub-agent`）以及全部 14 种 Coding Agents（`claude-code`、`codex`、`pi`、`grok`、`opencode`、`dsh`、`cursor`、`antigravity`、`qwen`、`kimi`、`codebuddy`、`qoder`、`copilot`、`zcode`）。
  - **验证**：所有测试、Harness 检查与构建均在隔离的 `HOME`/`TMPDIR` 环境下验证。

---

### Bark 安全设计

- **密钥存储**：Device Key 按用户使用 AES-256-GCM 加密存储；密钥文件位于 `~/.hermes-web-ui/notifications/.bark-key`（权限 0600），用户配置位于 `notifications/bark-<userId>.json`。HTTP 读取不回显 Key；编辑时留空保留原值；删除须显式确认。备份/恢复时必须同时保留 `.bark-key` 与各用户配置文件。
- **传输**：默认仅 HTTPS，拒绝带凭据、查询或片段的 URL；自建 HTTP 或内网目标须超级管理员显式启用\"允许内网 / HTTP\"。DNS 校验后固定连接已解析地址并保留 Host/SNI；不跟随重定向；响应上限 64 KB，请求 10 秒超时；每用户 30 次/分钟限流；仅对明确的 HTTP 429/503 重试一次；每次发送前复查会话开关与配置，变更即中止。
- **隐私**：默认只发送通知文案（Agent 显示名 + 事件）。开启\"推送附带标题和回复摘要\"后，还会发送会话标题与最终回复摘要。

---

### 构建与运行

需要 Node.js ≥ 23（如 macOS Homebrew node@26）。

```sh
git clone https://github.com/forhetale/agenthub.git
cd agenthub
npm ci --ignore-scripts
npm rebuild node-pty sharp sherpa-onnx-node
npm run build
node bin/hermes-web-ui.mjs start 8648 --no-open
```

请勿执行 `npm install -g hermes-web-ui`（会从官方 npm 覆盖为上游版本）。
