import * as esbuild from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'node:module'
import { chmodSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'fs'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'))
const version = pkg.version
const serverOutDir = resolve(rootDir, 'dist/server')

rmSync(serverOutDir, { recursive: true, force: true })
mkdirSync(serverOutDir, { recursive: true })

await esbuild.build({
  entryPoints: [resolve(rootDir, 'packages/server/src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node23',
  format: 'cjs',
  outfile: resolve(serverOutDir, 'index.js'),
  external: ['node-pty', 'node:sqlite', 'sharp', 'socket.io'],
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
  sourcemap: true,
  minify: true,
  treeShaking: true,
  logLevel: 'info',
})

const bridgeOutDir = resolve(serverOutDir, 'agent-bridge', 'python')
const bridgeSrcDir = resolve(rootDir, 'packages/server/src/modules/hermes/services/bridge/python')
mkdirSync(bridgeOutDir, { recursive: true })
for (const fileName of readdirSync(bridgeSrcDir)) {
  if (fileName.endsWith('.py')) {
    cpSync(resolve(bridgeSrcDir, fileName), resolve(bridgeOutDir, fileName))
  }
}
chmodSync(resolve(bridgeOutDir, 'hermes_bridge.py'), 0o755)

const serverAssetsSrcDir = resolve(rootDir, 'packages/server/src/assets')
if (existsSync(serverAssetsSrcDir)) {
  cpSync(serverAssetsSrcDir, resolve(serverOutDir, 'assets'), { recursive: true })
}

cpSync(
  resolve(rootDir, 'docs/openapi.json'),
  resolve(serverOutDir, 'openapi.json'),
)

const builtinPluginsOutDir = resolve(rootDir, 'dist/plugins/builtin')
rmSync(builtinPluginsOutDir, { recursive: true, force: true })
cpSync(resolve(rootDir, 'plugins/builtin'), builtinPluginsOutDir, { recursive: true })
// Independent plugin repositories are pinned in package-lock.json and shipped
// as ordinary bundled packages; production needs no Git or npm access.
const require = createRequire(import.meta.url)
const builtinPackages = JSON.parse(readFileSync(resolve(rootDir, 'plugins/builtin/packages.json'), 'utf8'))
for (const [id, name] of Object.entries(builtinPackages)) {
  const source = dirname(require.resolve(`${name}/plugin.json`))
  const manifest = JSON.parse(readFileSync(resolve(source, 'plugin.json'), 'utf8'))
  if (manifest.id !== id) throw new Error(`Bundled plugin ${name} declares ${manifest.id}, expected ${id}`)
  cpSync(source, resolve(builtinPluginsOutDir, id), { recursive: true })
}

const skillsOutDir = resolve(rootDir, 'dist/skills')
rmSync(skillsOutDir, { recursive: true, force: true })
cpSync(
  resolve(rootDir, 'packages/skills'),
  skillsOutDir,
  { recursive: true },
)

const hubAgentSkillsOutDir = resolve(rootDir, 'dist/hub-agent-skills')
rmSync(hubAgentSkillsOutDir, { recursive: true, force: true })
cpSync(
  resolve(rootDir, 'packages/hub-agent/skills'),
  hubAgentSkillsOutDir,
  { recursive: true },
)

const firmwareOutDir = resolve(rootDir, 'dist/mcu')
rmSync(firmwareOutDir, { recursive: true, force: true })

// Ship the SDK with the CLI so independent projects do not need this checkout.
const pluginSdkOutDir = resolve(rootDir, 'dist/plugin-sdk')
rmSync(pluginSdkOutDir, { recursive: true, force: true })
mkdirSync(pluginSdkOutDir, { recursive: true })
cpSync(resolve(rootDir, 'packages/plugin-sdk/package.json'), resolve(pluginSdkOutDir, 'package.json'))
for (const part of ['LICENSE', 'NOTICE', 'src', 'docs', 'harness', 'template']) cpSync(resolve(rootDir, 'packages/plugin-sdk', part), resolve(pluginSdkOutDir, part), { recursive: true })
