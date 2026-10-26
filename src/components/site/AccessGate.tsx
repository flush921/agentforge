'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  ACCESS_REQUIRED_EVENT,
  clearAccessCode,
  getAccessCode,
  setAccessCode,
} from '@/lib/client/access'
import { healthResponseSchema } from '@/lib/contracts/api'
import { PRESET_ASSISTANTS } from '@/lib/fixtures/preset-assistants'

export function AccessGate() {
  const [open, setOpen] = useState(false)
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let active = true

    async function loadHealth() {
      try {
        const response = await fetch('/api/health', {
          cache: 'no-store',
          signal: controller.signal,
        })
        const health = healthResponseSchema.parse(await response.json())
        if (active && health.accessRequired && getAccessCode() === undefined) {
          setOpen(true)
        }
      } catch {
        return
      }
    }

    function requireAccess() {
      setCode('')
      setError('')
      setPending(false)
      setOpen(true)
    }

    window.addEventListener(ACCESS_REQUIRED_EVENT, requireAccess)
    void loadHealth()
    return () => {
      active = false
      controller.abort()
      window.removeEventListener(ACCESS_REQUIRED_EVENT, requireAccess)
    }
  }, [])

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending || code.length === 0) return
    setPending(true)
    setError('')
    setAccessCode(code)

    try {
      const response = await fetch('/api/orchestrate/assess', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-access-code': code },
        body: JSON.stringify({ assistant: PRESET_ASSISTANTS[0]!, task: '你好' }),
      })
      if (response.status === 401) {
        clearAccessCode()
        setError('访问码不正确')
        setOpen(true)
        return
      }
      setCode('')
      setOpen(false)
    } catch {
      setError('网络连接失败，请重试')
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen) setOpen(true)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>输入访问码</DialogTitle>
          <DialogDescription>这是一个在线演示，访问码由作品提交材料提供</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={verify}>
          <div className="space-y-2">
            <label htmlFor="access-code" className="text-sm font-medium text-text-primary">
              访问码
            </label>
            <input
              id="access-code"
              type="password"
              autoComplete="off"
              required
              disabled={pending}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              aria-invalid={error.length > 0}
              aria-describedby={error.length > 0 ? 'access-code-error' : undefined}
              className="h-10 w-full rounded-lg border border-input bg-input/30 px-3 text-sm text-text-primary outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
            />
            {error.length > 0 ? (
              <p id="access-code-error" role="alert" className="text-sm text-danger">
                {error}
              </p>
            ) : null}
          </div>
          <Button type="submit" className="h-10 w-full" disabled={pending || code.length === 0}>
            {pending ? '验证中…' : '进入'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
