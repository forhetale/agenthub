# AgentHub Customization

**AgentHub** (formerly TATin Studio) is a source-level customization of
[Ekko Studio / Hermes Studio](https://github.com/EKKOLearnAI/ekko-studio), synced through upstream
**v0.7.31** and published under the version string **`0.7.31-agenthub.1`** (desktop package `0.7.31`).

This fork is not affiliated with the upstream project. All upstream code, documentation, and
the upstream BSL-1.1 license remain in effect except for the deliberate deltas described below.

- [English](#english)
- [简体中文](#简体中文)

---

## English

### What this fork changes

1. **Rebranding.** The user-visible product name is **AgentHub**: page title, PWA manifest,
   login screen, chat tab titles, i18n strings across all locales, push notification texts, and
   the generated OpenAPI title. The version string is `0.7.31-agenthub.1`. The npm package name
   (`hermes-web-ui`), CLI command binary, API prefixes, MCP server names (`ekko-studio-*`), data
   directories (`~/.hermes-web-ui`), and the bundled **Ekko Agent** name are unchanged for
   ecosystem and configuration compatibility. Upstream LICENSE and copyright notices are
   preserved; this fork does not impersonate the upstream product.

2. **Bark push channel.** A per-user outbound Bark channel for chat-session notifications,
   available at **sidebar → Message push** (that page contains only this Bark panel).
   Upstream surfaces this fork does not use are completely removed:
   the **App download hub** (mobile platform cards, download QR codes, mobile release
   manifest), the **Little Box / MCU voice** stack (device management with remote relay,
   firmware OTA distribution, the ESP32-C3 firmware package, MCU voice endpoints,
   socket events, prompt audio, and tables), the **App connections/relay and LAN device stacks**
   (app-login, app_connections and authorization-code tables, app relay servers/clients,
   chunked app uploads, app_access tokens, App event subscriptions, `/api/devices/*`, the
   devices table, LAN discovery and peer terminals, and matching MCP toolsets), and the
   **Studio social-channel senders** (Telegram/Feishu/Weixin adapters with their account
   tables). Every Device Connections tab except the Bark panel is removed, and session
   push runs through **Bark only** with a notification-language setting (default Chinese).
   Hermes' own Channels platform page (10 platforms) and the HTTP webhook pipeline remain
   intact.
   - Each user chooses whether chats they start **push by default** (on unless turned off);
     each chat can still toggle push off or on in its settings, including before its first
     message, and a chat started with a slash command counts as one the user starts. A
     `/branch` keeps its parent's setting. Sessions created by system automation (workflows, group chat
     agents) never push unless explicitly enabled by their creator.
   - **Title and reply summary** is an opt-in per user (off by default): notifications are
     titled with the chat title, and completed runs show a plain summary of the final reply
     (up to 160 characters). Approvals and questions keep their descriptive status text.

3. **Paid surfaces removed.** Every upstream surface that sells or upsells commercial
   products is removed: the mobile-app download page with pricing/purchase buttons,
   App access-failure purchase prompts and entitlement messaging, the Little Box hardware purchase
   entry, App-bound session sharing with App purchase-entitlement checks, and the
   App/relay stacks behind them.
   - The navigation's **API Relay** entry (a referral link to apikey.fan) is removed.
   - The apikey.fan relay is no longer built in: the Codex-apikey.fan and Claude-apikey.fan
     provider presets, the provider form's referral sign-up link, the automatic renaming of
     apikey.fan addresses to those presets, and the one-time apikey.fun → apikey.fan startup
     migration are gone. Providers already saved under those names keep working as ordinary
     custom providers. Studio image generation does not default to a provider named
     `fun-codex`: configure a custom provider under Models → Auxiliary Models (Hermes)
     (`auxiliary.image_generation.provider` in the profile's `config.yaml`), otherwise it returns
     `image_provider_not_configured`.
   - The sidebar footer does not link to the commercial product site (`ekkostudio.xyz`); the
     GitHub link to the upstream repository remains as attribution.
   - Requests to OpenRouter do not carry upstream app attribution (`HTTP-Referer:
     https://ekkostudio.xyz`, `X-OpenRouter-Title: Ekko Studio`), so usage is not credited to
     Ekko Studio on OpenRouter's app rankings. `HERMES_OPENROUTER_APP_*` can still set one for
     Hermes bridge runs; Ekko Agent, coding-agent gateway and model-discovery requests send none.
   - Studio announcements do not query the upstream feed (`api.ekkostudio.xyz`). Without
     a self-hosted feed configured via `HERMES_WEB_UI_ANNOUNCEMENTS_URL`, Studio contacts no announcement
     server and shows no announcements.

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
   The desktop package version is `0.7.31`; the bundled Web UI's `-agenthub.` version marks
   the desktop build as custom. Note: built-in guards protect running instances and APIs; they do
   not prevent an external manual shell command like `npm install -g hermes-web-ui` from
   overwriting files, so always install and update via source build.

   Version preview (`/api/studio/update/preview/*`, super administrators only) remains available:
   it checks out a tag into a separate directory with its own Web UI state and ports
   without replacing the running install.

5. **Tests & OpenAPI.** Focused Vitest coverage for Bark (encryption at rest, per-user isolation,
   redaction semantics, transport error mapping, session push, default push, and previews) and
   settings panel tests; `docs/openapi.json` is generated with Bark endpoints. Every custom-build
   update guard is covered by automated unit tests.

---

### Upstream Sync History & v0.7.31 Sync

The fork preserves upstream history starting from v0.7.21 as a common ancestor:
- **v0.7.22 through v0.7.26**: Merged release-by-release via curated branches, removing mobile app and paid features (legacy `0.7.26-tatin.1`).
- **v0.7.29 (`0.7.29-agenthub.1`)**: Curated sync importing 14 useful upstream commits while excluding commercial, device, and proprietary mobile app commits. Ledger: [`docs/upstream-sync-0.7.29.md`](./docs/upstream-sync-0.7.29.md).
- **v0.7.31 (`0.7.31-agenthub.1`)**: Curated sync importing 7 upstream improvements (Antigravity & Cursor images/prompts, model ID path segment matching, unified metadata & pricing, chat creation optimization, comic theme reload persistence) while excluding mobile P2P/WebRTC relays. Ledger: [`docs/upstream-sync-0.7.31.md`](./docs/upstream-sync-0.7.31.md).

#### Upstream Commits Summary:
- **Accepted (14 commits)**:
  - `94d206e7`: Persisted usage and token speed for completed Codex runs.
  - `f918e0fb`: DeepSeek role normalization for Grok completions.
  - `96469c57`: Agent usage attribution, interrupted cards, and cumulative totals.
  - `97203089`: Context overflow recovery for coding agents.
  - `1ecc1115`: Cross-profile session reading on the same socket connection.
  - `fe6754b0`: Group chat run usage display inside message bubbles.
  - `3a247543`: Codex drawer and workspace picker UI fixes.
  - `4b722037`: Custom provider and model selection for usage pricing.
  - `8564948c`: Claude Code native stdout drain before turn completion.
  - `d8c7b5e0`: Claude text snapshot reconciliation by message ID.
  - `ea5bcb9f`: Manual agent update refresh and active session protection.
  - `1e8704c0`: Google Antigravity CLI first-class integration.
  - `78b71bf5`: Antigravity macOS keychain access preservation in global mode.
  - `c1505041`: Workspace file tree menu and diff toolbar download restorations.
- **Excluded (3 commits)**:
  - `2c27ee49`: Device connections navigation icons (LAN/device features removed).
  - `354894f8`: Commercial API relay partner page (`apikey.fan` referral).
  - `49909062`: iOS Live Activity pushes for Antigravity (proprietary mobile push removed).
- **Fork Invariants**:
  - **JEV (TypeSafe AI)**: Included but strictly disabled by default. Requires an explicit API key; only super administrators can configure it.
  - **Coding Agents**: Supports Hermes, Ekko, Claude Code, Codex, Pi, Grok, OpenCode, DeepSeek Harness (DSH), Antigravity, and Cursor.
  - **Verification**: Full test suites and build artifacts are executed and verified independently by the parent orchestration process.

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

1. **品牌更名**：产品显示名为 **AgentHub**（历史定制版曾用 TATin Studio）：页面标题、PWA manifest、登录页、会话标签标题、各语言界面文案、推送提示文案、生成的 OpenAPI 标题均已更新。当前版本号为 `0.7.31-agenthub.1`（桌面包 `0.7.31`）。npm 包名（`hermes-web-ui`）、CLI 命令、API 前缀、MCP 服务名（`ekko-studio-*`）、数据目录（`~/.hermes-web-ui`）及内置 **Ekko Agent** 名称均保持不变以维持生态兼容。上游 LICENSE 与版权声明原样保留；本分支与上游团队无关联，不冒充上游产品。

2. **Bark 推送通道**：按登录用户隔离的 Bark 消息推送，入口在 **侧边栏 → 消息推送**（该页面仅包含 Bark 面板）。本分支不需要的上游功能已全部移除：**App 下载页**（手机平台下载卡片、下载二维码、移动版本清单请求）、**小方盒 / MCU 语音**（设备管理与远程中继、固件 OTA 分发、ESP32-C3 固件包、MCU 语音接口与事件、提示音与数据表）、**App 互联与中继**（app-login、连接与授权码表、云端/本地中继、App 分片上传、app_access 令牌、App 事件订阅）、**局域网设备**（`/api/devices/*`、devices 表、局域网发现与对等终端、对应 MCP 工具集）、**Studio 社交渠道消息**（Telegram / 飞书 / 微信适配器与账号表），以及「消息推送」页除 Bark 面板外的全部标签。会话推送**只走 Bark**，并提供通知语言选项（默认中文）；Hermes 自带「频道」平台页（10 个平台）与 HTTP Webhook 链路保持不变。
   - 粘贴 Bark App 复制的推送地址即可解析服务地址与 Device Key，也可手动填写；保存后可用测试按钮验证。
   - 只发送三类会话状态通知：**运行完成、等待审批、等待回答**；中断不推送；点击通知不会审批任何操作。
   - **新会话默认推送**：每个用户可自行选择（默认开启），各会话仍可在设置里单独开关，以斜杠命令开始的会话也算用户发起的会话，`/branch` 分支沿用父会话设置。系统自动创建的会话（工作流、群聊 Agent）除非创建者显式开启，否则不推送。
   - **推送附带标题和回复摘要**：每个用户可选，默认关闭。开启后通知标题为会话标题，运行完成时正文为最终回复摘要（最多 160 字）；审批与提问仍使用状态文案。
   - 推送在服务端发送，后端需保持运行；无持久发送队列，最近结果与去重缓存随重启清空。

3. **移除商业与付费项**：上游商业售卖入口全部删除——手机 App 下载页及其购买按钮、App 访问失败时的购买提示与付费权益文案、小方盒硬件购买入口、带 App 付费权益校验的 App 会话分享，以及背后的 App 互联/中继链路。
   - 导航中的 **API Relay** 入口（apikey.fan 推广注册链接）已删除。
   - 不再内置 apikey.fan 中转站：删除了 Codex-apikey.fan 与 Claude-apikey.fan 供应商预设、推广注册链接、自动改名逻辑等。Studio 图片生成不再默认使用 `fun-codex`：需在「模型 → 辅助模型（Hermes）」中配置自定义供应商，否则返回 `image_provider_not_configured`。
   - 侧边栏底部不再链接上游商业官网（`ekkostudio.xyz`）；保留指向上游仓库的 GitHub 链接作为署名。
   - 发往 OpenRouter 的请求不再附带上游应用归属（`HTTP-Referer: https://ekkostudio.xyz` 等）。
   - Studio 公告不再读取上游公告源（`api.ekkostudio.xyz`）；未配置自己的公告源时不会访问任何公告服务器，也不弹公告。

4. **定制版升级保护**：在 `-agenthub.` 版本及旧版 `-tatin.` 上，所有可能用上游包替换本定制版的内部路径都被拦截：
   - `hermes-web-ui update` / `upgrade` 拒绝执行；
   - `POST /api/studio/update` 返回 `409 custom_build_protected`；
   - `POST /api/hermes/runtime-versions/webui/download` 与 `POST /api/hermes/runtime-versions/active-webui` 返回 `409 custom_build_protected`；
   - npm 升级检查停用，界面不提示上游更新；
   - 桌面端启动时不检查更新，托盘提示定制版需从源码重新构建，更新的下载与安装入口拒绝定制版。
   注意：内置保护仅拦截运行中服务与 API；外部手动执行 `npm install -g hermes-web-ui` 会覆盖源码构建，请始终通过源码更新。

5. **测试与 OpenAPI**：Bark 相关 Vitest 覆盖（加密存储、用户隔离、脱敏语义、传输错误映射、会话推送等）与设置面板测试；`docs/openapi.json` 包含 Bark 接口。每条定制版升级保护都有对应单元测试。

---

### 上游同步历史与 v0.7.31 同步

本分支将上游 v0.7.21 记录为共同祖先：
- **v0.7.22 至 v0.7.26**：逐个版本通过定制分支合并，剔除 App 与商业付费改动（历史 `0.7.26-tatin.1`）。
- **v0.7.29（`0.7.29-agenthub.1`）**：合并 14 个高价值上游提交，排除商业中继、设备连接与移动 App 提交。记录见 [`docs/upstream-sync-0.7.29.md`](./docs/upstream-sync-0.7.29.md)。
- **v0.7.31（`0.7.31-agenthub.1`）**：合并 7 个核心改动（Antigravity/Cursor 图片与输入、模型 ID 斜杠尾段匹配、统一元数据与定价、新建会话免探测加速、漫画主题刷新持久化），排除移动端 P2P 直连堆栈。记录见 [`docs/upstream-sync-0.7.31.md`](./docs/upstream-sync-0.7.31.md)。

#### 上游提交摘要：
- **合入（14 项）**：
  - `94d206e7`：Codex 完成运行持久化用量与每秒 Token 速度展示。
  - `f918e0fb`：Grok 补全路由 DeepSeek 模型的角色规范化修复。
  - `96469c57`：Agent 用量归属修复、中断卡片处理与累计总量。
  - `97203089`：Coding Agent 上下文超限自动恢复。
  - `1ecc1115`：支持同一 Socket 连接跨 Profile 读取会话。
  - `fe6754b0`：群聊气泡内展示单次回复用量与耗时。
  - `3a247543`：Codex 抽屉与工作区选择器 UI 修复。
  - `4b722037`：用量统计支持选择已配置的 Provider 与模型计价。
  - `8564948c`：Claude Code 原生标准输出流排空后再持久化轮次。
  - `d8c7b5e0`：Claude 文本快照按消息 ID 对齐修复。
  - `ea5bcb9f`：手动更新 Agent 状态刷新与活跃会话保护。
  - `1e8704c0`：Google Antigravity CLI 一等公民接入。
  - `78b71bf5`：Antigravity 全局模式保留 macOS Keychain 访问。
  - `c1505041`：恢复工作区文件树菜单与 Diff 工具栏文件下载。
- **排除（3 项）**：
  - `2c27ee49`：设备连接导航图标（已移除设备模块）。
  - `354894f8`：商业 API 中转推广合作页（apikey.fan）。
  - `49909062`：Antigravity 灵动岛推送（已移除移动 App 专用推送）。
- **架构保证**：
  - **JEV 评估服务**：保留但默认完全关闭，需超级管理员手动配置 API Key。
  - **Agent 支持列表**：Hermes、Ekko、Claude Code、Codex、Pi、Grok、OpenCode、DeepSeek Harness (DSH)、Antigravity 与 Cursor。
  - **验证**：完整的测试与构建执行由父编排流程统一调度验证。

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
