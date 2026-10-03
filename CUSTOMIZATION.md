# TATin Studio Customization

**TATin Studio** is a source-level customization of
[Ekko Studio / Hermes Studio](https://github.com/EKKOLearnAI/ekko-studio), based on upstream
**v0.7.26** and published under the version string **`0.7.26-tatin.1`**.

This fork is not affiliated with the upstream project. All upstream code, documentation, and
the upstream BSL-1.1 license remain unchanged except for the deltas described below.

- [English](#english)
- [简体中文](#简体中文)

---

## English

### What this fork changes

1. **Rebranding.** The user-visible product name is **TATin Studio**: page title, PWA manifest,
   login screen, chat tab titles, i18n strings across all locales, push notification texts, and
   the generated OpenAPI title. The version string is `0.7.26-tatin.1`. The npm package name
   (`hermes-web-ui`), CLI commands, API prefixes, MCP server names, data directories, and the
   bundled **Ekko Agent** name are unchanged. The upstream LICENSE and copyright notices are
   preserved; this fork does not impersonate the upstream product.

2. **Bark push channel (new).** A per-user outbound Bark channel for chat-session notifications,
   available at **sidebar → Message push** (that page now contains only this Bark panel).
   Upstream surfaces this fork does not use are removed:
   the **App download hub** (mobile platform cards, download QR codes, mobile release
   manifest), the **Little Box / MCU voice** stack (device management with its remote relay,
   firmware OTA distribution, the ESP32-C3 firmware package, and the MCU voice endpoints,
   socket events, prompt audio and table), the **App connections/relay and LAN device stacks**
   (app-login, app_connections and authorization-code tables, app relay servers/clients,
   chunked app uploads, app_access tokens, App event subscriptions, `/api/devices/*`, the
   devices table, LAN discovery and peer terminals, and the matching MCP toolsets), and the
   **Studio social-channel senders** (Telegram/Feishu/Weixin adapters with their account
   tables). Every Device Connections tab except the Bark panel is gone as well, and session
   push now runs through **Bark only** with a notification-language setting (default
   Chinese). Hermes' own Channels platform page and the HTTP webhook pipeline remain
   unchanged.
   - Each user chooses whether chats they start **push by default** (on unless turned off);
     each chat can still turn push off or on in its settings, including before its first
     message, and a chat started with a slash command counts as one the user starts. A
     `/branch` keeps its parent's setting. Sessions the system creates (workflows, group chat
     agents) never push unless their creator enabled it.
   - **Title and reply summary** is an opt-in per user (off by default): notifications are
     titled with the chat title, and completed runs show a plain summary of the final reply
     (up to 160 characters). Approvals and questions keep their status text.

3. **Paid surfaces removed.** Every upstream surface that sells or upsells the commercial
   products is gone: the mobile-app download page with its pricing/purchase buttons, the App
   access-failure purchase prompts and entitlement messaging, the Little Box hardware purchase
   entry, the App-bound session sharing with its App purchase-entitlement check, and the
   App/relay stacks behind them. Session notifications are delivered by a self-hosted
   **Bark** channel with a per-session push switch; the upstream social-channel senders were
   removed, so this build never delivers messages to third-party social accounts.
   - The navigation's **API Relay** entry (a referral link to apikey.fan) is removed.
   - Studio announcements no longer come from the upstream feed (`api.ekkostudio.xyz`); without
     a feed of your own, Studio contacts no announcement server and shows no announcement. The
     endpoint (`GET /api/studio/announcements`) and the prompt are kept: set
     `HERMES_WEB_UI_ANNOUNCEMENTS_URL` to an HTTP(S) feed that answers
     `{ "ok": true, "platform": "desktop", "list": [...] }` (Studio appends `?locale=zh-CN|en`)
     to show your own. Only the first entry shows, and only if it has a positive integer `id`
     and `updateTime` and a non-empty plain-text `title` and `content`; `actionUrl` (HTTP(S) or
     `null`) adds a "View details" button, and `dismissible: true` adds "Later" next to it. A
     dismissed entry shows again once its `updateTime` grows.

4. **Custom-build update protection.** On `-tatin.` builds every path that could replace this
   build with an upstream package is blocked, so an upstream install cannot silently overwrite
   the customization:
   - the CLI `update` / `upgrade` command refuses to run;
   - `POST /api/studio/update` returns `409 custom_build_protected`;
   - `POST /api/hermes/runtime-versions/webui/download` and
     `POST /api/hermes/runtime-versions/active-webui` return `409 custom_build_protected`
     (Hermes Agent runtime downloads and deleting already-downloaded Web UI versions still work);
   - the npm update check is disabled, so the UI never offers an upstream update;
   - the desktop app never contacts the upstream electron-updater feed: the startup check is
     skipped, tray → "Check for Updates" explains that the custom build is updated by
     rebuilding from source, and the update download/install entry points refuse custom
     builds. The desktop package follows the upstream version (`0.7.26`); the bundled Web
     UI's `-tatin.` version is what marks a desktop build as custom.

   Version preview (`/api/studio/update/preview/*`, super administrators only) stays available:
   it checks out an upstream tag into a separate directory with its own Web UI state and ports
   and never replaces the running install.

5. **Tests & OpenAPI.** Focused Vitest coverage for Bark (encryption at rest, per-user isolation,
   redaction semantics, transport error mapping, session push, default push and previews) and
   a Playwright flow for the settings panel; `docs/openapi.json` is regenerated with the Bark
   endpoints. Every custom-build update guard has a Vitest case. The test setup defines
   `__APP_VERSION__` as `test`, so guard tests inject a `-tatin.` version with `vi.stubGlobal`.

### Upstream sync to v0.7.26

The fork merged upstream v0.7.22 through v0.7.26 release by release. Each release that carried
App-only or paid changes was merged through a `curated/<tag>` branch that reverts those commits
on top of the upstream tag.

- **Not taken:** App-bound session sharing (#3117 #3121 #3122 #3123 #3128 #3129 #3144 #3168),
  iOS/Android App push and Live Activities (#3093 push targets, #3102 #3111 #3127 #3131 #3151
  #3152 #3167), the persistent mobile terminal over the App relay (#3076 #3079), the
  `ekko-studio` npm package and publishing (#3084 #3096), and #3146, which hides the per-session
  push switch and stops the session events Bark consumes.
- **Taken with fork decisions:**
  - The interaction MCP (task plans and clarification questions) is injected without the retired
    devices toolset.
  - **JEV** (the optional TypeSafe AI evaluation service, #3159–#3211) is included but off by
    default; it needs its own API key and, once enabled, sends memory, chat, group chat,
    workflow or browser data to `api.typesafe.ai`. Only super administrators can change its
    settings.
  - Desktop browser automation follows upstream #3212 and no longer asks before high-risk clicks
    or post-action downloads.
  - Hermes Gateway keeps the pre-0.7.26 default: it auto-starts unless turned off.
  - Usage costs (#3226) download the models.dev catalog; set
    `HERMES_WEB_UI_DISABLE_MODEL_CATALOG_DOWNLOAD=1` to stop that, in which case context limits
    fall back to Hermes Agent's own `models_dev_cache.json`.
  - HTTP webhooks receive workflow completion and group chat message events again.
  - Session pins from earlier browser storage move to the server once.

### Bark security design

- **Credential storage.** The Device Key is encrypted per user with AES-256-GCM. The key file
  lives at `~/.hermes-web-ui/notifications/.bark-key` with `0600` permissions, and per-user
  configs under `notifications/bark-<userId>.json`. HTTP reads never return the key; a blank key
  field keeps the previous value; deletion requires explicit confirmation. When backing up or
  restoring, keep `.bark-key` and the per-user configs together.
- **Transport.** HTTPS-only by default; URLs containing credentials, query, or fragment are
  rejected. Plain HTTP or private-network targets require a **super administrator** to enable
  "Allow private network / HTTP" (for a trusted self-hosted Bark server). DNS is validated and
  the connection is pinned to the resolved address with Host/SNI preserved; redirects are not
  followed; responses are capped at 64 KB and requests time out after 10 s. Per-user rate limit:
  30 requests/min. A request is retried only once and only after an explicit HTTP 429/503, never
  after ambiguous network failures. Before each attempt, the session switch and configuration
  are re-checked and sending is cancelled if they changed.
- **Privacy.** By default only the notification text (agent display name + event) is sent. With
  the title and reply summary turned on, the chat title and a summary of the final reply are
  sent as well; they pass through the Bark server and Apple's push service and can appear on
  the lock screen. Transport errors can embed credentials, so logs record identifiers only.

### Build, test, run

Requires Node.js ≥ 23.

```sh
npm ci --ignore-scripts   # or: npm install
npm run build             # type-check + build the client and server
npm run dev               # Vite client + Koa server for development
npm run harness:check     # repository structure and docs checks
npm run test              # Vitest unit tests
npm run test:e2e          # Playwright browser tests (mocked backend)
```

Self-hosting, Docker, and desktop packaging follow the upstream documentation (README.md,
`docs/docker.md`, Dockerfile).

### Maintenance notes

- To pick up upstream updates, merge them into this source and rebuild first. Do not run
  `npm install -g hermes-web-ui@latest` over a deployed TATin build — it overwrites the
  customization. The built-in update guards prevent accidental overwrite; they do not block a
  deliberate reinstall.
- The fork history records upstream v0.7.21 as a common ancestor, so later releases merge with
  normal three-way merges. For each release, cut `curated/<tag>` from the upstream tag, revert
  commits that only serve the App, paid access, or that would disable Bark, then merge it.
  Keep fork deletions on modify/delete conflicts and regenerate `docs/openapi.json` with
  `npm run openapi:generate` instead of merging it by hand.
- Keep the `-tatin.` marker in the root `package.json` version: the server, CLI, and desktop
  guards all derive from it, and a Vitest check fails if it disappears.
- Desktop auto-update stays disabled until this fork publishes its own electron-updater feed;
  ship desktop updates by building and distributing new installers.
- New Bark strings ship in Simplified Chinese and English; other locales show English, and
  Traditional Chinese shows Simplified Chinese.

### License & attribution

The upstream [Business Source License 1.1](./LICENSE) (Licensor: EKKOLearnAI) applies:
non-commercial use is granted; commercial use requires a separate license from the licensor.
This fork keeps the license and all upstream copyright notices intact.

---

## 简体中文

### 本分支的改动

1. **品牌更名**：产品显示名为 **TATin Studio**（页面标题、PWA manifest、登录页、会话标签标题、各语言界面文案、推送提示文案、生成的 OpenAPI 标题）。版本号为 `0.7.26-tatin.1`。npm 包名（`hermes-web-ui`）、CLI 命令、API 前缀、MCP 服务名、数据目录及内置 **Ekko Agent** 名称均保持不变。上游 LICENSE 与版权声明原样保留；本分支与上游团队无关联，不冒充上游产品。

2. **Bark 推送通道（新增）**：按登录用户隔离的 Bark 消息推送，入口在 **侧边栏 → 消息推送**（该页面现在只包含这个 Bark 面板）。本分支不需要的上游功能已全部移除：**App 下载页**（手机平台下载卡片、下载二维码、移动版本清单请求）、**小方盒 / MCU 语音**（设备管理与远程中继、固件 OTA 分发、ESP32-C3 固件包、MCU 语音接口与事件、提示音与数据表）、**App 互联与中继**（app-login、连接与授权码表、云端/本地中继、App 分片上传、app_access 令牌、App 事件订阅）、**局域网设备**（`/api/devices/*`、devices 表、局域网发现与对等终端、对应 MCP 工具集）、**Studio 社交渠道消息**（Telegram / 飞书 / 微信适配器与账号表），以及「消息推送」页除 Bark 面板外的全部标签。会话推送现在**只走 Bark**，并新增通知语言选项（默认中文）；Hermes 自带「频道」平台页与 HTTP Webhook 链路保持不变。
   - 粘贴 Bark App 复制的推送地址即可解析服务地址与 Device Key，也可手动填写；**保存**后用**发送测试**验证（测试使用已保存的配置）。
   - 只发送三类会话状态通知：**运行完成、等待审批、等待回答**；中断不推送；点击通知不会审批任何操作。
   - **新会话默认推送**：每个用户可自行选择（默认开启），各会话仍可在设置里单独开关（发送第一条消息前的选择同样生效），以斜杠命令开始的会话也算用户自己发起的会话，`/branch` 出来的分支沿用父会话的设置。系统自动创建的会话（工作流、群聊 Agent）除非创建者显式开启，否则不推送。
   - **推送附带标题和回复摘要**：每个用户可选，默认关闭。开启后通知标题为会话标题，运行完成时正文为最终回复的摘要（最多 160 字）；审批与提问仍使用状态文案。
   - 推送在服务端发送，后端需保持运行；没有跨重启的持久发送队列，最近结果与去重缓存随重启清空。"服务已接受"只代表 Bark 服务端受理，不代表手机必达。

3. **定制版升级保护**：`-tatin.` 版本上所有可能用上游包替换本定制版的路径都被拦截，避免上游安装静默覆盖定制内容：
   - `hermes-web-ui update` / `upgrade` 拒绝执行；
   - `POST /api/studio/update` 返回 `409 custom_build_protected`；
   - `POST /api/hermes/runtime-versions/webui/download` 与 `POST /api/hermes/runtime-versions/active-webui` 返回 `409 custom_build_protected`（Hermes Agent 运行时下载、删除已下载的 Web UI 版本仍可使用）；
   - npm 升级检查停用，界面不会提示上游更新；
   - 桌面端不再访问上游 electron-updater 更新源：启动时不检查更新，托盘「检查更新」会提示定制版需从源码重新构建，更新的下载与安装入口也会拒绝定制版。桌面包版本跟随上游（`0.7.26`），以打包内 Web UI 的 `-tatin.` 版本号判定是否为定制版。

   版本预览（`/api/studio/update/preview/*`，仅超级管理员）保持可用：它把上游标签检出到独立目录，使用独立的 Web UI 状态与端口，不会替换正在运行的安装。

4. **移除付费项**：售卖/推广上游商业产品的入口全部删除——手机 App 下载页及其"定价与购买"按钮、App 访问失败时的购买提示与付费权益文案、小方盒硬件购买入口、带 App 付费权益校验的 App 会话分享，以及支撑它们的 App 互联/中继链路。会话通知改用自建 **Bark** 推送通道（保留原有会话级"是否推送"开关）；上游社交渠道发送模块已删除，本版本不会向第三方社交账号投递消息。
   - 导航中的 **饲料 / API Relay** 入口（apikey.fan 推广注册链接）已删除。
   - Studio 公告不再读取上游公告源（`api.ekkostudio.xyz`）；未配置自己的公告源时不会访问任何公告服务器，也不弹公告。接口（`GET /api/studio/announcements`）与弹窗保留备用：把 `HERMES_WEB_UI_ANNOUNCEMENTS_URL` 设为返回 `{ "ok": true, "platform": "desktop", "list": [...] }` 的 HTTP(S) 地址（Studio 会附加 `?locale=zh-CN|en`）即可显示自己的公告。只显示 `list` 的第一条，且该条须带正整数 `id`、`updateTime` 与非空纯文本 `title`、`content`；`actionUrl`（HTTP(S) 或 `null`）会加一个「查看详情」按钮，`dismissible: true` 时旁边再加「稍后」。已关闭的公告在 `updateTime` 变大后会再次弹出。

5. **测试与 OpenAPI**：Bark 相关 Vitest 覆盖（加密存储、用户隔离、脱敏语义、传输错误映射、会话推送、默认推送与内容预览）与设置面板的 Playwright 流程；`docs/openapi.json` 已重新生成并包含 Bark 接口。每条定制版升级保护都有对应 Vitest 用例；测试环境把 `__APP_VERSION__` 设为 `test`，因此保护相关用例通过 `vi.stubGlobal` 注入 `-tatin.` 版本。

### 同步上游至 v0.7.26

本分支按版本逐个合并了上游 v0.7.22 至 v0.7.26。含有 App 专用或付费改动的版本，先在上游标签上建 `curated/<tag>` 分支并 revert 这些提交，再合并。

- **未合入**：App 绑定的会话分享（#3117 #3121 #3122 #3123 #3128 #3129 #3144 #3168）、iOS/Android App 推送与灵动岛（#3093 的推送目标、#3102 #3111 #3127 #3131 #3151 #3152 #3167）、基于 App 中继的移动终端（#3076 #3079）、`ekko-studio` npm 包与发布流程（#3084 #3096），以及会隐藏会话推送开关并停掉 Bark 所依赖事件的 #3146。
- **合入时的本分支决定**：
  - interaction MCP（任务计划与澄清提问）照常注入，但不含已退役的 devices 工具集。
  - **JEV**（TypeSafe AI 第三方评估服务，#3159–#3211）已合入但默认关闭；需要单独的 API Key，开启后会把记忆、对话、群聊、工作流或浏览器数据发送到 `api.typesafe.ai`。只有超级管理员可以修改其设置。
  - 桌面内置浏览器跟随上游 #3212，高风险点击与操作后的下载不再弹出确认。
  - Hermes Gateway 保留 0.7.26 之前的默认行为：未关闭时随 Studio 自动启动。
  - 用量费用（#3226）会下载 models.dev 模型目录；设置 `HERMES_WEB_UI_DISABLE_MODEL_CATALOG_DOWNLOAD=1` 可关闭下载，此时上下文上限回退读取 Hermes Agent 自带的 `models_dev_cache.json`。
  - HTTP Webhook 重新能收到工作流完成与群聊消息事件。
  - 旧版保存在浏览器中的会话置顶会一次性迁移到服务端。

### Bark 安全设计

- **密钥存储**：Device Key 按用户使用 AES-256-GCM 加密存储；密钥文件位于 `~/.hermes-web-ui/notifications/.bark-key`（权限 0600），用户配置位于 `notifications/bark-<userId>.json`。HTTP 读取不回显 Key；编辑时留空保留原值；删除须显式确认。备份/恢复时必须同时保留 `.bark-key` 与各用户配置文件。
- **传输**：默认仅 HTTPS，拒绝带凭据、查询或片段的 URL；自建 HTTP 或内网目标须超级管理员显式启用"允许内网 / HTTP"（用于可信的自建 Bark 服务）。DNS 校验后固定连接已解析地址并保留 Host/SNI；不跟随重定向；响应上限 64 KB，请求 10 秒超时；每用户 30 次/分钟限流；仅对明确的 HTTP 429/503 重试一次，模糊网络失败不重试；每次发送前复查会话开关与配置，变更即中止。
- **隐私**：默认只发送通知文案（Agent 显示名 + 事件）。开启"推送附带标题和回复摘要"后，还会发送会话标题与最终回复的摘要；这些内容经过 Bark 服务器与苹果推送服务，并可能显示在锁屏上。传输错误可能携带凭据，因此日志只记录标识符。

### 构建、测试与运行

需要 Node.js ≥ 23。

```sh
npm ci --ignore-scripts   # 或：npm install
npm run build             # 类型检查并构建前后端
npm run dev               # 开发模式（Vite 前端 + Koa 服务端）
npm run harness:check     # 仓库结构与文档检查
npm run test              # Vitest 单元测试
npm run test:e2e          # Playwright 浏览器测试（模拟后端）
```

自托管、Docker 与桌面端打包请沿用上游文档（README.md、`docs/docker.md`、Dockerfile）。

### 维护说明

- 上游更新请先合入本源码并重新构建；不要在已部署的定制版上直接执行 `npm install -g hermes-web-ui@latest`（会覆盖定制内容）。内置升级保护用于防止误覆盖，不阻止有意重装。
- 本分支历史已把上游 v0.7.21 记录为共同祖先，之后的版本可以用普通的三方合并。每个版本先从上游标签建 `curated/<tag>` 分支，revert 只服务于 App、付费或会关掉 Bark 的提交，再合并；遇到"本分支已删除、上游修改"的冲突保持删除；`docs/openapi.json` 不要手工合并，用 `npm run openapi:generate` 重新生成。
- 根目录 `package.json` 的版本号必须保留 `-tatin.` 标记：服务端、CLI 与桌面端的保护都依赖它，缺失时会有 Vitest 用例失败。
- 在本分支发布自己的 electron-updater 更新源之前，桌面端自动更新保持停用；桌面端更新通过重新构建并分发安装包完成。
- 新增 Bark 文案提供简体中文与英文；其他语言显示英文，繁体中文显示简体中文。

### 许可证与署名

适用上游 [Business Source License 1.1](./LICENSE)（授权方：EKKOLearnAI）：许可非商业用途；商业用途需另行获得授权方许可。本分支完整保留许可证与全部上游版权声明。
