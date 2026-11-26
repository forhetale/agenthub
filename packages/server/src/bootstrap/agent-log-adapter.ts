import { existsSync } from 'fs'
import { join } from 'path'
import {
  HUB_AGENT_LOG_FILE_NAME,
  HubAgentDirectoryManager,
  HubAgentFileLogReader,
} from '../../../hub-agent/src'
import { config } from '../modules/studio/public/config'
import { configureAgentLogs } from '../modules/studio/public/agent-logs'
import {
  listLogFiles,
  readLogs,
} from '../modules/hermes/services/runtime/cli'

configureAgentLogs({
  listPrimaryAgentLogFiles: listLogFiles,
  readPrimaryAgentLogs: readLogs,
  getHubAgentLogSource: profile => {
    try {
      const directory = new HubAgentDirectoryManager(config.appHome).profileLogsPath(profile)
      const filePath = join(directory, HUB_AGENT_LOG_FILE_NAME)
      if (!existsSync(filePath)) return null
      const reader = new HubAgentFileLogReader({ directory })
      return {
        filePath: reader.filePath,
        query: options => reader.query(options as any),
      }
    } catch {
      return null
    }
  },
})
