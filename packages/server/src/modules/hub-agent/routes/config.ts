import Router from '@koa/router'
import { requireSuperAdmin } from '../../studio/public/auth'
import * as ctrl from '../controllers/config'

export const hubAgentConfigRoutes = new Router()

hubAgentConfigRoutes.get('/api/hub-agent/config', requireSuperAdmin, ctrl.get)
hubAgentConfigRoutes.put('/api/hub-agent/config', requireSuperAdmin, ctrl.update)
