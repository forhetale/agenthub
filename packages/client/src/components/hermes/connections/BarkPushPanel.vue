<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { NAlert, NButton, NForm, NFormItem, NInput, NSelect, NSpace, NSwitch, NTag, useDialog, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { languageOptions } from '@/i18n/language-options'
import { getBarkSettings, saveBarkSettings, clearBarkSettings, testBarkSettings, type BarkSettings } from '@/api/studio/bark'
import { isStoredSuperAdmin } from '@/api/client'
import { useChatStore } from '@/stores/hermes/chat'
const { t } = useI18n()
const message = useMessage()
const dialog = useDialog()
const chatStore = useChatStore()
const busy = ref(false)
const loaded = ref(false)
const settings = ref<BarkSettings | null>(null)
const pushUrl = ref('')
const form = reactive({ serverUrl: 'https://api.day.app', deviceKey: '', group: 'AgentHub', sound: '', studioUrl: '', allowPrivateNetwork: false, locale: 'zh', defaultSessionPush: true, contentPreview: false })
const languageChoices = languageOptions
function apply(value: BarkSettings) {
  settings.value = value
  Object.assign(form, { serverUrl: value.serverUrl, deviceKey: '', group: value.group, sound: value.sound, studioUrl: value.studioUrl, allowPrivateNetwork: value.allowPrivateNetwork, locale: value.locale || 'zh',
    defaultSessionPush: value.defaultSessionPush !== false, contentPreview: value.contentPreview === true })
  chatStore.setDefaultSessionPush(value.defaultSessionPush !== false)
  pushUrl.value = ''
  loaded.value = true
}
function errorText(error: unknown) {
  const code = error instanceof Error ? error.message : ''
  const known = ['invalid_config', 'invalid_server_url', 'invalid_device_key', 'invalid_studio_url', 'private_network_admin_only', 'not_configured', 'rate_limited', 'unsafe_or_unreachable_server', 'timeout', 'network_error', 'server_rejected', 'storage_unavailable', 'config_changed', 'response_too_large', 'send_failed']
  return known.includes(code) ? t(`bark.errors.${code}`) : /^http_\d{3}$/.test(code) ? t('bark.httpError', { status: code.slice(5) }) : t('bark.failed')
}
async function run(action: () => Promise<void>) {
  busy.value = true
  try { await action() } catch (error) { message.error(errorText(error)) }
  finally { busy.value = false }
}
function parseUrl() {
  try {
    const url = new URL(pushUrl.value.trim())
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) throw new Error()
    const segments = url.pathname.split('/').filter(Boolean)
    if (!segments.length) throw new Error()
    // Bark's app copies /DEVICE_KEY/title/body; custom reverse-proxy prefixes use manual fields.
    form.deviceKey = decodeURIComponent(segments[0]!)
    form.serverUrl = url.origin
    pushUrl.value = ''
    message.success(t('bark.parsed'))
  } catch { message.error(t('bark.errors.invalid_server_url')) }
}
async function save() {
  await run(async () => { apply(await saveBarkSettings({ ...form })); message.success(t('bark.saved')) })
}
async function test() {
  await run(async () => {
    try { await testBarkSettings(); message.success(t('bark.accepted')) }
    finally { settings.value = await getBarkSettings() }
  })
}
function clear() {
  dialog.warning({ title: t('bark.clear'), content: t('bark.clearConfirm'), positiveText: t('bark.clear'), negativeText: t('common.cancel'),
    onPositiveClick: () => run(async () => { apply(await clearBarkSettings()); message.success(t('bark.cleared')) }),
  })
}
onMounted(() => run(async () => apply(await getBarkSettings())))
</script>
<template>
  <section class="bark-panel" data-testid="bark-panel">
    <h3>Bark</h3>
    <NAlert type="info" :show-icon="true">{{ t('bark.description') }}</NAlert>
    <NAlert v-if="!loaded && !busy" type="error">{{ t('bark.loadFailed') }} <NButton text @click="run(async () => apply(await getBarkSettings()))">{{ t('bark.reload') }}</NButton></NAlert>
    <NSpace align="center"><NTag :type="settings?.configured ? 'success' : 'default'">{{ t(settings?.configured ? 'bark.configured' : 'bark.unconfigured') }}</NTag><span>{{ t('bark.events') }}</span></NSpace>
    <NForm label-placement="top" :disabled="busy || !loaded">
      <NFormItem :label="t('bark.pushUrl')"><NSpace vertical style="width:100%"><NInput v-model:value="pushUrl" type="password" show-password-on="click" :placeholder="t('bark.pushUrlHint')" autocomplete="off" /><NButton :disabled="!pushUrl" @click="parseUrl">{{ t('bark.parse') }}</NButton></NSpace></NFormItem>
      <NFormItem :label="t('bark.serverUrl')"><NInput v-model:value="form.serverUrl" placeholder="https://api.day.app" /></NFormItem>
      <NFormItem label="Device Key"><NInput v-model:value="form.deviceKey" type="password" show-password-on="click" autocomplete="new-password" :placeholder="t(settings?.hasKey ? 'bark.keepKey' : 'bark.enterKey')" /></NFormItem>
      <NFormItem :label="t('bark.group')"><NInput v-model:value="form.group" maxlength="120" /></NFormItem>
      <NFormItem :label="t('bark.language')"><NSpace vertical style="width:100%"><NSelect v-model:value="form.locale" :options="languageChoices" /><span class="private-hint">{{ t('bark.languageHint') }}</span></NSpace></NFormItem>
      <NFormItem :label="t('bark.defaultSessionPush')"><NSwitch v-model:value="form.defaultSessionPush" /><span class="private-hint">{{ t('bark.defaultSessionPushHint') }}</span></NFormItem>
      <NFormItem :label="t('bark.contentPreview')"><NSwitch v-model:value="form.contentPreview" /><span class="private-hint">{{ t('bark.contentPreviewHint') }}</span></NFormItem>
      <NFormItem :label="t('bark.sound')"><NInput v-model:value="form.sound" :placeholder="t('bark.soundHint')" /></NFormItem>
      <NFormItem :label="t('bark.studioUrl')"><NInput v-model:value="form.studioUrl" :placeholder="t('bark.studioUrlHint')" /></NFormItem>
      <NFormItem v-if="isStoredSuperAdmin()" :label="t('bark.privateNetwork')"><NSwitch v-model:value="form.allowPrivateNetwork" /><span class="private-hint">{{ t('bark.privateHint') }}</span></NFormItem>
    </NForm>
    <NSpace><NButton type="primary" :loading="busy" :disabled="!loaded" @click="save">{{ t('bark.save') }}</NButton><NButton :disabled="busy || !settings?.configured" @click="test">{{ t('bark.test') }}</NButton><NButton :disabled="busy || !settings?.configured" @click="clear">{{ t('bark.clear') }}</NButton></NSpace>
    <p class="hint">{{ t('bark.testHint') }}</p>
    <NAlert v-if="settings?.lastResult" :type="settings.lastResult.ok ? 'success' : 'error'">{{ t('bark.lastResult') }} · {{ settings.lastResult.at }} · {{ settings.lastResult.ok ? t('bark.accepted') : errorText(new Error(settings.lastResult.code)) }}</NAlert>
    <p class="hint">{{ t('bark.privacy') }}</p>
  </section>
</template>
<style scoped lang="scss">
.bark-panel { max-width: 760px; margin: 0 auto; padding: 24px; display: flex; flex-direction: column; gap: 18px; }
h3, p { margin: 0; }
.hint, .private-hint { opacity: .7; font-size: 13px; line-height: 1.6; }
.private-hint { margin-inline-start: 12px; }
</style>
