/**
 * Sentence/paragraph segmenter for streamed assistant text.
 * Shared by the chat realtime voice stage to split speech into TTS units.
 */

export interface SpeechSegmenter {
  pushDelta: (delta: string) => string[]
  flush: () => string | null
  reset: () => void
}

export interface SpeechSegmenterOptions {
  maxChars?: number
  emitOnSentenceEnd?: boolean
}

const PARAGRAPH_END_RE = /[。！？!?.…][\s"'”’）)\]】》]*$/
const HIDDEN_REASONING_BLOCK_RE = /<(think|thinking)\b[^>]*>[\s\S]*?<\/\1>/gi
const UNCLOSED_HIDDEN_REASONING_BLOCK_RE = /<(think|thinking)\b[^>]*>[\s\S]*/gi
const FENCED_CODE_BLOCK_RE = /```[\s\S]*?```/g
const UNCLOSED_FENCED_CODE_BLOCK_RE = /```[\s\S]*/g
const INLINE_CODE_RE = /`[^`\n]+`/g
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
const HTML_DECLARATION_RE = /<![^>]*>/g
const HTML_TAG_RE = /<\/?[a-zA-Z][\w:-]*(?:\s+(?:[^"'<>]|"[^"]*"|'[^']*')*)?\s*\/?>/g
const KEYCAP_EMOJI_RE = /[0-9#*]\uFE0F?\u20E3/gu
const EMOJI_RE = /\p{Extended_Pictographic}[\uFE0E\uFE0F\u{E0100}-\u{E01EF}]?(?:\u200D\p{Extended_Pictographic}[\uFE0E\uFE0F\u{E0100}-\u{E01EF}]?)*/gu
const SYMBOL_RE = /[\p{So}\p{Sk}\uFE0E\uFE0F\u{E0100}-\u{E01EF}\u200D\u20E3\u2190-\u21FF\u2300-\u23FF\u2460-\u24FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u27BF]/gu
const CONTROL_RE = /[\p{Cc}\p{Cf}]/gu

function isMarkdownTableLine(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed) return false
  const pipeCount = (trimmed.match(/\|/g) || []).length
  return pipeCount >= 2
    || /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(trimmed)
}

function normalizeSpeechText(text: string): string {
  const withoutTables = text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/[^\s<>)\]]+/gi, ' ')
    .replace(/www\.[^\s<>)\]]+/gi, ' ')
    .split(/\r?\n/)
    .filter(line => !isMarkdownTableLine(line))
    .join('\n')

  return withoutTables
    .replace(HIDDEN_REASONING_BLOCK_RE, ' ')
    .replace(UNCLOSED_HIDDEN_REASONING_BLOCK_RE, ' ')
    .replace(FENCED_CODE_BLOCK_RE, ' ')
    .replace(UNCLOSED_FENCED_CODE_BLOCK_RE, ' ')
    .replace(INLINE_CODE_RE, ' ')
    .replace(HTML_COMMENT_RE, ' ')
    .replace(HTML_DECLARATION_RE, ' ')
    .replace(HTML_TAG_RE, ' ')
    .replace(KEYCAP_EMOJI_RE, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(SYMBOL_RE, ' ')
    .replace(CONTROL_RE, ' ')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/[*_#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function paragraphEndsNormally(text: string): boolean {
  return PARAGRAPH_END_RE.test(text.trimEnd())
}

function sentenceBoundary(text: string, index: number): number {
  const char = text[index]
  if (!/[。！？!?…\.]/.test(char)) return -1

  if (char === '.') {
    const previous = text[index - 1] || ''
    const next = text[index + 1] || ''
    if (/\d/.test(previous) && /\d/.test(next)) return -1
    if (next && !/[\s"'”’）)\]】》]/.test(next)) return -1

    const word = text.slice(0, index).match(/([A-Za-z]+)$/)?.[1]?.toLowerCase() || ''
    if (!next && /^(?:mr|mrs|ms|dr|prof|sr|jr|vs|etc|e|g|i)$/.test(word)) return -1
  }

  let end = index + 1
  while (end < text.length && /[。！？!?…\."'”’）)\]】》]/.test(text[end])) end += 1
  return end
}

function findReadyParagraphBoundary(text: string, emitOnSentenceEnd = false): number {
  let inFence = false
  let inInlineCode = false
  let inLinkText = false
  let inLinkUrl = false
  let inUrl = false

  for (let i = 0; i < text.length; i += 1) {
    const rest = text.slice(i)

    if (rest.startsWith('```')) {
      inFence = !inFence
      i += 2
      continue
    }

    if (inFence) continue

    const char = text[i]

    if (char === '`') {
      inInlineCode = !inInlineCode
      continue
    }
    if (inInlineCode) continue

    if (inLinkUrl) {
      if (char === ')') inLinkUrl = false
      continue
    }

    if (inUrl) {
      if (/\s/.test(char)) inUrl = false
      else continue
    }

    if (rest.startsWith('http://') || rest.startsWith('https://') || rest.startsWith('www.')) {
      inUrl = true
      if (rest.startsWith('https://')) i += 7
      else if (rest.startsWith('http://')) i += 6
      else i += 3
      continue
    }
    if (inLinkText) {
      if (char === ']' && text[i + 1] === '(') {
        inLinkText = false
        inLinkUrl = true
        i += 1
      }
      continue
    }
    if (char === '[') {
      inLinkText = true
      continue
    }

    if (emitOnSentenceEnd) {
      const end = sentenceBoundary(text, i)
      if (end > 0) return end
    }

    if (char === '\n' || char === '\r') {
      let end = i + 1
      if (char === '\r' && text[i + 1] === '\n') {
        end += 1
        i += 1
      }
      if (emitOnSentenceEnd) {
        const lineStart = Math.max(text.lastIndexOf('\n', i - 1), text.lastIndexOf('\r', i - 1)) + 1
        const line = text.slice(lineStart, i)
        if (isMarkdownTableLine(line)) return end
      }
      if (paragraphEndsNormally(text.slice(0, end))) return end
    }
  }

  return -1
}

export function createSpeechSegmenter(options: SpeechSegmenterOptions = {}): SpeechSegmenter {
  let buffer = ''

  function takeReadySegments(force = false): string[] {
    const segments: string[] = []

    while (buffer.length > 0) {
      let end = findReadyParagraphBoundary(buffer, options.emitOnSentenceEnd)

      if (end < 0) {
        if (!force) break
        end = buffer.length
      }

      const segment = normalizeSpeechText(buffer.slice(0, end))
      buffer = buffer.slice(end)

      if (segment) {
        segments.push(segment)
      }
    }

    return segments
  }

  return {
    pushDelta(delta: string): string[] {
      if (!delta) return []
      buffer += delta
      return takeReadySegments(false)
    },
    flush(): string | null {
      const segments = takeReadySegments(true)
      return segments.length ? segments.join(' ') : null
    },
    reset(): void {
      buffer = ''
    },
  }
}
