import { describe, expect, it } from 'vitest'
import { apiErrorBodySchema } from '@/lib/contracts/api'
import { checkAccess } from './access'

const ACCESS_CODE = 'unit-test-access-code'
const PATH = '/api/orchestrate/assess'

function requestWithAccessCode(code: string | null): Request {
  const headers = new Headers()
  if (code !== null) {
    headers.set('x-access-code', code)
  }
  return new Request(`http://localhost${PATH}`, { method: 'POST', headers })
}

describe('checkAccess', () => {
  it('未配置 ACCESS_CODE 时放行', () => {
    expect(checkAccess(requestWithAccessCode(null), { ACCESS_CODE: undefined })).toBeNull()
    expect(checkAccess(requestWithAccessCode('any-value'), { ACCESS_CODE: undefined })).toBeNull()
  })

  it('配置后缺少请求头返回 401，且不泄露访问码与请求信息', async () => {
    const response = checkAccess(requestWithAccessCode(null), { ACCESS_CODE })
    expect(response).not.toBeNull()
    expect(response!.status).toBe(401)

    const body = apiErrorBodySchema.parse(await response!.json())
    expect(body.error.code).toBe('unauthorized')
    expect(JSON.stringify(body)).not.toContain(ACCESS_CODE)
  })

  it('配置后访问码错误返回 401', async () => {
    const response = checkAccess(requestWithAccessCode('wrong-code'), { ACCESS_CODE })
    expect(response).not.toBeNull()
    expect(response!.status).toBe(401)
    expect(apiErrorBodySchema.parse(await response!.json()).error.code).toBe('unauthorized')
  })

  it('访问码正确时放行', () => {
    expect(checkAccess(requestWithAccessCode(ACCESS_CODE), { ACCESS_CODE })).toBeNull()
  })

  it('长度不同的访问码也能安全比较，不会抛错', () => {
    expect(checkAccess(requestWithAccessCode('a'), { ACCESS_CODE })).not.toBeNull()
    expect(checkAccess(requestWithAccessCode('x'.repeat(200)), { ACCESS_CODE })).not.toBeNull()
    expect(
      checkAccess(requestWithAccessCode(`${ACCESS_CODE}-suffix`), { ACCESS_CODE }),
    ).not.toBeNull()
    expect(checkAccess(requestWithAccessCode(ACCESS_CODE), { ACCESS_CODE })).toBeNull()
  })
})
