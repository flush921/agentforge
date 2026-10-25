import type { Usage } from '../contracts/common'
import type { RunEvent, RunEventBody } from '../contracts/events'
import type { ComplexityAssessment, PlanNode } from '../contracts/plan'
import { buildStaticPlan, decideLevel, LEVELS } from '../orchestrator/level'
import { validPlans } from './plans'

type TimedEvent = RunEventBody & { t: number }

function withSequence(events: TimedEvent[]): RunEvent[] {
  return events.map((event, seq): RunEvent => ({ ...event, seq }))
}

function textSeries(
  nodeId: string,
  start: number,
  deltas: readonly string[],
  interval: number,
): TimedEvent[] {
  return deltas.map((delta, index): TimedEvent => ({
    type: 'node.text',
    nodeId,
    delta,
    t: start + index * interval,
  }))
}

const l0Assessment: ComplexityAssessment = {
  dims: { subtasks: 0, tools: 0, parallel: 0, rigor: 0, length: 0 },
  rationale: '简单寒暄，直接回答',
  source: 'rule',
}
const l0Plan = buildStaticPlan(0, [])
const l0Text = ['你好！', '很高兴', '见到你。']
const l0Output = l0Text.join('')
const l0Usage: Usage = { inputTokens: 12, outputTokens: 8 }

export const sampleRunL0 = withSequence([
  {
    type: 'run.started',
    runId: 'run_l0',
    assistantId: 'assistant_demo',
    task: '你好',
    intensity: 0.5,
    t: 0,
  },
  { type: 'assess.started', t: 20 },
  {
    type: 'assess.completed',
    assessment: l0Assessment,
    decision: decideLevel(l0Assessment.dims, 0.5, false),
    t: 60,
  },
  { type: 'plan.started', level: 0, t: 80 },
  { type: 'plan.completed', plan: l0Plan, source: 'static', budget: LEVELS[0].budget, t: 100 },
  { type: 'node.started', nodeId: 'answer', attempt: 1, t: 120 },
  ...textSeries('answer', 160, l0Text, 60),
  { type: 'node.completed', nodeId: 'answer', output: l0Output, usage: l0Usage, t: 320 },
  {
    type: 'run.completed',
    output: l0Output,
    degraded: false,
    usage: l0Usage,
    durationMs: 340,
    t: 340,
  },
])

const l4Assessment: ComplexityAssessment = {
  dims: { subtasks: 2, tools: 2, parallel: 2, rigor: 2, length: 2 },
  rationale: '任务需要多路调研、数据分析和严格审校',
  source: 'llm',
}
const l4Plan = validPlans[4]

const researcherAText = [
  '【现状资料】公开问卷显示，约 68% 的受访大学生使用过 AI 学习工具。\n',
  '主要用途依次为资料检索、错题讲解和论文提纲整理，使用频率因专业而异。\n',
  '数据来自示例问卷与公开报道，样本口径仍需在报告中明确说明。\n',
]
const researcherBText = [
  '【场景资料】访谈集中在课程预习、考前复习和写作修改三个场景。\n',
  '学生希望获得分步骤讲解，但也担心直接复制答案会削弱独立思考。\n',
  '反馈显示，低年级更关注概念解释，高年级更关注资料整合与表达优化。\n',
]
const analystText = [
  '【汇合分析】两路资料共同表明，AI 工具已具备较高渗透率。\n',
  '高频使用与学习效果之间并非简单正相关，关键在于是否配合主动复盘。\n',
  '主要问题是数据口径不统一、隐私顾虑和过度依赖，建议按风险分层治理。\n',
]
const writerText = [
  '# 大学生使用 AI 学习工具分析报告（初稿）\n',
  '现状：约 68% 的示例受访学生使用过相关工具，检索与讲解最常见。\n',
  '问题：部分学生存在依赖倾向，教师对作业真实性和数据安全也有担忧。\n',
  '建议：学校提供使用规范，学生保留思考过程，教师增加过程性评价。\n',
]
const reviewerText = [
  '已核查报告的结构、数据表达和建议部分。\n',
  '发现样本来源说明仍不充分，且建议没有区分实施优先级。',
]
const writerR1Text = [
  '# 大学生使用 AI 学习工具分析报告（修订稿）\n',
  '## 摘要\nAI 学习工具已广泛用于检索、讲解和写作辅助，但实际收益取决于使用方式。\n',
  '## 数据与口径\n示例问卷中约 68% 的受访学生使用过工具；该比例仅说明本次样本，不外推至全部大学生。\n',
  '## 关键发现\n主动提问、核对来源和复盘错题的学生更容易受益，直接复制答案则增加依赖风险。\n',
  '## 分层建议\n优先由学校发布隐私与引用指引，其次由教师增加过程性评价，长期建设高质量校内资源。\n',
  '## 使用指引\n学生应先独立作答，再用 AI 对照讲解；引用生成内容前必须核对原始来源。\n',
  '## 教师与学校行动\n教师可要求提交提问记录和修改说明，学校则应提供合规工具与数据保护培训。\n',
  '## 评估与持续改进\n通过匿名反馈和学习成果对比定期评估工具效果，避免只以使用频率判断价值。\n',
  '## 结论\n把 AI 作为学习过程的辅助而非答案替代品，才能同时提升效率与独立思考能力。\n',
]
const reviewerR1Text = [
  '已复核修订稿的数据口径、来源限制和建议优先级。\n',
  '两项审校意见均已落实，内容逻辑完整，同意通过。',
]

const writerR1: PlanNode = {
  id: 'writer_r1',
  role: 'writer',
  title: '报告写作',
  instruction: '撰写包含现状、数据、问题和建议的完整分析报告',
  dependsOn: ['writer'],
  tools: [],
}
const reviewerR1: PlanNode = {
  id: 'reviewer_r1',
  role: 'reviewer',
  title: '质量审校',
  instruction: '检查报告的数据依据、逻辑和可执行建议，给出审校结论',
  dependsOn: ['writer_r1'],
  tools: [],
  reviewTarget: 'writer_r1',
}

const researcherAUsage: Usage = { inputTokens: 1800, outputTokens: 500 }
const researcherBUsage: Usage = { inputTokens: 1400, outputTokens: 420 }
const analystUsage: Usage = { inputTokens: 2200, outputTokens: 700 }
const writerUsage: Usage = { inputTokens: 3000, outputTokens: 1100 }
const reviewerUsage: Usage = { inputTokens: 1800, outputTokens: 180 }
const writerR1Usage: Usage = { inputTokens: 2600, outputTokens: 1300 }
const reviewerR1Usage: Usage = { inputTokens: 1700, outputTokens: 120 }
const totalUsage: Usage = { inputTokens: 14500, outputTokens: 4320 }

export const sampleRunL4 = withSequence([
  {
    type: 'run.started',
    runId: 'run_l4',
    assistantId: 'assistant_research',
    task: '调研大学生使用 AI 学习工具的现状，写一份带数据和建议的分析报告',
    intensity: 0.8,
    t: 0,
  },
  { type: 'assess.started', t: 100 },
  {
    type: 'assess.completed',
    assessment: l4Assessment,
    decision: decideLevel(l4Assessment.dims, 0.8, true),
    t: 1200,
  },
  { type: 'plan.started', level: 4, t: 1300 },
  { type: 'plan.completed', plan: l4Plan, source: 'planner', budget: LEVELS[4].budget, t: 2200 },
  { type: 'node.started', nodeId: 'research_a', attempt: 1, t: 2300 },
  { type: 'node.reasoning', nodeId: 'research_a', delta: '先查找带样本说明的公开调查。', t: 2400 },
  { type: 'node.started', nodeId: 'research_b', attempt: 1, t: 2500 },
  {
    type: 'node.reasoning',
    nodeId: 'research_b',
    delta: '第一次尝试先按学习场景整理访谈。',
    t: 2600,
  },
  {
    type: 'node.text',
    nodeId: 'research_b',
    delta: '第一次尝试的不完整内容，将在重试时清除。',
    t: 2700,
  },
  {
    type: 'node.tool_call',
    nodeId: 'research_a',
    callId: 'search_usage_1',
    tool: 'web_search',
    input: { query: '大学生 AI 学习工具 使用现状 问卷 样本' },
    t: 3000,
  },
  {
    type: 'node.tool_result',
    nodeId: 'research_a',
    callId: 'search_usage_1',
    ok: true,
    summary: '找到 3 份含样本说明的调查资料',
    t: 3800,
  },
  {
    type: 'node.reasoning',
    nodeId: 'research_a',
    delta: '优先采用说明样本范围的调查结果。',
    t: 3900,
  },
  ...textSeries('research_a', 4000, researcherAText, 400),
  {
    type: 'node.completed',
    nodeId: 'research_a',
    output: researcherAText.join(''),
    usage: researcherAUsage,
    t: 5000,
  },
  { type: 'node.started', nodeId: 'research_b', attempt: 2, t: 7100 },
  {
    type: 'node.reasoning',
    nodeId: 'research_b',
    delta: '重试后缩小到课程、复习和写作三个场景。',
    t: 7200,
  },
  { type: 'node.reasoning', nodeId: 'research_b', delta: '按年级差异补充用户反馈。', t: 7400 },
  ...textSeries('research_b', 7600, researcherBText, 400),
  {
    type: 'node.completed',
    nodeId: 'research_b',
    output: researcherBText.join(''),
    usage: researcherBUsage,
    t: 9000,
  },
  { type: 'node.started', nodeId: 'analyst', attempt: 1, t: 9200 },
  { type: 'node.reasoning', nodeId: 'analyst', delta: '先对齐两路资料的数据口径。', t: 9300 },
  { type: 'node.reasoning', nodeId: 'analyst', delta: '再区分相关性与因果关系。', t: 9500 },
  ...textSeries('analyst', 9700, analystText, 500),
  {
    type: 'node.completed',
    nodeId: 'analyst',
    output: analystText.join(''),
    usage: analystUsage,
    t: 12000,
  },
  { type: 'node.started', nodeId: 'writer', attempt: 1, t: 12200 },
  { type: 'node.reasoning', nodeId: 'writer', delta: '按现状、问题、建议组织初稿。', t: 12300 },
  { type: 'node.reasoning', nodeId: 'writer', delta: '保留数据限制，避免过度推断。', t: 12500 },
  ...textSeries('writer', 12800, writerText, 600),
  {
    type: 'node.completed',
    nodeId: 'writer',
    output: writerText.join(''),
    usage: writerUsage,
    t: 17000,
  },
  { type: 'node.started', nodeId: 'reviewer', attempt: 1, t: 18200 },
  {
    type: 'node.reasoning',
    nodeId: 'reviewer',
    delta: '重点检查数据口径与建议是否可执行。',
    t: 18300,
  },
  ...textSeries('reviewer', 18500, reviewerText, 400),
  {
    type: 'node.review',
    nodeId: 'reviewer',
    verdict: 'revise',
    issues: [
      '补充调查样本来源和适用范围，避免把样本比例外推到全体学生。',
      '按优先级和可执行性重写建议，明确学校、教师和学生的行动。',
    ],
    t: 19500,
  },
  {
    type: 'node.completed',
    nodeId: 'reviewer',
    output: reviewerText.join(''),
    usage: reviewerUsage,
    t: 19800,
  },
  { type: 'node.added', node: writerR1, reason: 'revision', revisionOf: 'writer', t: 20000 },
  { type: 'node.added', node: reviewerR1, reason: 'revision', t: 20100 },
  { type: 'node.started', nodeId: 'writer_r1', attempt: 1, t: 20200 },
  {
    type: 'node.reasoning',
    nodeId: 'writer_r1',
    delta: '先修正样本口径，再重排建议优先级。',
    t: 20300,
  },
  { type: 'node.reasoning', nodeId: 'writer_r1', delta: '新增摘要和分层行动方案。', t: 20500 },
  ...textSeries('writer_r1', 22000, writerR1Text, 1500),
  {
    type: 'node.completed',
    nodeId: 'writer_r1',
    output: writerR1Text.join(''),
    usage: writerR1Usage,
    t: 36000,
  },
  { type: 'node.started', nodeId: 'reviewer_r1', attempt: 1, t: 36200 },
  { type: 'node.reasoning', nodeId: 'reviewer_r1', delta: '逐条对照上一轮审校意见。', t: 36400 },
  ...textSeries('reviewer_r1', 36600, reviewerR1Text, 400),
  { type: 'node.review', nodeId: 'reviewer_r1', verdict: 'pass', issues: [], t: 38000 },
  {
    type: 'node.completed',
    nodeId: 'reviewer_r1',
    output: reviewerR1Text.join(''),
    usage: reviewerR1Usage,
    t: 38300,
  },
  {
    type: 'run.completed',
    output: writerR1Text.join(''),
    degraded: false,
    usage: totalUsage,
    durationMs: 40000,
    t: 40000,
  },
])
