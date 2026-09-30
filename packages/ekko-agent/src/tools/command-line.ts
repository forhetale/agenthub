/**
 * Splits a model-supplied command string into an executable and arguments.
 * terminal_exec and its approval check share this so approval always sees the
 * executable that actually runs. On Windows, backslashes are path separators
 * and only escape a following double quote.
 */
export function splitCommandLine(command: string, platform: NodeJS.Platform = process.platform): string[] {
  const windows = platform === 'win32'
  const characters = Array.from(command.trim())
  const parts: string[] = []
  let current = ''
  let quote: '"' | "'" | null = null
  let escaped = false

  for (let index = 0; index < characters.length; index += 1) {
    const char = characters[index]
    if (escaped) {
      current += char
      escaped = false
      continue
    }
    if (char === '\\') {
      if (windows && characters[index + 1] !== '"') current += char
      else escaped = true
      continue
    }
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (/\s/.test(char)) {
      if (current) {
        parts.push(current)
        current = ''
      }
      continue
    }
    current += char
  }

  if (escaped) current += '\\'
  if (current) parts.push(current)
  return parts
}
