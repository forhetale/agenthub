import { afterEach, expect, it } from 'vitest'
import { appendFile, mkdir, mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LocalFileProvider } from '../../packages/server/src/modules/studio/services/files/file-provider'
import { statIfPresent } from '../../packages/server/src/modules/studio/services/files/file-operations'
import { serveWorkspaceFile } from '../../packages/server/src/modules/studio/services/files/file-preview'

const roots: string[] = []
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'studio-file-'))
  roots.push(root)
  return root
}
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))) })

it('keeps existing contents on conflicting creates and renames', async () => {
  const root = await fixture()
  const provider = new LocalFileProvider(root)
  const source = join(root, 'source')
  const dest = join(root, 'dest')
  await writeFile(source, 'first')
  await writeFile(dest, 'second')
  await expect(provider.writeFile(dest, Buffer.alloc(0), true)).rejects.toMatchObject({ code: 'EEXIST' })
  await expect(provider.renameFile(source, dest)).rejects.toMatchObject({ code: 'EEXIST' })
  expect(await readFile(dest, 'utf8')).toBe('second')
  await provider.renameFile(source, join(root, 'renamed'))
  expect(await readFile(join(root, 'renamed'), 'utf8')).toBe('first')
  const upper = join(root, 'RENAMED')
  await provider.renameFile(join(root, 'renamed'), upper)
  expect(await readdir(root)).toContain('RENAMED')
  await mkdir(join(root, 'first-dir'))
  await mkdir(join(root, 'next-dir'))
  await expect(provider.renameFile(join(root, 'first-dir'), join(root, 'next-dir'))).rejects.toMatchObject({ code: 'EEXIST' })
  await symlink(source, join(root, 'dangling'))
  expect(await statIfPresent(join(root, 'dangling'))).toBeNull()
})

it('streams only the original download length and serves empty files', async () => {
  const path = join(await fixture(), 'report.bin')
  const ctx: any = { query: { download: '1' }, set() {} }
  await writeFile(path, 'before')
  await serveWorkspaceFile(ctx, path, 'report.bin', true, false)
  await appendFile(path, 'after')
  const chunks = []
  for await (const chunk of ctx.body) chunks.push(chunk)
  expect(Buffer.concat(chunks).toString()).toBe('before')
  await writeFile(path, '')
  await serveWorkspaceFile(ctx, path, 'report.bin', true, false)
  expect(ctx.body.length).toBe(0)
})
