'use client'

import { ReplayPlayer } from '@/components/run/ReplayPlayer'
import { TourButton } from '@/components/tour/TourButton'
import { DEMO_RUN, DEMO_SPEED } from '@/lib/tour/demo-run'
import { TOUR_ASSISTANT_ID } from '@/lib/tour/steps'

const NOTE_TAIL = '不是实时生成的结果，也不消耗 token。想看真实运行，请回到工作台点一条示例。'

export function DemoClient() {
  return (
    <ReplayPlayer
      events={DEMO_RUN.events}
      task={DEMO_RUN.task}
      title="复杂任务 · 演示回放"
      backHref={`/a/${TOUR_ASSISTANT_ID}`}
      backLabel="返回工作台"
      initialSpeed={DEMO_SPEED}
      demoNote={
        DEMO_RUN.recorded
          ? `这是预先录制的一次真实运行，按 ${DEMO_SPEED} 倍速回放，${NOTE_TAIL}`
          : `这是一段示例数据，用来演示复杂任务的编排过程，${NOTE_TAIL}`
      }
      headerExtra={<TourButton />}
    />
  )
}
