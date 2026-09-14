import { describe, expect, it } from 'vitest'
import { createSpeechSegmenter } from '@/utils/speech-segmenter'

describe('speech segmenter', () => {
  it('segments assistant output for speech without tool content', () => {
    const segmenter = createSpeechSegmenter({ maxChars: 24 })

    expect(segmenter.pushDelta('你好，')).toEqual([])
    expect(segmenter.pushDelta('我开始处理了。\n下一步')).toEqual(['你好，我开始处理了。'])
    expect(segmenter.flush()).toBe('下一步')
  })

  it('keeps unfinished paragraphs together and ignores max character soft splits', () => {
    const segmenter = createSpeechSegmenter({ maxChars: 24 })

    expect(segmenter.pushDelta('第一段没结束\n')).toEqual([])
    expect(segmenter.pushDelta('第二段结束了。\n')).toEqual(['第一段没结束 第二段结束了。'])
    expect(segmenter.pushDelta('这是一段很长很长的内容，没有句末换行，也不会按长度提前切')).toEqual([])
    expect(segmenter.pushDelta('，直到段落结束。\n')).toEqual([
      '这是一段很长很长的内容，没有句末换行，也不会按长度提前切，直到段落结束。',
    ])
  })

  it('can emit complete streaming sentences before a newline arrives', () => {
    const segmenter = createSpeechSegmenter({ emitOnSentenceEnd: true })

    expect(segmenter.pushDelta('第一句已经完成。第二句')).toEqual(['第一句已经完成。'])
    expect(segmenter.pushDelta('也完成了！第三句还在生成')).toEqual(['第二句也完成了！'])
    expect(segmenter.flush()).toBe('第三句还在生成')
  })

  it('does not split decimals and removes inline code in sentence mode', () => {
    const segmenter = createSpeechSegmenter({ emitOnSentenceEnd: true })

    expect(segmenter.pushDelta('版本是 3.14，运行 `foo.bar()` 后完成。')).toEqual([
      '版本是 3.14，运行 后完成。',
    ])
  })

  it('filters streaming markdown tables with the same readable text rules as the chat voice stage', () => {
    const segmenter = createSpeechSegmenter({ emitOnSentenceEnd: true })

    expect(segmenter.pushDelta([
      '百度今日热搜 Top 30：',
      '',
      '| 排名 | 热搜话题 |',
      '|------|---------|',
      '| 1 | 大国外交的“中国时间” |',
      '| 2 | 人大撤销蒋方舟硕士学位 |',
      '| 3 | 人均日通话降至8.5分钟 |',
      '',
    ].join('\n'))).toEqual([
      '百度今日热搜 Top 30：',
    ])
  })

  it('removes hidden reasoning, code, html, emoji, symbols, and list markers before speech', () => {
    const segmenter = createSpeechSegmenter({ emitOnSentenceEnd: true })

    expect(segmenter.pushDelta([
      '<thinking>不应该朗读。</thinking>',
      '- **结论**：运行 `npm test` 后通过 ✅ → 完成。',
    ].join('\n'))).toEqual([
      '结论：运行 后通过 完成。',
    ])
  })
})
