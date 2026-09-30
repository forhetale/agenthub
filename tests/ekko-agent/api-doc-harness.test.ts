import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'

const script = fileURLToPath(new URL('../../packages/ekko-agent/scripts/api-doc-harness.mjs', import.meta.url))
const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function run(root: string, ...args: string[]) {
  return spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: 'utf8' })
}

function writeSource(root: string, text: string) {
  writeFileSync(join(root, 'src', 'greet.ts'), text)
}

function readDocument(root: string) {
  return readFileSync(join(root, 'docs', 'API.md'), 'utf8')
}

function writeDocument(root: string, text: string) {
  writeFileSync(join(root, 'docs', 'API.md'), text)
}

function toCrlf(text: string) {
  return text.replace(/\r?\n/g, '\r\n')
}

/** Creates a package root with a generated, LF-only API document. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'ekko-api-doc-'))
  roots.push(root)
  mkdirSync(join(root, 'src'))
  mkdirSync(join(root, 'docs'))
  writeSource(root, 'export function greet(name: string): string {\n  return name\n}\n')
  writeDocument(root, '# API\n\n<!-- BEGIN GENERATED EKKO PUBLIC API -->\n<!-- END GENERATED EKKO PUBLIC API -->\n\nFooter\n')
  const generated = run(root, '--write')
  expect(generated.status, generated.stderr).toBe(0)
  return root
}

describe('Ekko public API documentation harness', () => {
  it('accepts a current document regardless of its line endings', () => {
    const root = fixture()
    const lf = readDocument(root)
    expect(lf).not.toContain('\r')
    expect(lf).toContain('export function greet(name: string): string')

    writeDocument(root, toCrlf(lf))
    const crlf = run(root)
    expect(crlf.status, crlf.stderr).toBe(0)
    expect(crlf.stdout).toContain('Ekko public API documentation is current.')

    writeDocument(root, lf.replace('\n', '\r\n'))
    const mixed = run(root)
    expect(mixed.status, mixed.stderr).toBe(0)
  })

  it('rejects a changed signature in a CRLF checkout and rewrites it with CRLF', () => {
    const root = fixture()
    writeDocument(root, toCrlf(readDocument(root)))
    writeSource(root, 'export function greet(name: string, greeting: string): string {\n  return greeting + name\n}\n')

    const stale = run(root)
    expect(stale.status).toBe(1)
    expect(stale.stderr).toContain('Public methods, fields, parameters, or exports changed.')

    const updated = run(root, '--write')
    expect(updated.status, updated.stderr).toBe(0)
    const document = readDocument(root)
    expect(document).toContain('export function greet(name: string, greeting: string): string')
    expect(document).not.toMatch(/(?<!\r)\n/)
    expect(run(root).status).toBe(0)
  })
})
