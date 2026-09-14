<script setup lang="ts">
import { NButton } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import BarkPushPanel from './BarkPushPanel.vue'

defineProps<{
  sidebarCollapsed: boolean
}>()

const emit = defineEmits<{
  toggleSidebar: []
}>()

const { t } = useI18n()
</script>

<template>
  <div class="connections-panel">
    <header class="page-header">
      <div class="connections-header-left">
        <NButton
          class="connections-sidebar-toggle"
          quaternary
          size="small"
          circle
          :title="sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')"
          :aria-label="sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')"
          @click="emit('toggleSidebar')"
        >
          <template #icon>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
            </svg>
          </template>
        </NButton>
        <h2 class="header-title">{{ t('bark.title') }}</h2>
      </div>
    </header>

    <div class="bark-scroll"><BarkPushPanel /></div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;

.connections-panel {
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: $bg-main-surface;
}

.bark-scroll { flex: 1; min-height: 0; overflow-y: auto; }

.connections-header-left {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: $breakpoint-mobile) {
  .connections-sidebar-toggle {
    display: none;
  }
}
</style>
