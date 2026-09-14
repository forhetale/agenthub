declare const __APP_VERSION__: string

export function isTatinBuild(): boolean {
  return typeof __APP_VERSION__ !== 'undefined' && __APP_VERSION__.includes('-tatin.')
}
