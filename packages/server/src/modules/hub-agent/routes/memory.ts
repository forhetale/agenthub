import Router from '@koa/router'
import { requireSuperAdmin } from '../../studio/public/auth'
import * as ctrl from '../controllers/memory'

export const hubAgentMemoryRoutes = new Router()

hubAgentMemoryRoutes.get('/api/hub-agent/memory', requireSuperAdmin, ctrl.list)
hubAgentMemoryRoutes.patch('/api/hub-agent/memory/:id', requireSuperAdmin, ctrl.update)
hubAgentMemoryRoutes.delete('/api/hub-agent/memory/:id', requireSuperAdmin, ctrl.remove)
