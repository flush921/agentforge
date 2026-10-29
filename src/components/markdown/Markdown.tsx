'use client'

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkCjkFriendly from 'remark-cjk-friendly'
import remarkGfm from 'remark-gfm'

// CommonMark 的强调规则按西文标点设计：`**“适量”**才是`、`**结论：**多吃` 这类中文写法
// 会被判成不能闭合，原样显示星号。remark-cjk-friendly 放宽了中日韩文字旁的判定。
const remarkPlugins = [remarkGfm, remarkCjkFriendly]

const components: Components = {
  a(props) {
    const anchorProps = { ...props }
    delete anchorProps.node
    return <a {...anchorProps} target="_blank" rel="noopener noreferrer" />
  },
}

export function Markdown({ children }: { children: string }) {
  return (
    <div className="markdown">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  )
}
