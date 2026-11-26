import { request } from '@/api/client'

export interface HubAgentMcpServerConfig {
  type?: 'stdio' | 'streamable_http'
  command?: string
  args?: string[]
  env?: Record<string, string>
  url?: string
  headers?: Record<string, string>
  enabled?: boolean
}

export interface HubAgentMcpServerInfo {
  name: string
  managed: boolean
  config: HubAgentMcpServerConfig
}

export interface HubAgentMcpToolInfo {
  name: string
  description: string
}

export async function fetchHubAgentMcpServers(): Promise<HubAgentMcpServerInfo[]> {
  const response = await request<{ ok: boolean; servers: HubAgentMcpServerInfo[] }>('/api/hub-agent/mcp/servers')
  return response.servers
}

export async function createHubAgentMcpServer(name: string, config: HubAgentMcpServerConfig): Promise<HubAgentMcpServerInfo> {
  const response = await request<{ ok: boolean; server: HubAgentMcpServerInfo }>('/api/hub-agent/mcp/servers', {
    method: 'POST',
    body: JSON.stringify({ name, config }),
  })
  return response.server
}

export async function updateHubAgentMcpServer(name: string, config: HubAgentMcpServerConfig): Promise<HubAgentMcpServerInfo> {
  const response = await request<{ ok: boolean; server: HubAgentMcpServerInfo }>(`/api/hub-agent/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify({ config }),
  })
  return response.server
}

export async function setHubAgentMcpServerEnabled(name: string, enabled: boolean): Promise<HubAgentMcpServerInfo> {
  const response = await request<{ ok: boolean; server: HubAgentMcpServerInfo }>(`/api/hub-agent/mcp/servers/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    body: JSON.stringify({ enabled }),
  })
  return response.server
}

export async function deleteHubAgentMcpServer(name: string): Promise<void> {
  await request(`/api/hub-agent/mcp/servers/${encodeURIComponent(name)}`, { method: 'DELETE' })
}

export async function testHubAgentMcpServer(name: string): Promise<HubAgentMcpToolInfo[]> {
  const response = await request<{ ok: boolean; tools: HubAgentMcpToolInfo[] }>(`/api/hub-agent/mcp/servers/${encodeURIComponent(name)}/test`, { method: 'POST' })
  return response.tools
}
