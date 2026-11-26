/** Accept only positive integer milliseconds that Node timers can represent. */
export function timeoutFromEnv(name: string, legacyName: string, fallback: number): number
export function timeoutFromEnv(name: string, legacyName: string, olderLegacyName: string, fallback: number): number
export function timeoutFromEnv(...args: Array<string | number>): number {
  const fallback = Number(args[args.length - 1])
  // An invalid Studio override must not hide a valid legacy deployment setting.
  for (const key of args.slice(0, -1)) {
    const value = Number(process.env[String(key)])
    // Overflowing Node timers fire almost immediately instead of waiting longer.
    if (Number.isInteger(value) && value > 0 && value <= 2_147_483_647) return value
  }
  return fallback
}
