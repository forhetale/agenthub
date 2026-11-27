import Router from '@koa/router'
import * as ctrl from '../controllers/model-api'

const CANONICAL_MODEL_API_PREFIX = '/api/agenthub/models'
export const LEGACY_MODEL_API_PREFIX = '/api/ekko-studio/models'

export const modelApiRoutes = new Router()
modelApiRoutes.get('/api/studio/models/api-keys', ctrl.modelApiKeys)
modelApiRoutes.post('/api/studio/models/api-keys', ctrl.modelApiCreateKey)
modelApiRoutes.patch('/api/studio/models/api-keys/:id', ctrl.modelApiEditKey)
modelApiRoutes.delete('/api/studio/models/api-keys/:id', ctrl.modelApiRevokeKey)
modelApiRoutes.get('/api/agenthub/models/v1/models', ctrl.modelApiModels)
modelApiRoutes.post('/api/agenthub/models/v1/responses', ctrl.modelApiResponses)
modelApiRoutes.post('/api/agenthub/models/v1/chat/completions', ctrl.modelApiChatCompletions)
modelApiRoutes.post('/api/agenthub/models/v1/messages/count_tokens', ctrl.modelApiMessages)
modelApiRoutes.post('/api/agenthub/models/v1/messages', ctrl.modelApiMessages)
modelApiRoutes.post('/api/agenthub/models/v1beta/models/*operation', ctrl.modelApiGemini)
modelApiRoutes.post('/api/agenthub/models/gemini/v1beta/models/*operation', ctrl.modelApiGemini)

for (const [method, suffix, handler] of [
  ['get', '/v1/models', ctrl.modelApiModels],
  ['post', '/v1/responses', ctrl.modelApiResponses],
  ['post', '/v1/chat/completions', ctrl.modelApiChatCompletions],
  ['post', '/v1/messages/count_tokens', ctrl.modelApiMessages],
  ['post', '/v1/messages', ctrl.modelApiMessages],
  ['post', '/v1beta/models/*operation', ctrl.modelApiGemini],
  ['post', '/gemini/v1beta/models/*operation', ctrl.modelApiGemini],
] as const) {
  modelApiRoutes[method](`${LEGACY_MODEL_API_PREFIX}${suffix}`, handler)
}
export { CANONICAL_MODEL_API_PREFIX }
