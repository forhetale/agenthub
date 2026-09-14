/** Wire protocol for the /global-agent relay bridge (frontend and agent clients). */

export interface RelayHttpRequest {
  id?: string
  method?: string
  path?: string
  headers?: Record<string, string | string[] | undefined>
  body?: unknown
  bodyBase64?: string
  timeoutMs?: number
}

export interface RelayHttpResponse {
  id?: string
  status?: number
  headers?: Record<string, string>
  body?: string
  bodyBase64?: string
  truncated?: boolean
  error?: {
    code: string
    message: string
  }
}

export interface RelaySocketOpenRequest {
  id?: string
  namespace?: string
  auth?: Record<string, unknown>
  query?: Record<string, string | number | boolean | undefined>
  stream?: boolean
}

export interface RelaySocketEventRequest {
  id?: string
  event?: string
  payload?: unknown
  stream?: boolean
}

export interface RelaySocketCloseRequest {
  id?: string
}

export interface RelaySocketResponse {
  id?: string
  ok?: boolean
  namespace?: string
  event?: string
  stream?: boolean
  payload?: unknown
  error?: {
    code: string
    message: string
  }
}
