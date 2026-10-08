// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent } from 'vue'
import { flushPromises, mount } from '@vue/test-utils'
import type { Job } from '@/api/hermes/jobs'

const mockMessage = vi.hoisted(() => ({
  info: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

const mockJobsStore = vi.hoisted(() => ({
  pauseJob: vi.fn(),
  resumeJob: vi.fn(),
  runJob: vi.fn(),
  deleteJob: vi.fn(),
}))

vi.mock('@/stores/hermes/jobs', () => ({
  useJobsStore: () => mockJobsStore,
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
  }),
}))

vi.mock('naive-ui', () => ({
  NButton: defineComponent({
    props: {
      disabled: { type: Boolean, default: false },
      loading: { type: Boolean, default: false },
    },
    emits: ['click'],
    template: '<button class="n-button-stub" :disabled="disabled" @click="$emit(\'click\', $event)"><slot /></button>',
  }),
  NTooltip: defineComponent({
    template: '<div class="n-tooltip-stub"><slot name="trigger" /><slot /></div>',
  }),
  NPopconfirm: defineComponent({
    emits: ['positive-click'],
    template: '<div class="n-popconfirm-stub"><slot name="trigger" /><span class="popconfirm-content"><slot /></span><button class="popconfirm-positive" @click="$emit(\'positive-click\')">ok</button></div>',
  }),
  useMessage: () => mockMessage,
}))

import JobCard from '@/components/hermes/jobs/JobCard.vue'

function makeJob(): Job {
  return {
    job_id: 'job-1',
    id: 'job-1',
    name: 'Daily research',
    prompt: 'summarize updates',
    skills: [],
    skill: null,
    model: null,
    provider: null,
    base_url: null,
    script: null,
    schedule: '0 9 * * *',
    schedule_display: '0 9 * * *',
    repeat: { times: null, completed: 0 },
    enabled: true,
    state: 'scheduled',
    paused_at: null,
    paused_reason: null,
    created_at: '2026-07-26T00:00:00Z',
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    deliver: 'local',
    origin: null,
    last_delivery_error: null,
  }
}

describe('JobCard run now', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not render a redundant tooltip around the labelled run button', () => {
    const wrapper = mount(JobCard, {
      props: { job: makeJob() },
    })

    expect(wrapper.text()).toContain('jobs.action.runNow')
    expect(wrapper.text()).not.toContain('jobs.action.triggerImmediately')
  })

  it('prevents duplicate run requests while the first request is pending', async () => {
    let resolveRun!: () => void
    mockJobsStore.runJob.mockImplementation(() => new Promise<void>((resolve) => {
      resolveRun = resolve
    }))
    const wrapper = mount(JobCard, {
      props: { job: makeJob() },
    })
    const runButton = wrapper.findAll('.n-button-stub')
      .find(button => button.text() === 'jobs.action.runNow')!

    await runButton.trigger('click')
    await runButton.trigger('click')

    expect(mockJobsStore.runJob).toHaveBeenCalledOnce()
    expect(runButton.attributes('disabled')).toBeDefined()

    resolveRun()
    await flushPromises()

    expect(mockMessage.info).toHaveBeenCalledOnce()
    expect(mockMessage.info).toHaveBeenCalledWith('jobs.jobTriggered')
  })
})

describe('JobCard delete', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('asks for confirmation before deleting a job', async () => {
    mockJobsStore.deleteJob.mockResolvedValue(undefined)
    const wrapper = mount(JobCard, {
      props: { job: makeJob() },
    })
    const deleteButton = wrapper.findAll('.n-button-stub')
      .find(button => button.text() === 'common.delete')!

    await deleteButton.trigger('click')
    expect(mockJobsStore.deleteJob).not.toHaveBeenCalled()
    expect(wrapper.find('.popconfirm-content').text()).toBe('jobs.deleteConfirm')

    await wrapper.find('.popconfirm-positive').trigger('click')
    await flushPromises()

    expect(mockJobsStore.deleteJob).toHaveBeenCalledWith('job-1')
    expect(mockMessage.success).toHaveBeenCalledWith('jobs.jobDeleted')
  })
})
