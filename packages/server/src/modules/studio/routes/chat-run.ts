import Router from '@koa/router'
import * as ctrl from '../controllers/chat-run'
import { updateTaskPlan } from '../controllers/task-plans'
export { getChatRunServer, setChatRunServer } from '../public/chat-run'

export const chatRunRoutes = new Router()

chatRunRoutes.post('/api/studio/task-plans/update', updateTaskPlan)

chatRunRoutes.post('/api/studio/chat-run/runs', ctrl.runOnce)
