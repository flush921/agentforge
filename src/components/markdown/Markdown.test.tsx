import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Markdown } from './Markdown'

describe('Markdown', () => {
  it('HTML 作为文本转义，不渲染 script 标签', () => {
    const html = renderToStaticMarkup(<Markdown>{'<script>alert(1)</script>'}</Markdown>)

    expect(html).not.toContain('<script')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('危险 javascript URL 不会成为链接地址', () => {
    const html = renderToStaticMarkup(<Markdown>{'[x](javascript:alert(1))'}</Markdown>)

    expect(html).not.toContain('javascript:')
  })

  it('GFM 表格渲染为 table', () => {
    const html = renderToStaticMarkup(
      <Markdown>{'| 指标 | 数值 |\n| --- | --- |\n| 完成率 | 80% |'}</Markdown>,
    )

    expect(html).toContain('<table>')
    expect(html).toContain('<td>完成率</td>')
  })

  it('外链在新窗口打开并带安全 rel', () => {
    const html = renderToStaticMarkup(<Markdown>{'[示例](https://example.com)'}</Markdown>)

    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
