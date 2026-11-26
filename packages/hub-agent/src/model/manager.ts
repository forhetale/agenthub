import type {
  HubAgentConfig,
  HubAgentModelAuthorizationSettings,
  HubAgentModelProviderSettings,
} from '../config'
import type {
  ConfiguredModelAuthorizationEntry,
  ConfiguredModelProviderEntry,
  HubAgentConfigStore,
  InstallModelProviderPresetOptions,
} from '../config-store'
import type {
  HubAgentModelAuthorizationCredentials,
  HubAgentModelAuthorizationManager,
} from './authorization'
import type { ResolveConfiguredModelProviderInput } from './provider-config'
import type { HubAgentModelProviderPreset } from './provider-presets'
import type { ModelClient, ModelClientOptions, ModelProviderConfig } from './types'

export interface HubAgentModelManagerOptions {
  config: HubAgentConfigStore
  authorizations: HubAgentModelAuthorizationManager
  resolveProvider: (input?: Omit<ResolveConfiguredModelProviderInput, 'config'>) => ModelProviderConfig
  createClient: (
    input?: Omit<ResolveConfiguredModelProviderInput, 'config'>,
    clientOptions?: ModelClientOptions,
  ) => ModelClient
}

/** Public model module used through `hubAgent.model`. */
export class HubAgentModelManager {
  readonly authorization: HubAgentModelAuthorizationManager
  private readonly config: HubAgentConfigStore
  private readonly resolveProvider: HubAgentModelManagerOptions['resolveProvider']
  private readonly createClientFactory: HubAgentModelManagerOptions['createClient']

  constructor(options: HubAgentModelManagerOptions) {
    this.config = options.config
    this.authorization = options.authorizations
    this.resolveProvider = options.resolveProvider
    this.createClientFactory = options.createClient
  }

  listPresets(): HubAgentModelProviderPreset[] {
    return this.config.listModelProviderPresets()
  }

  getPreset(id: string): HubAgentModelProviderPreset | undefined {
    return this.config.getModelProviderPreset(id)
  }

  setPreset(
    id: string,
    preset: Omit<HubAgentModelProviderPreset, 'id'> & { id?: string },
  ): HubAgentConfig {
    return this.config.setModelProviderPreset(id, preset)
  }

  updatePreset(id: string, patch: Partial<HubAgentModelProviderPreset>): HubAgentConfig {
    return this.config.updateModelProviderPreset(id, patch)
  }

  deletePreset(id: string): boolean {
    return this.config.deleteModelProviderPreset(id)
  }

  install(id: string, options: InstallModelProviderPresetOptions = {}): HubAgentConfig {
    return this.config.installModelProviderPreset(id, options)
  }

  listProviders(): ConfiguredModelProviderEntry[] {
    return this.config.listModelProviders()
  }

  getProvider(id: string): HubAgentModelProviderSettings | undefined {
    return this.config.getModelProvider(id)
  }

  setProvider(id: string, settings: HubAgentModelProviderSettings): HubAgentConfig {
    return this.config.setModelProvider(id, settings)
  }

  updateProvider(id: string, patch: Partial<HubAgentModelProviderSettings>): HubAgentConfig {
    return this.config.updateModelProvider(id, patch)
  }

  deleteProvider(id: string): boolean {
    return this.config.deleteModelProvider(id)
  }

  setDefault(provider: string, model?: string): HubAgentConfig {
    return this.config.setDefaultModel(provider, model)
  }

  listAuthorizations(): ConfiguredModelAuthorizationEntry[] {
    return this.authorization.list()
  }

  getAuthorization(provider: string): HubAgentModelAuthorizationSettings | undefined {
    return this.authorization.get(provider)
  }

  setAuthorization(provider: string, settings: HubAgentModelAuthorizationSettings): HubAgentConfig {
    return this.authorization.set(provider, settings)
  }

  updateAuthorization(
    provider: string,
    patch: Partial<HubAgentModelAuthorizationSettings>,
  ): HubAgentConfig {
    return this.authorization.update(provider, patch)
  }

  deleteAuthorization(provider: string): boolean {
    return this.authorization.delete(provider)
  }

  refreshAuthorization(
    provider: string,
    model?: string,
  ): Promise<HubAgentModelAuthorizationCredentials> {
    return this.authorization.refresh(provider, model)
  }

  resolveAuthorization(
    provider: string,
    model?: string,
  ): Promise<HubAgentModelAuthorizationCredentials> {
    return this.authorization.resolve(provider, model)
  }

  providerConfig(
    input: Omit<ResolveConfiguredModelProviderInput, 'config'> = {},
  ): ModelProviderConfig {
    return this.resolveProvider(input)
  }

  createClient(
    input: Omit<ResolveConfiguredModelProviderInput, 'config'> = {},
    clientOptions: ModelClientOptions = {},
  ): ModelClient {
    return this.createClientFactory(input, clientOptions)
  }
}
