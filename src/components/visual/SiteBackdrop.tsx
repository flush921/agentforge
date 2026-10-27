'use client'

import { usePathname } from 'next/navigation'
import { DotField } from './DotField'
import { Spotlight } from './Spotlight'

/** 全站背景：极光渐变 + 交互点阵。首页额外打开流动光带。 */
export function SiteBackdrop() {
  const ambient = usePathname() === '/'
  return (
    <>
      <div aria-hidden className="site-aurora pointer-events-none fixed inset-0 -z-20" />
      <DotField ambient={ambient} />
      <Spotlight />
    </>
  )
}
