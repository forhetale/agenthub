# AgentHub installation

Use the installation form already chosen by the user. This is AgentHub, a fork of Ekko Studio: every installation form builds from the fork's source at `https://github.com/forhetale/agenthub`. Upstream release installers, the `hermes-web-ui` npm package, and upstream Docker images are the upstream product without the fork's changes; never install them to set up or upgrade this Studio (running `npm install -g hermes-web-ui` will overwrite the custom fork).

## Desktop application

Build the installer on the target operating system and architecture by following the fork README (Quick Start → Desktop App), which runs the release workflow steps; installers are written to `packages/desktop/release`. The packaged app bundles the Studio server and can manage a Hermes Runtime separately.

Once a managed Runtime is ready, packaged Desktop installs managed command shims:

- `ekko-studio` opens the Desktop app.
- `ekko-studio web ...` runs the bundled Web UI CLI.
- `ekko-studio cli ...` runs the managed Hermes CLI after a Runtime is installed.
- `ekko-studio-mcp [api|browser|use]` starts one Studio MCP toolset.

First validate the Desktop installation by launching the app, opening the Agents page, and confirming Ekko appears as built in. After a Runtime is ready, validate its installed shims with:

```bash
ekko-studio -h
ekko-studio web version
```

Refresh the Agents page after each installation change. Hermes shows either a user CLI, a managed Runtime, or not installed.

The packaged Desktop does not update itself: its updater refuses upstream feeds on AgentHub custom builds (blocked by `-agenthub.` and legacy `-tatin.` build guards). Upgrade by updating the checkout and building a new installer. This is distinct from downloading a Hermes Runtime version or running `ekko-studio cli update`.

## Web console from source

Requirements: Git, Node.js 23 or newer, and npm.

```bash
node --version
npm --version
git clone https://github.com/forhetale/agenthub.git
cd agenthub
npm ci --ignore-scripts
npm rebuild node-pty sharp sherpa-onnx-node
npm run build
node bin/hermes-web-ui.mjs version
node bin/hermes-web-ui.mjs start 8648 --no-open
node bin/hermes-web-ui.mjs status
```

The default address is `http://localhost:8648`. A successful installation must satisfy both `version` and `status` after startup.

`hermes-web-ui update` and `upgrade` refuse to run on AgentHub custom builds (`-agenthub.` and legacy `-tatin.`) because they would install the upstream npm package. Upgrade by stopping the server with `node bin/hermes-web-ui.mjs stop`, updating the checkout, running `npm ci --ignore-scripts`, rebuilding native modules, running `npm run build` again, then starting it with `node bin/hermes-web-ui.mjs start 8648 --no-open`. On Windows `npm ci` fails while a running server holds native modules such as node-pty.

## Docker Compose

Use the repository's Compose file and build the image from the checkout. The image contains an integrated Hermes Agent runtime.

```bash
docker compose up -d --build
docker compose ps
docker compose logs -f hermes-webui
```

The default host address is `http://localhost:6060`. Validate the container and bundled Hermes executable:

```bash
docker compose exec hermes-webui hermes --version
```

Persistent data stays below `${HERMES_DATA_DIR}` (default `./hermes_data`), with Studio state below `${HERMES_DATA_DIR}/hermes-web-ui`. Recreating or upgrading the container must retain those mounts.

To upgrade, update the checkout and rebuild the image:

```bash
docker compose up -d --build --force-recreate
docker compose ps
```

Do not use Desktop Runtime migration inside the container. Docker owns the runtime through the image and the Compose mounts.

## Source development install

Requirements: Git, Node.js 23 or newer, and npm.

```bash
git clone https://github.com/forhetale/agenthub.git
cd agenthub
npm ci --ignore-scripts
npm rebuild node-pty sharp sherpa-onnx-node
npm run dev
```

Development endpoints are frontend `http://localhost:8649` and backend `http://localhost:8647`. Validate the checkout with the smallest relevant tests, then `npm run build` before treating it as a production-ready build.

For an existing checkout, preserve local changes. Inspect `git status`, update only when the worktree and requested branch policy allow it, reinstall dependencies when the lockfile changes, and rebuild. Never discard a dirty worktree merely to upgrade Studio.

## Installation-owned paths

- Studio state: `HERMES_WEB_UI_HOME`, default `~/.hermes-web-ui`.
- Hermes data: `HERMES_HOME`; defaults to `~/.hermes` on Windows, macOS, and Linux.
- npm daemon PID, log, token, and database are stored under the Studio home.
- Docker maps Hermes and Studio state to separate container directories even when both originate below `./hermes_data` on the host.

These paths explain installation and persistence only. Do not create model or credential files during an installation task.
