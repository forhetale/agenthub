import { execFile } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, describe, expect, it } from 'vitest'
import {
  grokUserMcpConfig,
  mergeGrokConfigWithManagedMcp,
  stripManagedGrokMcp,
} from '../../packages/server/src/modules/coding-agents/services/grok/config'

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('legacy MCP migration across Hermes, Hub Agent, and coding agents', () => {
  it('migrates legacy ekko-studio-* / hermes-studio-* entries while keeping disabled state, ELECTRON_RUN_AS_NODE=1, and user servers', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'agenthub-mcp-mig-'))
    tempDirs.push(dir)
    const script = `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const path = require('node:path');
      const { configureProfileConfig } = require('./packages/server/src/modules/studio/public/profile-config');

      let hermes = {
        mcp_servers: {
          'ekko-studio-api': { command: 'node', args: ['old/ekko-studio-mcp.mjs', 'api'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' }, enabled: false },
          'ekko-studio-devices': { command: 'node', args: ['old/ekko-studio-mcp.mjs', 'devices'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
          'ekko-studio-plan': { command: 'node', args: ['old/ekko-studio-mcp.mjs', 'plan'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
          'hermes-studio-plugins': { command: 'node', args: ['old/hermes-web-ui-mcp.mjs', 'plugins'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
          'custom-user-mcp': { command: '/usr/local/bin/custom-mcp', args: ['--stdio'], env: { CUSTOM_KEY: 'keep' } },
        },
      };
      configureProfileConfig({
        providerEnvironmentMap: {},
        updateConfigYamlForProfile: async (_profile, update) => {
          const res = update(structuredClone(hermes));
          if (res.write !== false) hermes = res.data;
          return res.result;
        },
      });

      (async () => {
        const { injectBundledMcpServer } = require('./packages/server/src/modules/hermes/services/mcp/studio-autoinject');
        const hermesRes = await injectBundledMcpServer();
        assert.equal(hermesRes.targets[0].status, 'updated');
        assert.equal(hermes.mcp_servers['ekko-studio-api'], undefined);
        assert.equal(hermes.mcp_servers['ekko-studio-devices'], undefined);
        assert.equal(hermes.mcp_servers['ekko-studio-plan'], undefined);
        assert.equal(hermes.mcp_servers['hermes-studio-plugins'], undefined);
        assert.equal(hermes.mcp_servers['custom-user-mcp'].command, '/usr/local/bin/custom-mcp');
        assert.equal(hermes.mcp_servers['agenthub-api'].enabled, false);
        for (const name of ['agenthub-api', 'agenthub-plugins', 'agenthub-browser', 'agenthub-use', 'agenthub-interaction']) {
          const entry = hermes.mcp_servers[name];
          assert(entry, 'missing ' + name);
          assert.equal(entry.env.ELECTRON_RUN_AS_NODE, '1');
          assert(String(entry.args[0]).endsWith('bin/agenthub-mcp.mjs'), 'expected bin/agenthub-mcp.mjs for ' + name);
        }

        // Hub Agent MCP migration
        const { injectManagedHubAgentMcpServers } = require('./packages/server/src/modules/hub-agent/services/mcp');
        let hubCfg = {
          mcp: {
            profiles: {
              default: {
                servers: {
                  'ekko-studio-browser': { command: 'node', args: ['ekko-studio-mcp.mjs', 'browser'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' }, enabled: false },
                  'ekko-studio-devices': { command: 'node', args: ['ekko-studio-mcp.mjs', 'devices'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
                  'user-owned': { command: 'python3', args: ['-m', 'my_mcp'] },
                },
              },
            },
          },
        };
        const setup = { profiles: () => [{ profile: 'default' }], config: { read: () => hubCfg, replace: next => { hubCfg = next; } } };
        const hubRes = injectManagedHubAgentMcpServers(setup);
        assert.equal(hubRes.targets[0].status, 'updated');
        const hubServers = hubCfg.mcp.profiles.default.servers;
        assert.equal(hubServers['ekko-studio-browser'], undefined);
        assert.equal(hubServers['ekko-studio-devices'], undefined);
        assert.equal(hubServers['user-owned'].command, 'python3');
        assert.equal(hubServers['agenthub-browser'].enabled, false);
        assert.equal(hubServers['agenthub-api'].env.ELECTRON_RUN_AS_NODE, '1');
        assert(String(hubServers['agenthub-api'].args[0]).endsWith('bin/agenthub-mcp.mjs'));

        // Coding agents managed MCP overrides migration + Claude Code config cleanup
        const overridesDir = path.join(process.env.HERMES_WEB_UI_HOME, 'coding-agent');
        fs.mkdirSync(overridesDir, { recursive: true });
        fs.mkdirSync(process.env.HOME, { recursive: true });
        const overridesPath = path.join(overridesDir, 'mcp-overrides.json');
        fs.writeFileSync(overridesPath, JSON.stringify({
          disabled: {
            codex: {
              default: ['ekko-studio-plugins', 'ekko-studio-plan'],
            },
          },
          configs: {
            codex: {
              default: {
                'hermes-studio-api': { timeout: 90 },
              },
            },
          },
        }));
        const { getDisabledManagedMcpServers, getManagedMcpServerOverride } = require('./packages/server/src/modules/coding-agents/services/mcp-overrides');
        const disabled = getDisabledManagedMcpServers('codex', 'default');
        assert.deepEqual([...disabled].sort(), ['agenthub-interaction', 'agenthub-plugins']);
        assert.deepEqual(getManagedMcpServerOverride('codex', 'default', 'agenthub-api'), { timeout: 90 });

        const claudeDir = path.join(process.env.HOME, '.claude');
        fs.mkdirSync(claudeDir, { recursive: true });
        const claudeCfgPath = path.join(claudeDir, 'mcp.json');
        fs.writeFileSync(claudeCfgPath, JSON.stringify({
          mcpServers: {
            'ekko-studio-api': { command: 'node', args: ['ekko-studio-mcp.mjs', 'api'], env: { HERMES_WEB_UI_MANAGED_MCP: '1' } },
            'user-claude-mcp': { command: 'npx', args: ['user-tool'] },
          },
        }));
        const { listCodingAgentMcpServers, upsertCodingAgentMcpServer } = require('./packages/server/src/modules/coding-agents/services/mcp-manager');
        const beforeList = await listCodingAgentMcpServers('claude-code', { profile: 'default' });
        assert(beforeList.servers.some(s => s.name === 'user-claude-mcp' && s.managed === false));
        assert(!beforeList.servers.some(s => s.name === 'ekko-studio-api'));

        await upsertCodingAgentMcpServer('claude-code', 'extra-user-tool', { command: 'node', args: ['extra.js'] }, { profile: 'default' });
        const afterClaudeCfg = JSON.parse(fs.readFileSync(claudeCfgPath, 'utf8'));
        assert.equal(afterClaudeCfg.mcpServers['ekko-studio-api'], undefined);
        assert.equal(afterClaudeCfg.mcpServers['user-claude-mcp'].command, 'npx');
        assert.equal(afterClaudeCfg.mcpServers['extra-user-tool'].command, 'node');

        const { getCodingAgentManagedMcpServerConfigs } = require('./packages/server/src/modules/coding-agents/services');
        const codexConfigs = getCodingAgentManagedMcpServerConfigs('codex', 'default');
        assert.equal(codexConfigs['agenthub-api'].timeout, 90);
        assert.equal(codexConfigs['agenthub-browser'].env.ELECTRON_RUN_AS_NODE, '1');
        assert(String(codexConfigs['agenthub-browser'].args[0]).endsWith('bin/agenthub-mcp.mjs'));
        assert.equal(codexConfigs['agenthub-plugins'].enabled, false);
        const codexScoped = getCodingAgentManagedMcpServerConfigs('codex', 'default', '/tmp/run-token.json');
        assert.equal(codexScoped['agenthub-api'].env.ELECTRON_RUN_AS_NODE, '1');
        assert(String(codexScoped['agenthub-api'].args[0]).endsWith('bin/agenthub-mcp.mjs'));

        process.stdout.write('legacy MCP migration verified\\n', () => process.exit(0));
      })().catch(err => { console.error(err); process.exit(1); });
    `

    const { stdout } = await promisify(execFile)(
      process.execPath,
      ['-r', 'ts-node/register', '-e', script],
      {
        cwd: resolve('.'),
        timeout: 35000,
        env: {
          ...process.env,
          TS_NODE_PROJECT: 'packages/server/tsconfig.json',
          TS_NODE_COMPILER_OPTIONS: '{"rootDir":"."}',
          TS_NODE_FILES: 'true',
          TS_NODE_TRANSPILE_ONLY: 'true',
          HOME: join(dir, 'home'),
          HERMES_HOME: join(dir, 'home', '.hermes'),
          HERMES_WEB_UI_HOME: join(dir, 'webui'),
          HERMES_WEBUI_STATE_DIR: join(dir, 'webui'),
          HERMES_WEB_UI_ALLOW_TRANSIENT_MCP_AUTOINJECT: '1',
          HERMES_WEB_UI_DISABLE_MCP_AUTOINJECT: '',
        },
      },
    )
    expect(stdout).toContain('legacy MCP migration verified')
  }, 40000)

  it('strips legacy ekko-studio-* and hermes-studio-* entries from Grok TOML while preserving user MCP sections', () => {
    const legacyToml = [
      '[mcp_servers.ekko-studio-api]',
      'command = "node"',
      'args = ["ekko-studio-mcp.mjs", "api"]',
      '',
      '[mcp_servers.hermes-studio-devices]',
      'command = "node"',
      '',
      '[mcp_servers.my-custom-tool]',
      'command = "uvx"',
      'args = ["custom-mcp"]',
      '',
    ].join('\n')

    expect(stripManagedGrokMcp(legacyToml)).toContain('[mcp_servers.my-custom-tool]')
    expect(stripManagedGrokMcp(legacyToml)).not.toContain('ekko-studio-api')
    expect(stripManagedGrokMcp(legacyToml)).not.toContain('hermes-studio-devices')

    const userOnly = grokUserMcpConfig(legacyToml)
    expect(userOnly).toContain('my-custom-tool')
    expect(userOnly).not.toContain('ekko-studio-api')

    const merged = mergeGrokConfigWithManagedMcp(
      legacyToml,
      '[mcp_servers.agenthub-api]\ncommand = "node"\nargs = ["bin/agenthub-mcp.mjs", "api"]',
    )
    expect(merged).toContain('[mcp_servers.my-custom-tool]')
    expect(merged).toContain('[mcp_servers.agenthub-api]')
    expect(merged).not.toContain('ekko-studio-api')
  })
})
