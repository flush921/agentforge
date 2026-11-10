/**
 * 新手教程的步骤定义。这里只有数据和纯函数，界面在 components/tour/TourOverlay。
 * 预指导反馈：第一次进来的人不知道该点哪里，所以一步步高亮要点的地方，带着走一遍。
 */

export type TourStepId =
  | 'welcome'
  | 'generate'
  | 'pick-agent'
  | 'simple'
  | 'canvas'
  | 'node'
  | 'controls'
  | 'complex'
  | 'demo'
  | 'finish'

export type TourPage = 'home' | 'workspace' | 'demo'

export interface TourStep {
  id: TourStepId
  /** 这一步在哪个页面上进行；用户走到别的页面时，提示他回来。 */
  page: TourPage
  /** 为 true 时在任何页面都能显示（只有开场的欢迎卡片）。 */
  anyPage?: boolean
  title: string
  body: string
  /** 任务正在运行时改用这段说明。 */
  whileRunning?: string
  /** 要高亮的元素（CSS 选择器），取第一个当前可见的；空数组表示在屏幕中央显示卡片。 */
  targets: string[]
  /** 进入这一步时把高亮元素滚进视口：center 滚到屏幕中间，nearest 只滚到刚好露出。 */
  scroll?: 'center' | 'nearest'
  /** 需要用户亲手操作才能继续时的提示语。 */
  action?: string
  /** 「下一步」按钮的文字；不写表示这一步只能靠操作推进。 */
  nextLabel?: string
  /** 操作类步骤是否允许跳过。 */
  skippable?: boolean
}

/** 教程里打开的示例 Agent，也是演示回放页「返回工作台」去的地方。 */
export const TOUR_ASSISTANT_ID = 'preset-kaoyan'

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: 'welcome',
    page: 'home',
    anyPage: true,
    title: '欢迎使用 AgentForge',
    body: 'AgentForge 是一个「生成 Agent 的 Agent」：一句话生成专属 Agent，它会按任务难度调度 1 到 N 个子 Agent，并把过程画出来。\n花 1 分钟，带你走一遍。',
    targets: [],
    nextLabel: '开始教程',
  },
  {
    id: 'generate',
    page: 'home',
    title: '一句话生成 Agent',
    body: '在这里描述你想要的 Agent，比如「帮我做一个健身计划教练」，几秒后就能得到一个带身份、工具和安全护栏的专属 Agent。\n教程里先用现成的示例 Agent。',
    targets: ['[data-tour="generate"]'],
    scroll: 'center',
    nextLabel: '下一步',
  },
  {
    id: 'pick-agent',
    page: 'home',
    title: '打开一个示例 Agent',
    body: '点击「考研择校顾问」，进入它的工作台。',
    targets: [`[data-assistant-id="${TOUR_ASSISTANT_ID}"]`],
    scroll: 'center',
    action: '点击高亮的卡片',
  },
  {
    id: 'simple',
    page: 'workspace',
    title: '先问一个简单问题',
    body: '点这条标着「简单」的问题，它会直接开始运行（真实调用模型，大约 7 秒）。',
    whileRunning: '已经开始运行。画布上会实时画出这次任务的编排，稍等几秒。',
    targets: ['[data-tour="starter-simple"]', '[data-tour="canvas"]'],
    action: '点击高亮的问题',
    skippable: true,
  },
  {
    id: 'canvas',
    page: 'workspace',
    title: '编排过程画在这里',
    body: '画布上实时画出了这次任务的编排：简单问题只派 1 个子 Agent，任务越难，派出的越多。\n顶栏的「得分」说明了为什么这样派：模型只负责打分，派几个由规则决定。',
    // 手机上跑完会切回「对话」页，画布不在屏幕上，这时改为高亮「编排」标签。
    targets: ['[data-tour="canvas"]', '[aria-controls="workspace-canvas"]'],
    nextLabel: '下一步',
  },
  {
    id: 'node',
    page: 'workspace',
    title: '每个节点都能点开',
    body: '点击画布上的节点，可以看到它收到的指令、思考过程和完整产出。\n看完后关闭详情（点右上角的 × 或按 Esc），教程会继续。',
    targets: ['.react-flow__node button.canvas-agent-card', '[aria-controls="workspace-canvas"]'],
    action: '点击高亮的节点',
    skippable: true,
  },
  {
    id: 'controls',
    page: 'workspace',
    title: '三个开关',
    body: '· 快省 ↔ 深准：调节投入多少子 Agent\n· Ultra：每个环节派 3 到 5 个子 Agent 同时做，再择优\n· 执行前确认：先看编排计划，确认后才执行',
    targets: ['[data-tour="composer-controls"]'],
    nextLabel: '下一步',
  },
  {
    id: 'complex',
    page: 'workspace',
    title: '复杂任务会派出一个团队',
    body: '标着「复杂」的任务会让多个子 Agent 并行调研，再由审校把关，真实运行要 2 到 3 分钟。\n教程里先播放一段演示回放，大约 20 秒看完整个过程。',
    targets: ['[data-tour="starter-complex"]'],
    scroll: 'nearest',
    nextLabel: '播放演示回放',
  },
  {
    id: 'demo',
    page: 'demo',
    title: '这是演示回放',
    body: '画面是回放，不是实时运行。\n留意画布：两个调研节点同时运行，汇合后写成报告；审校不通过时，画布上会当场长出「修订」和「复核」节点。',
    targets: ['[data-tour="demo-canvas"]'],
    nextLabel: '下一步',
  },
  {
    id: 'finish',
    page: 'demo',
    title: '教程结束',
    body: '接下来可以：\n· 回到工作台，点「复杂」示例亲自跑一次\n· 打开 Ultra，看二十路子 Agent 并行\n· 回首页，用一句话生成你自己的 Agent\n右上角的「新手教程」可以随时重看。',
    targets: [],
  },
]

export function isTourStepId(value: unknown): value is TourStepId {
  return TOUR_STEPS.some((step) => step.id === value)
}

export function getTourStep(id: TourStepId): TourStep {
  const step = TOUR_STEPS.find((item) => item.id === id)
  if (step === undefined) {
    throw new Error(`未知的教程步骤：${id}`)
  }
  return step
}

/** 下一步的 id；已经是最后一步时返回 null。 */
export function nextTourStep(id: TourStepId): TourStepId | null {
  const index = TOUR_STEPS.findIndex((step) => step.id === id)
  return TOUR_STEPS[index + 1]?.id ?? null
}

/** 当前路径属于教程里的哪个页面；历史回放等其他页面返回 'other'。 */
export function tourPageOf(pathname: string): TourPage | 'other' {
  if (pathname === '/') return 'home'
  if (pathname === '/demo') return 'demo'
  if (/^\/a\/[^/]+\/?$/.test(pathname)) return 'workspace'
  return 'other'
}

/** 用户走到别的页面时，「回到教程」要去的地址。 */
export function tourPageHref(page: TourPage): string {
  if (page === 'home') return '/'
  if (page === 'demo') return '/demo'
  return `/a/${TOUR_ASSISTANT_ID}`
}

/**
 * 用户自己翻到了后面步骤所在的页面时，教程跟着跳到那一步：
 * 在首页的几步里打开了某个 Agent，就从「先问一个简单问题」继续；
 * 在「复杂任务」这一步进了演示回放页，就进入回放说明。
 */
export function stepAfterNavigation(id: TourStepId, page: TourPage | 'other'): TourStepId | null {
  const step = getTourStep(id)
  if (step.page === 'home' && step.anyPage !== true && page === 'workspace') return 'simple'
  if (id === 'complex' && page === 'demo') return 'demo'
  return null
}

/** 看完欢迎卡片后从哪一步开始：已经在工作台里就直接从提问开始。 */
export function stepAfterWelcome(page: TourPage | 'other'): TourStepId {
  return page === 'workspace' ? 'simple' : 'generate'
}
