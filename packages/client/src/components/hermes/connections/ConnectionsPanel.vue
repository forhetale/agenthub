<script setup lang="ts">
import PageHeader from '@/components/layout/PageHeader.vue'
import { useI18n } from 'vue-i18n'
import BarkPushPanel from './BarkPushPanel.vue'

const { t } = useI18n()
</script>

<template>
  <div class="connections-panel">
    <PageHeader>
    <header class="page-header">
      <div class="connections-header-left">
        <h2 class="header-title">{{ t('bark.title') }}</h2>
      </div>
    </header>
    </PageHeader>

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
</style>
