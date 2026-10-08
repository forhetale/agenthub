import { onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionSearch } from './useSessionSearch'

const CHAT_ROUTE_NAMES = new Set(['hermes.chat', 'hermes.session', 'hermes.globalAgent', 'hermes.globalAgentSession'])

export function useKeyboard() {
  const router = useRouter()
  const { sessionSearchOpen, openSessionSearch, closeSessionSearch } = useSessionSearch()

  function handleKeydown(e: KeyboardEvent) {
    const mod = e.ctrlKey || e.metaKey

    if (mod && e.key === 'n') {
      // Only on chat pages: elsewhere the new session would be created out of sight.
      if (!CHAT_ROUTE_NAMES.has(String(router.currentRoute.value.name || ''))) return
      e.preventDefault()
      void import('@/stores/hermes/chat').then(({ useChatStore }) => {
        const chatStore = useChatStore()
        const session = chatStore.newChat()
        void router.push({
          name: chatStore.runtimeMode === 'global_agent' ? 'hermes.globalAgentSession' : 'hermes.session',
          params: { sessionId: session.id },
        })
      })
      return
    }

    if (mod && e.key === 'j') {
      e.preventDefault()
      router.push({ name: 'hermes.jobs' })
      return
    }

    if (mod && e.key === ',') {
      if (router.currentRoute.value.name === 'login') return
      e.preventDefault()
      router.push({ name: 'hermes.settings' })
      return
    }

    if (mod && e.key.toLowerCase() === 'k') {
      if (router.currentRoute.value.name === 'login') return
      e.preventDefault()
      openSessionSearch()
      return
    }

    if (e.key === 'Escape') {
      if (sessionSearchOpen.value) {
        e.preventDefault()
        closeSessionSearch()
        return
      }
      // Close any open modals — naive-ui handles this internally
      const modal = document.querySelector('.n-modal-mask')
      if (modal) {
        const closeBtn = modal.querySelector('.n-base-close') as HTMLElement
        closeBtn?.click()
      }
    }
  }

  onMounted(() => {
    window.addEventListener('keydown', handleKeydown)
  })

  onUnmounted(() => {
    window.removeEventListener('keydown', handleKeydown)
  })
}
