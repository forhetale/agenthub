# TATin Studio Customization

**TATin Studio** is a source-level customization of
[Ekko Studio / Hermes Studio](https://github.com/EKKOLearnAI/hermes-studio), based on upstream
**v0.7.21** and published under the version string **`0.7.21-tatin.5`**.

This fork is not affiliated with the upstream project. All upstream code, documentation, and
the upstream BSL-1.1 license remain unchanged except for the deltas described below.

- [English](#english)
- [简体中文](#简体中文)

---

## English

### What this fork changes

1. **Rebranding.** The user-visible product name is **TATin Studio**: page title, PWA manifest,
   login screen, chat tab titles, i18n strings across all locales, push notification texts, and
   the generated OpenAPI title. The version string is `0.7.21-tatin.5`. The npm package name
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

3. **Paid surfaces removed.** Every upstream surface that sells or upsells the commercial
   products is gone: the mobile-app download page with its pricing/purchase buttons, the App
   access-failure purchase prompts and entitlement messaging, the Little Box hardware purchase
   entry, and the App/relay stacks behind them. Session notifications are delivered by a
   self-hosted **Bark** channel with a per-session push switch; the upstream social-channel
   senders were removed, so this build never delivers messages to third-party social accounts.

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
     skipped and tray → "Check for Updates" explains that the custom build is updated by
     rebuilding from source. The desktop package keeps the upstream version `0.7.21`; the
     bundled Web UI's `-tatin.` version is what marks a desktop build as custom.

   Version preview (`/api/studio/update/preview/*`, super administrators only) stays available:
   it checks out an upstream tag into a separate directory with its own Web UI state and ports
   and never replaces the running install.

5. **Tests & OpenAPI.** Focused Vitest coverage for Bark (encryption at rest, per-user isolation,
   redaction semantics, transport error mapping, session-push priority) and a Playwright flow for
   the settings panel; `docs/openapi.json` is regenerated with the Bark endpoints. Every
   custom-build update guard has a Vitest case. The test setup defines `__APP_VERSION__` as
   `test`, so guard tests inject a `-tatin.` version with `vi.stubGlobal`.

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
- **Privacy.** Only the notification text (agent display name + event) is sent. Transport errors
  can embed credentials, so logs record identifiers only.

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
- Keep the `-tatin.` marker in the root `package.json` version: the server, CLI, and desktop
  guards all derive from it, and a Vitest check fails if it disappears.
- Desktop auto-update stays disabled until this fork publishes its own electron-updater feed;
  ship desktop updates by building and distributing new installers.
- New Bark strings ship in Simplified Chinese and English; other locales fall back to English,
  and Traditional Chinese falls back to Simplified Chinese.

### License & attribution

The upstream [Business Source License 1.1](./LICENSE) (Licensor: EKKOLearnAI) applies:
non-commercial use is granted; commercial use requires a separate license from the licensor.
This fork keeps the license and all upstream copyright notices intact.

---

## 简体中文

### 本分支的改动

1. **品牌更名**：产品显示名为 **TATin Studio**（页面标题、PWA manifest、登录页、会话标签标题、各语言界面文案、推送提示文案、生成的 OpenAPI 标题）。版本号为 `0.7.21-tatin.5`。npm 包名（`hermes-web-ui`）、CLI 命令、API 前缀、MCP 服务名、数据目录及内置 **Ekko Agent** 名称均保持不变。上游 LICENSE 与版权声明原样保留；本分支与上游团队无关联，不冒充上游产品。

2. **Bark 推送通道（新增）**：按登录用户隔离的 Bark 消息推送，入口在 **侧边栏 → 消息推送**（该页面现在只包含这个 Bark 面板）。本分支不需要的上游功能已全部移除：**App 下载页**（手机平台下载卡片、下载二维码、移动版本清单请求）、**小方盒 / MCU 语音**（设备管理与远程中继、固件 OTA 分发、ESP32-C3 固件包、MCU 语音接口与事件、提示音与数据表）、**App 互联与中继**（app-login、连接与授权码表、云端/本地中继、App 分片上传、app_access 令牌、App 事件订阅）、**局域网设备**（`/api/devices/*`、devices 表、局域网发现与对等终端、对应 MCP 工具集）、**Studio 社交渠道消息**（Telegram / 飞书 / 微信适配器与账号表），以及「消息推送」页除 Bark 面板外的全部标签。会话推送现在**只走 Bark**，并新增通知语言选项（默认中文）；Hermes 自带「频道」平台页与 HTTP Webhook 链路保持不变。
   - 粘贴 Bark App 复制的推送地址即可解析服务地址与 Device Key，也可手动填写；**保存**后用**发送测试**验证（测试使用已保存的配置）。
   - 只发送三类会话状态通知：**运行完成、等待审批、等待回答**；中断不推送，不转发任何聊天正文、命令或工具内容；点击通知不会审批任何操作。
   - 已配置 Bark 时优先于原社交渠道（同一事件不双发）；清除 Bark 后，已配置的原渠道可恢复推送。会话级开关仍使用原有"是否推送"；测试按钮不受会话开关限制。
   - 推送在服务端发送，后端需保持运行；没有跨重启的持久发送队列，最近结果与去重缓存随重启清空。"服务已接受"只代表 Bark 服务端受理，不代表手机必达。

3. **定制版升级保护**：`-tatin.` 版本上所有可能用上游包替换本定制版的路径都被拦截，避免上游安装静默覆盖定制内容：
   - `hermes-web-ui update` / `upgrade` 拒绝执行；
   - `POST /api/studio/update` 返回 `409 custom_build_protected`；
   - `POST /api/hermes/runtime-versions/webui/download` 与 `POST /api/hermes/runtime-versions/active-webui` 返回 `409 custom_build_protected`（Hermes Agent 运行时下载、删除已下载的 Web UI 版本仍可使用）；
   - npm 升级检查停用，界面不会提示上游更新；
   - 桌面端不再访问上游 electron-updater 更新源：启动时不检查更新，托盘「检查更新」会提示定制版需从源码重新构建。桌面包版本仍为上游的 `0.7.21`，以打包内 Web UI 的 `-tatin.` 版本号判定是否为定制版。

   版本预览（`/api/studio/update/preview/*`，仅超级管理员）保持可用：它把上游标签检出到独立目录，使用独立的 Web UI 状态与端口，不会替换正在运行的安装。

4. **移除付费项**：售卖/推广上游商业产品的入口全部删除——手机 App 下载页及其"定价与购买"按钮、App 访问失败时的购买提示与付费权益文案、小方盒硬件购买入口，以及支撑它们的 App 互联/中继链路。会话通知改用自建 **Bark** 推送通道（保留原有会话级"是否推送"开关）；上游社交渠道发送模块已删除，本版本不会向第三方社交账号投递消息。

5. **测试与 OpenAPI**：Bark 相关 Vitest 覆盖（加密存储、用户隔离、脱敏语义、传输错误映射、会话推送）与设置面板的 Playwright 流程；`docs/openapi.json` 已重新生成并包含 Bark 接口。每条定制版升级保护都有对应 Vitest 用例；测试环境把 `__APP_VERSION__` 设为 `test`，因此保护相关用例通过 `vi.stubGlobal` 注入 `-tatin.` 版本。

### Bark 安全设计

- **密钥存储**：Device Key 按用户使用 AES-256-GCM 加密存储；密钥文件位于 `~/.hermes-web-ui/notifications/.bark-key`（权限 0600），用户配置位于 `notifications/bark-<userId>.json`。HTTP 读取不回显 Key；编辑时留空保留原值；删除须显式确认。备份/恢复时必须同时保留 `.bark-key` 与各用户配置文件。
- **传输**：默认仅 HTTPS，拒绝带凭据、查询或片段的 URL；自建 HTTP 或内网目标须超级管理员显式启用"允许内网 / HTTP"（用于可信的自建 Bark 服务）。DNS 校验后固定连接已解析地址并保留 Host/SNI；不跟随重定向；响应上限 64 KB，请求 10 秒超时；每用户 30 次/分钟限流；仅对明确的 HTTP 429/503 重试一次，模糊网络失败不重试；每次发送前复查会话开关与配置，变更即中止。
- **隐私**：只发送通知文案（Agent 显示名 + 事件）。传输错误可能携带凭据，因此日志只记录标识符。

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
- 根目录 `package.json` 的版本号必须保留 `-tatin.` 标记：服务端、CLI 与桌面端的保护都依赖它，缺失时会有 Vitest 用例失败。
- 在本分支发布自己的 electron-updater 更新源之前，桌面端自动更新保持停用；桌面端更新通过重新构建并分发安装包完成。
- 新增 Bark 文案提供简体中文与英文；其他语言回退英文，繁体中文回退简体中文。

### 许可证与署名

适用上游 [Business Source License 1.1](./LICENSE)（授权方：EKKOLearnAI）：许可非商业用途；商业用途需另行获得授权方许可。本分支完整保留许可证与全部上游版权声明。
