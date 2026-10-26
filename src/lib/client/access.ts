const STORAGE_KEY = 'agentforge.accessCode'
export const ACCESS_REQUIRED_EVENT = 'agentforge:access-required'

let memoryCode: string | undefined

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.sessionStorage
  } catch {
    return null
  }
}

export function getAccessCode(): string | undefined {
  const storage = getSessionStorage()
  if (storage !== null) {
    try {
      return storage.getItem(STORAGE_KEY) ?? undefined
    } catch {}
  }
  return memoryCode
}

export function setAccessCode(code: string): void {
  memoryCode = code
  try {
    getSessionStorage()?.setItem(STORAGE_KEY, code)
  } catch {}
}

export function clearAccessCode(): void {
  memoryCode = undefined
  try {
    getSessionStorage()?.removeItem(STORAGE_KEY)
  } catch {}
}

export function reportAccessRequired(): void {
  clearAccessCode()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(ACCESS_REQUIRED_EVENT))
  }
}
