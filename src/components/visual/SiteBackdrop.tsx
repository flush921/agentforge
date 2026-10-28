'use client'

import { usePathname } from 'next/navigation'
import { DotField } from './DotField'
import { HudField } from './HudField'
import { NebulaField } from './NebulaField'
import { Spotlight } from './Spotlight'
import { StellarField } from './StellarField'
import { ThemeSwitcher } from './ThemeSwitcher'
import { useTheme } from './use-theme'

/** 全站背景：按风格切换渐变层与交互背景（极光点阵 / 指挥舱网格 / 星云粒子 / 星辰变换）。 */
export function SiteBackdrop() {
  const theme = useTheme()
  const ambient = usePathname() === '/'
  return (
    <>
      <div aria-hidden className="site-aurora pointer-events-none fixed inset-0 -z-20" />
      {theme === 'hud' ? (
        <HudField key="hud" />
      ) : theme === 'stellar' ? (
        <StellarField key="stellar" formation={ambient} />
      ) : theme === 'nebula' ? (
        <NebulaField key="nebula" />
      ) : (
        <DotField key="aurora" ambient={ambient} />
      )}
      <Spotlight />
      <ThemeSwitcher />
    </>
  )
}
