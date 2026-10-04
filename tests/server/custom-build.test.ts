import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  CUSTOM_BUILD_PROTECTED_CODE,
  isTatinBuild,
  rejectOnCustomBuild,
} from '../../packages/server/src/modules/studio/public/custom-build'

function readRootPackageVersion(): string {
  return JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8')).version
}

describe('custom-build detection', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('recognizes both -agenthub. and legacy -tatin. build versions as custom builds', () => {
    vi.stubGlobal('__APP_VERSION__', '0.7.29-agenthub.1')
    expect(isTatinBuild()).toBe(true)

    vi.stubGlobal('__APP_VERSION__', '0.7.21-tatin.5')
    expect(isTatinBuild()).toBe(true)

    vi.stubGlobal('__APP_VERSION__', '0.7.29')
    expect(isTatinBuild()).toBe(false)
  })

  it('falls back to the root package version when no build version is injected', () => {
    // Dev/ts-node servers run without the esbuild define and must stay protected.
    vi.stubGlobal('__APP_VERSION__', undefined)
    expect(isTatinBuild()).toBe(true)
  })

  it('rejects with custom_build_protected only on custom builds', () => {
    const upstreamCtx = { status: 200, body: undefined as unknown }
    vi.stubGlobal('__APP_VERSION__', '0.7.29')
    expect(rejectOnCustomBuild(upstreamCtx, 'blocked')).toBe(false)
    expect(upstreamCtx).toEqual({ status: 200, body: undefined })

    const customCtx = { status: 200, body: undefined as unknown }
    vi.stubGlobal('__APP_VERSION__', '0.7.29-agenthub.1')
    expect(rejectOnCustomBuild(customCtx, 'blocked')).toBe(true)
    expect(customCtx).toEqual({
      status: 409,
      body: { success: false, code: CUSTOM_BUILD_PROTECTED_CODE, message: 'blocked' },
    })

    const legacyCtx = { status: 200, body: undefined as unknown }
    vi.stubGlobal('__APP_VERSION__', '0.7.26-tatin.1')
    expect(rejectOnCustomBuild(legacyCtx, 'blocked')).toBe(true)
    expect(legacyCtx).toEqual({
      status: 409,
      body: { success: false, code: CUSTOM_BUILD_PROTECTED_CODE, message: 'blocked' },
    })
  })

  it('ships a custom release version so every update guard stays active', () => {
    // The server bundle, dev server, Vite client, CLI, and desktop updater all
    // derive the custom-build flag from the root package version.
    expect(readRootPackageVersion()).toMatch(/-(?:agenthub|tatin)\./)
    expect(readFileSync(resolve(process.cwd(), 'scripts/build-server.mjs'), 'utf-8'))
      .toContain('__APP_VERSION__: JSON.stringify(version)')
    expect(readFileSync(resolve(process.cwd(), 'vite.config.ts'), 'utf-8'))
      .toContain('__APP_VERSION__: JSON.stringify(pkg.version)')
  })
})

describe('CLI update on a TATin custom build', () => {
  afterEach(() => {
    process.exitCode = undefined
    vi.doUnmock('child_process')
    vi.restoreAllMocks()
    vi.resetModules()
  })

  it('refuses to reinstall the upstream npm package', async () => {
    const execFileSync = vi.fn()
    const execSync = vi.fn()
    const spawn = vi.fn()
    vi.resetModules()
    vi.doMock('child_process', () => ({ execFileSync, execSync, spawn }))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined)

    const { doUpdate } = await import('../../bin/hermes-web-ui.mjs')
    doUpdate()

    expect(process.exitCode).toBe(1)
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('AgentHub custom build'))
    expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('Updating hermes-web-ui'))
    expect(execFileSync).not.toHaveBeenCalled()
    expect(execSync).not.toHaveBeenCalled()
    expect(spawn).not.toHaveBeenCalled()
  })
})
