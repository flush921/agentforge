/**
 * 把文本写入剪贴板，成功返回 true。
 * 在线演示走的是 HTTP，浏览器在非安全来源下不提供 navigator.clipboard，
 * 所以要退回到「临时文本框 + execCommand('copy')」的老办法。
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 权限被拒绝等情况，继续尝试下面的办法。
  }

  if (typeof document === 'undefined') {
    return false
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  try {
    area.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
