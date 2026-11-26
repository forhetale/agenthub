import Router from '@koa/router'
import { requireSuperAdmin } from '../../studio/public/auth'
import * as ctrl from '../controllers/mcp'

export const hubAgentMcpRoutes = new Router()

hubAgentMcpRoutes.get('/api/hub-agent/mcp/servers', requireSuperAdmin, ctrl.list)
hubAgentMcpRoutes.post('/api/hub-agent/mcp/servers', requireSuperAdmin, ctrl.create)
hubAgentMcpRoutes.patch('/api/hub-agent/mcp/servers/:name', requireSuperAdmin, ctrl.update)
hubAgentMcpRoutes.delete('/api/hub-agent/mcp/servers/:name', requireSuperAdmin, ctrl.remove)
hubAgentMcpRoutes.post('/api/hub-agent/mcp/servers/:name/test', requireSuperAdmin, ctrl.test)
