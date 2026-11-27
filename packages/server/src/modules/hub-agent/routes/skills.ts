import Router from '@koa/router'
import { requireSuperAdmin } from '../../studio/public/auth'
import * as ctrl from '../controllers/skills'

export const hubAgentSkillRoutes = new Router()

hubAgentSkillRoutes.get('/api/hub-agent/skills', requireSuperAdmin, ctrl.list)
hubAgentSkillRoutes.get('/api/hub-agent/skills/external-directories', requireSuperAdmin, ctrl.externalDirectories)
hubAgentSkillRoutes.put('/api/hub-agent/skills/external-directories', requireSuperAdmin, ctrl.saveExternalDirectories)
hubAgentSkillRoutes.post('/api/hub-agent/skills/import', requireSuperAdmin, ctrl.importSkill)
hubAgentSkillRoutes.get('/api/hub-agent/skills/:name/files', requireSuperAdmin, ctrl.files)
hubAgentSkillRoutes.get('/api/hub-agent/skills/:name/file', requireSuperAdmin, ctrl.file)
hubAgentSkillRoutes.put('/api/hub-agent/skills/:name/toggle', requireSuperAdmin, ctrl.toggle)
hubAgentSkillRoutes.get('/api/hub-agent/skills/:name', requireSuperAdmin, ctrl.detail)
hubAgentSkillRoutes.post('/api/hub-agent/skills', requireSuperAdmin, ctrl.create)
hubAgentSkillRoutes.put('/api/hub-agent/skills/:name', requireSuperAdmin, ctrl.update)
hubAgentSkillRoutes.delete('/api/hub-agent/skills/:name', requireSuperAdmin, ctrl.remove)
