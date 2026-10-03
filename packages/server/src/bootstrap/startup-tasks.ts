import { runStartupTasks, type StartupTask } from '../modules/studio/services/startup-tasks'

/**
 * Ordered, append-only list of one-time startup operations. See docs/harness/startup-tasks.md.
 * Retired IDs stay reserved: 2026-09-12-hermes-apikey-domain-v1.
 */
export function getStartupTasks(): StartupTask[] {
  return []
}

export function runRegisteredStartupTasks() {
  return runStartupTasks(getStartupTasks())
}
