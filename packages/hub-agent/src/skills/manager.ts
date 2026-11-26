import { randomUUID } from 'node:crypto'
import type { AgentSkill } from './types'
import type { HubAgentToolManager } from '../tools/manager'
import type { SkillManageInput } from '../tools/skills'
import type { AgentToolContext, AgentToolResult } from '../tools/types'

export interface HubAgentSkillOperationOptions {
  profile?: string
  runId?: string
}

export interface HubAgentSkillCreateInput extends HubAgentSkillOperationOptions {
  name: string
  content: string
  category?: string
}

export interface HubAgentSkillEditInput extends HubAgentSkillOperationOptions {
  name: string
  content: string
}

export interface HubAgentSkillPatchInput extends HubAgentSkillOperationOptions {
  name: string
  oldString: string
  newString: string
  filePath?: string
  replaceAll?: boolean
}

export interface HubAgentSkillSupportFileInput extends HubAgentSkillOperationOptions {
  name: string
  filePath: string
  fileContent?: string
}

/** Public skill module used through `hubAgent.skill`. */
export class HubAgentSkillManager {
  private readonly tools: HubAgentToolManager
  private readonly registeredSkills = new Map<string, Map<string, AgentSkill>>()

  constructor(tools: HubAgentToolManager) {
    this.tools = tools
  }

  register(skill: AgentSkill, profile = 'default'): void {
    const key = normalizeProfile(profile)
    let skills = this.registeredSkills.get(key)
    if (!skills) {
      skills = new Map()
      this.registeredSkills.set(key, skills)
    }
    skills.set(skill.id, skill)
  }

  registerMany(skills: AgentSkill[], profile = 'default'): void {
    for (const skill of skills) this.register(skill, profile)
  }

  unregister(id: string, profile = 'default'): boolean {
    return this.registeredSkills.get(normalizeProfile(profile))?.delete(id) ?? false
  }

  get(id: string, profile = 'default'): AgentSkill | undefined {
    return this.registeredSkills.get(normalizeProfile(profile))?.get(id)
  }

  registered(profile = 'default'): AgentSkill[] {
    return [...(this.registeredSkills.get(normalizeProfile(profile))?.values() || [])]
  }

  discover(query = '', options: HubAgentSkillOperationOptions = {}): Promise<AgentToolResult> {
    return this.execute('skill_list', { query }, options)
  }

  view(
    name: string,
    filePath?: string,
    options: HubAgentSkillOperationOptions = {},
  ): Promise<AgentToolResult> {
    return this.execute('skill_view', {
      name,
      ...(filePath ? { filePath } : {}),
    }, options)
  }

  create(input: HubAgentSkillCreateInput): Promise<AgentToolResult> {
    return this.manage({
      action: 'create',
      name: input.name,
      content: input.content,
      category: input.category,
    }, input)
  }

  async edit(input: HubAgentSkillEditInput): Promise<AgentToolResult> {
    const options = operationOptions(input)
    const viewed = await this.view(input.name, undefined, options)
    if (!viewed.ok) return viewed
    return this.manage({ action: 'edit', name: input.name, content: input.content }, options)
  }

  async patch(input: HubAgentSkillPatchInput): Promise<AgentToolResult> {
    const options = operationOptions(input)
    const viewed = await this.view(input.name, input.filePath, options)
    if (!viewed.ok) return viewed
    return this.manage({
      action: 'patch',
      name: input.name,
      oldString: input.oldString,
      newString: input.newString,
      filePath: input.filePath,
      replaceAll: input.replaceAll,
    }, options)
  }

  async delete(
    name: string,
    options: HubAgentSkillOperationOptions & { confirmed: boolean },
  ): Promise<AgentToolResult> {
    const operation = operationOptions(options)
    const viewed = await this.view(name, undefined, operation)
    if (!viewed.ok) return viewed
    return this.manage({ action: 'delete', name, confirmed: options.confirmed }, operation)
  }

  async writeFile(input: HubAgentSkillSupportFileInput & { fileContent: string }): Promise<AgentToolResult> {
    const options = operationOptions(input)
    // Existing files require a same-run view. A missing file is allowed.
    await this.view(input.name, input.filePath, options)
    return this.manage({
      action: 'write_file',
      name: input.name,
      filePath: input.filePath,
      fileContent: input.fileContent,
    }, options)
  }

  async removeFile(input: HubAgentSkillSupportFileInput): Promise<AgentToolResult> {
    const options = operationOptions(input)
    const viewed = await this.view(input.name, input.filePath, options)
    if (!viewed.ok) return viewed
    return this.manage({
      action: 'remove_file',
      name: input.name,
      filePath: input.filePath,
    }, options)
  }

  manage(
    input: SkillManageInput,
    options: HubAgentSkillOperationOptions = {},
  ): Promise<AgentToolResult> {
    return this.execute('skill_manage', input, options)
  }

  runtimeSkills(profile = 'default'): AgentSkill[] {
    return this.registered(profile)
  }

  private execute(
    name: string,
    input: Record<string, unknown>,
    options: HubAgentSkillOperationOptions,
  ): Promise<AgentToolResult> {
    const profile = normalizeProfile(options.profile)
    const context: AgentToolContext = {
      runId: options.runId || randomUUID(),
      profileId: profile,
      skillMutationSource: 'foreground',
    }
    return this.tools.execute(name, input, context, profile)
  }
}

function operationOptions(options: HubAgentSkillOperationOptions): HubAgentSkillOperationOptions {
  return {
    profile: normalizeProfile(options.profile),
    runId: options.runId || randomUUID(),
  }
}

function normalizeProfile(profile?: string): string {
  return String(profile || '').trim() || 'default'
}
