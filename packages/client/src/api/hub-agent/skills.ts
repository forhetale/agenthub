import { getActiveProfileName, getApiKey, getBaseUrlValue, request } from '@/api/client'
import type { ExternalDirEntry, SkillFileEntry, SkillSource } from '@/api/hermes/skills'

export interface HubAgentSkillSummary {
  name: string
  description: string
  category: string
  source: Exclude<SkillSource, 'hub'>
  sourcePath?: string
  enabled: boolean
  managedByHubAgent: boolean
  builtIn: boolean
}

export interface HubAgentSkillDetail extends HubAgentSkillSummary {
  content: string
}

export async function fetchHubAgentSkills(query = ''): Promise<HubAgentSkillSummary[]> {
  const suffix = query ? `?query=${encodeURIComponent(query)}` : ''
  const response = await request<{ ok: boolean; skills: HubAgentSkillSummary[] }>(`/api/hub-agent/skills${suffix}`)
  return response.skills
}

export async function fetchHubAgentSkill(name: string): Promise<HubAgentSkillDetail> {
  const response = await request<{ ok: boolean; skill: HubAgentSkillDetail }>(`/api/hub-agent/skills/${encodeURIComponent(name)}`)
  return response.skill
}

export async function createHubAgentSkill(input: {
  name: string
  content: string
  category?: string
}): Promise<HubAgentSkillDetail> {
  const response = await request<{ ok: boolean; skill: HubAgentSkillDetail }>('/api/hub-agent/skills', {
    method: 'POST',
    body: JSON.stringify(input),
  })
  return response.skill
}

export async function updateHubAgentSkill(name: string, content: string): Promise<HubAgentSkillDetail> {
  const response = await request<{ ok: boolean; skill: HubAgentSkillDetail }>(`/api/hub-agent/skills/${encodeURIComponent(name)}`, {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
  return response.skill
}

export async function deleteHubAgentSkill(name: string): Promise<void> {
  await request(`/api/hub-agent/skills/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export async function toggleHubAgentSkill(name: string, enabled: boolean): Promise<void> {
  await request(`/api/hub-agent/skills/${encodeURIComponent(name)}/toggle`, {
    method: 'PUT',
    body: JSON.stringify({ enabled }),
  })
}

export async function fetchHubAgentSkillFiles(name: string): Promise<SkillFileEntry[]> {
  const response = await request<{ ok: boolean; files: SkillFileEntry[] }>(
    `/api/hub-agent/skills/${encodeURIComponent(name)}/files`,
  )
  return response.files
}

export async function fetchHubAgentSkillFile(name: string, path: string): Promise<string> {
  const response = await request<{ ok: boolean; content: string }>(
    `/api/hub-agent/skills/${encodeURIComponent(name)}/file?path=${encodeURIComponent(path)}`,
  )
  return response.content
}

export async function fetchHubAgentExternalDirectories(): Promise<ExternalDirEntry[]> {
  const response = await request<{ ok: boolean; directories: ExternalDirEntry[] }>(
    '/api/hub-agent/skills/external-directories',
  )
  return response.directories
}

export async function saveHubAgentExternalDirectories(directories: string[]): Promise<void> {
  await request('/api/hub-agent/skills/external-directories', {
    method: 'PUT',
    body: JSON.stringify({ directories }),
  })
}

export async function importHubAgentSkill(files: File[], category?: string): Promise<{ name: string }> {
  const headers: Record<string, string> = {}
  const token = getApiKey()
  if (token) headers.Authorization = `Bearer ${token}`
  const profile = getActiveProfileName()
  if (profile) headers['X-Hermes-Profile'] = profile
  const formData = new FormData()
  for (const file of files) {
    const path = (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name
    formData.append('file', file, path)
  }
  if (category) formData.append('category', category)
  const response = await fetch(`${getBaseUrlValue()}/api/hub-agent/skills/import`, {
    method: 'POST',
    headers,
    body: formData,
  })
  const text = await response.text()
  let payload: { name?: string; error?: string } | null = null
  try {
    payload = text ? JSON.parse(text) : null
  } catch {
    // Preserve raw text for useful server/proxy errors.
  }
  if (!response.ok) throw new Error(payload?.error || text || `Import failed (${response.status})`)
  return { name: payload?.name || '' }
}
