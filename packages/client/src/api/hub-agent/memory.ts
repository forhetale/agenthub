import { request } from '@/api/client'

export type HubAgentMemoryStatus = 'active' | 'superseded' | 'expired' | 'deleted'

export interface HubAgentMemoryNode {
  id: string
  parentId?: string
  supersedesId?: string
  profileId: string
  scope?:
    | { type: 'profile' }
    | { type: 'context'; namespace: string; id: string }
    | { type: 'session'; id: string }
  origin?: { host?: string; namespace?: string; contextId?: string }
  domain: string
  categoryPath: string[]
  type: string
  key: string
  revision: number
  valueJson?: unknown
  title: string
  content: string
  status: HubAgentMemoryStatus
  confidence: number
  importance: number
  tags: string[]
  entities: string[]
  sourceMessageIds: string[]
  createdAt: string
  updatedAt: string
  expiresAt?: string
}

export async function fetchHubAgentMemory(input: {
  query?: string
  status?: HubAgentMemoryStatus
} = {}): Promise<HubAgentMemoryNode[]> {
  const params = new URLSearchParams()
  if (input.query) params.set('query', input.query)
  if (input.status) params.set('status', input.status)
  const suffix = params.size ? `?${params.toString()}` : ''
  const response = await request<{ ok: boolean; memories: HubAgentMemoryNode[] }>(`/api/hub-agent/memory${suffix}`)
  return response.memories
}

export async function updateHubAgentMemory(
  id: string,
  input: { expectedRevision: number; title: string; content: string; tags: string[] },
): Promise<HubAgentMemoryNode> {
  const response = await request<{ ok: boolean; memory: HubAgentMemoryNode }>(`/api/hub-agent/memory/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
  return response.memory
}

export async function deleteHubAgentMemory(id: string, expectedRevision: number): Promise<void> {
  await request(`/api/hub-agent/memory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    body: JSON.stringify({ expectedRevision }),
  })
}
