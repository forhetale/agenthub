import Router from '@koa/router'
import * as ctrl from '../controllers/bark'

export const notificationRoutes = new Router()

// Per-user settings: every authenticated user manages their own Bark channel.
// The super-admin-only "allow private network / HTTP" option is enforced in ctrl.saveBark.
notificationRoutes.get('/api/studio/notifications/bark', ctrl.getBark)
notificationRoutes.put('/api/studio/notifications/bark', ctrl.saveBark)
notificationRoutes.delete('/api/studio/notifications/bark', ctrl.clearBark)
notificationRoutes.post('/api/studio/notifications/bark/test', ctrl.testBark)
