import 'server-only'

export type ServiceResult<T> = { ok: true; value: T } | { ok: false; error: unknown }
