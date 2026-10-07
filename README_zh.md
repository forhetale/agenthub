# AgentHub

<p align="center">
  <strong>本地优先、注重隐私的多 Agent 协作工作区，支持智能体对话、代码编写与可视化工作流。</strong><br/>
  基于 Ekko Studio / Hermes Studio 的独立社区定制分支，彻底移除商业中继与移动端付费营销。
</p>

<p align="center">
  <a href="./README.md">English</a> · <a href="./CUSTOMIZATION.md">定制设计规范</a> · <a href="./docs/upstream-sync-0.7.31.md">上游同步记录 (v0.7.31)</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/License-BSL--1.1-blue.svg" alt="许可证: BSL-1.1" /></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-%3E%3D23-brightgreen.svg" alt="Node.js >= 23" /></a>
  <a href="https://github.com/forhetale/agenthub"><img src="https://img.shields.io/badge/release-0.7.31--agenthub.1-informational.svg" alt="版本 0.7.31-agenthub.1" /></a>
  <a href="https://github.com/Finb/Bark"><img src="https://img.shields.io/badge/push-Bark-ff5a5f.svg" alt="推送: Bark" /></a>
</p>

---

## 什么是 AgentHub？

**AgentHub** 是一个纯粹、本地优先的 AI 工作台，将主流代码智能体、自主运行环境与可视化编排统一在自托管的桌面客户端与 Web 控制台中。

本项目分叉自 [Ekko Studio](https://github.com/EKKOLearnAI/ekko-studio)（原 Hermes Studio），维护于 [forhetale/agenthub](https://github.com/forhetale/agenthub.git)。为确保生态与配置平滑迁移，AgentHub 完整保留了 `hermes-web-ui` 服务端 CLI、`~/.hermes-web-ui` 状态数据目录以及 `ekko-studio-*` MCP 工具集名称，同时彻底移除了上游商业导流入口、闭源手机 App 捆绑、第三方推广中继与私有硬件依赖。

### 支持的 Agent Family

AgentHub 在统一工作区中调度三大 Agent 家族：

1. **Hermes Family**：[Hermes Agent](https://github.com/NousResearch/hermes-agent) — 多 Profile 隔离、Provider 与模型管理、记忆与技能体系、任务 Kanban、终端后端及 10 大平台渠道。
2. **Ekko Family**：Ekko Agent — 人工审批门、澄清提问、持久化记忆与专属 Provider Runtime。
3. **Coding Agent Family**：完整支持 **Claude Code**、**Codex**、**Pi**、**Grok**、**OpenCode**、**DeepSeek Harness (DSH)**、**Antigravity CLI** 与 **Cursor CLI** 的桌面与 Web 执行。

---

## 核心能力

- **多 Agent 流式对话**：基于 Socket.IO 的高实时性流式更新，展示每秒 Token 传输速率、持久化用量归属、Markdown 渲染、工具调用轨迹展开、生成文件内联预览以及上下文溢出自动恢复。
- **协同群聊房间**：多 Agent 协作群组，支持 `@mention` 智能路由、单次回复用量与耗时气泡、长上下文自动摘要压缩与邀请管理。
- **DAG 可视化工作流**：基于 Vue Flow 的可视化画布，自由组合多 Agent 节点、条件分支、审批确认、附件传递与执行快照回放（[docs/workflow.md](./docs/workflow.md)）。
- **工作区生产力工具**：远程与本地文件管理器（支持 Diff 工具栏与文件树菜单直接下载）、交互式 Web 终端（基于 node-pty 与 xterm）、结构化卡片、语音输入与多端语音合成（[docs/voice-dialogue.md](./docs/voice-dialogue.md)）。
- **保留平台渠道**：完整保留 Hermes 的 10 大社交与办公平台接入：Telegram、Discord、Slack、WhatsApp、Matrix、飞书、钉钉、QQBot、微信与企业微信，以及入站 HTTP Webhook。
- **自建 Bark 消息推送**：按用户隔离的 [Bark](https://github.com/Finb/Bark) 消息推送（AES-256-GCM 本地加密存储），在任务完成、等待审批或等待回答时即时送达，支持会话级开关。
- **去商业化与纯净架构**：彻底清理手机 App 下载弹窗、会员付费权益提示、小方盒 MCU 语音硬件、局域网设备互联以及商业 API 中转推广（apikey.fan）。
- **隐私与安全保护**：可选的 TypeSafe AI (JEV) 评估服务默认关闭（[docs/jev.md](./docs/jev.md)）。内置升级守护拦截上游覆盖。

---

## 快速开始（源码构建与运行）

> [!WARNING]
> **请勿使用 `npm install -g hermes-web-ui` 安装**：该命令会从官方 npm 仓库拉取上游发布包并覆盖 AgentHub 的定制改动。请始终从本仓库源码构建。

### 环境要求

- **Node.js**：`v23.0.0` 或更高版本（推荐 macOS Homebrew node 26、Linux 或 Windows 环境）。
- **Python**：Python 3.10+（供 Hermes Agent 运行时调用）。
- **C/C++ 构建工具**：`make`、`gcc`/`clang`、`python3`（用于原生模块编译）。

### 源码编译与启动

```bash
# 1. 克隆代码仓库
git clone https://github.com/forhetale/agenthub.git
cd agenthub

# 2. 安装依赖（跳过预安装脚本）
npm ci --ignore-scripts

# 3. 编译原生依赖模块
npm rebuild node-pty sharp sherpa-onnx-node

# 4. 构建前端产物、后端服务并生成 OpenAPI 规范
npm run build

# 5. 后台启动 AgentHub 服务（默认端口 8648）
node bin/hermes-web-ui.mjs start 8648 --no-open
```

在浏览器中打开 **http://localhost:8648**。全新安装的默认账号为 `admin` / `123456`；对外开放前请修改密码。升级现有安装会保留原账号与密码。

### 用户状态与数据目录

AgentHub 的服务配置、SQLite 数据库、登录凭据和 Bark 密钥集中保存在 `~/.hermes-web-ui`（可通过 `HERMES_WEB_UI_HOME` 环境变量自定义）。Hermes Profile 数据继续保存在 `~/.hermes` 目录下。

### 桌面应用（Electron 客户端）

请在目标操作系统与支持的架构上构建桌面安装程序；以下命令不保证能跨平台打包：

```bash
# 打包桌面应用（禁用远程发布）
npm run build:desktop

# 构建特定平台安装包：
npm run build:desktop:mac    # macOS (dmg, zip)
npm run build:desktop:win    # Windows (nsis)
npm run build:desktop:linux  # Linux (AppImage, deb)
```

产物输出至 `packages/desktop/release` 目录。打包生成的桌面应用同样内置定制升级保护。

### Docker Compose

单容器快速部署（内置 Hermes Agent 运行时）：

```bash
docker compose up -d --build
docker compose logs -f hermes-webui
```

Compose 默认访问地址为 **http://localhost:6060**，可用 `PORT` 修改。详细环境变量与持久化卷配置参见 [docs/docker.md](./docs/docker.md)。

---

## CLI 命令管理

在源码目录下，使用 `node bin/hermes-web-ui.mjs <命令>` 进行维护：

| 命令 | 说明 |
|---|---|
| `start [port] [--no-open]` | 后台启动 AgentHub 服务 |
| `restart [port]` | 重启服务并重置 Agent Bridge broker |
| `stop` | 优雅停止后台服务 |
| `status` | 查看 Web UI 后台进程状态 |
| `clear-login-locks [--restart]` | 清理因多次尝试被锁定的 IP 记录 |
| `reset-default-login` | 重置默认管理员密码为 `admin` / `123456` |
| `update` / `upgrade` | 定制版（`-agenthub.` / `-tatin.`）上主动拦截，防止误装上游 npm 包 |

---

## 升级保护与维护

AgentHub 在服务端中间件、CLI 和桌面启动器中内置了定制版升级保护。任何尝试请求上游更新的接口均会被拦截（`POST /api/studio/update` 返回 `409 custom_build_protected`）。

常规维护升级流程：
1. 停止运行中的进程：`node bin/hermes-web-ui.mjs stop`
2. 拉取最新提交：`git pull origin <branch>`
3. 重新安装与构建：`npm ci --ignore-scripts && npm rebuild node-pty sharp sherpa-onnx-node && npm run build`
4. 重新启动服务：`node bin/hermes-web-ui.mjs start 8648 --no-open`

*提示：内置升级保护用于防止应用内和 API 自动下载误覆盖；它无法阻止外部命令行执行 `npm i -g hermes-web-ui`。请始终通过 git 源码进行更新。*

---

## 关联文档

- **仅 PR 的上游精选自动同步**：[docs/upstream-automation.md](./docs/upstream-automation.md)。由维护者本机的 Hermes 定时任务检测稳定版本，在隔离目录精选改动、测试并创建 PR；合并与部署都须人工确认，不是 npm 自动覆盖，也不是 GitHub Actions 自动部署。
- **定制设计与安全规范**：[CUSTOMIZATION.md](./CUSTOMIZATION.md)
- **v0.7.31 上游同步记录**：[docs/upstream-sync-0.7.31.md](./docs/upstream-sync-0.7.31.md)
- **v0.7.29 上游同步记录**：[docs/upstream-sync-0.7.29.md](./docs/upstream-sync-0.7.29.md)
- **系统架构**：[ARCHITECTURE.md](./ARCHITECTURE.md)
- **Docker 容器部署**：[docs/docker.md](./docs/docker.md)
- **代码智能体接入**：
  - DeepSeek Harness：[docs/dsh-management.md](./docs/dsh-management.md)
  - Google Antigravity：[docs/antigravity-cli.md](./docs/antigravity-cli.md)
- **可视化工作流**：[docs/workflow.md](./docs/workflow.md)
- **语音对话系统**：[docs/voice-dialogue.md](./docs/voice-dialogue.md)
- **可选 JEV 评估体系**：[docs/jev.md](./docs/jev.md)

---

## 许可证与署名

AgentHub 遵循 [Business Source License 1.1](./LICENSE)（授权方：EKKOLearnAI）。非商业使用免费授权；商业使用需向授权方申请独立许可。

本分支完整保留上游所有版权声明、作者信息及源码署名。
