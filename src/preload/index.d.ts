import type { AmazeApi } from '../core/api'

declare global {
  interface Window {
    amaze?: AmazeApi
  }
}
