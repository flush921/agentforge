# AgentForge

> 生成 Agent 的 Agent：一句话生成专属 Agent，再按任务难度调度 1 到 N 个子 Agent 协作。

在线演示：<http://43.108.80.187>（访问码见作品提交材料）。

## 项目介绍

AgentForge 参加赛道方向 1「AI Agent 智能助手」。用户用一句话描述需求，系统生成一个具有角色、能力、开场问题与安全边界的专属 Agent；专属 Agent 接到任务后，根据复杂度和用户选择的强度，调度 1 到 N 个子 Agent，并把规划、执行、工具调用、审校与返工过程实时画出来。

可以用它生成教育、健康、数据分析、编程等不同领域的 Agent。项目同时提供确定性的 mock 模式，无需模型密钥即可开发、测试和演示完整流程。

### 核心特性

- **一句话生成专属 Agent**：生成角色设定、场景标签、能力、拒答主题和任务示例，可预览后保存到 Agent 库。
- **L0～L4 自适应编排**：从单个子 Agent 直答、工具调用，到串行、并行和带审校的复杂协作，按任务需要选择级别。
- **实时编排画布与镜头跟随**：节点状态、流式摘要、依赖边和指标同步更新；运行时跟随当前节点，结束后切换全览，手动操作后停止自动跟随。
- **审校返工回路**：L4 审校不通过时生成返工节点，保留意见、版本和再次审校的完整链路。
- **执行前确认**：先展示完整待执行计划，用户确认后才启动节点执行；也可关闭确认直接运行。
- **安全护栏**：确定性危机识别、违规内容拦截、专属 Agent 拒答话题与专业免责声明。
- **计算器与日期工具**：模型通过工具调用完成安全计算和日期处理；尚未开放的能力会明确标为「即将支持」。
- **运行回放**：运行过程记录为事件流并保存在浏览器 IndexedDB 中，可查看历史、暂停和拖动回放，不重复消耗模型额度。
- **访问码与限流**：四个模型相关 POST 接口独立校验访问码，并限制生成和运行接口的请求频率。
- **四种可切换的视觉风格**：极光、指挥舱、星云、星辰（默认）。右下角的切换器会记住选择，也可以用 `?theme=aurora|hud|nebula|stellar` 直接指定。星辰风格的首页由 Canvas 绘制：星点连续汇聚成倾斜旋转的银河，再直接变换成队名「Ad Astra」和一次编排的星座；向下滚动时银河倾斜、塌成星云、散成满天星，往回滚可逆；光标划过会沿轨迹拖出一根短尖刺，随后慢慢回落。所有动效遵守系统的「减少动效」设置。

## 技术架构

```text
┌──────────────────────────── 浏览器 ────────────────────────────┐
│ 首页 / Agent 库 / 工作台 / 历史回放                           │
│ Zustand 运行状态  ←  RunEvent reducer  ←  浏览器编排器         │
│                              │  路由 → 计划 → 调度 → 取消       │
│ React Flow 画布 + 对话面板     │                                │
│ IndexedDB：Agent 与运行事件    │                                │
└──────────────────────────────┼────────────────────────────────┘
                               │ JSON / NDJSON 流
┌──────────────────────────────▼──── Next.js 服务端（无状态）────┐
│ POST /api/assistant/generate   一句话生成专属 Agent 草稿        │
│ POST /api/orchestrate/assess   复杂度评分与安全判断             │
│ POST /api/orchestrate/plan     生成、校验并修复执行计划         │
│ POST /api/agent/step           执行单个子 Agent，流式返回事件   │
│ GET  /api/health               健康检查                         │
└──────────────────────────────┼────────────────────────────────┘
                               │
┌──────────────────────────────▼────────── LLM 接入层 ───────────┐
│ AI SDK 7 / OpenAI 兼容流式接口  │  确定性 mock                  │
│ Zod 输出校验、重试与诊断        │  calculator / datetime 工具   │
└────────────────────────────────────────────────────────────────┘
```

**为什么把编排放到浏览器？** 项目以前端 Web 应用为主要形态，浏览器编排可以直接驱动画布、取消、执行前确认和事件回放；服务端只处理短请求，不保存会话或运行状态，模型凭据仍只留在服务端。每次状态变化都先归结为事件，界面再由事件推导，因此实时运行和历史回放使用同一条数据链路。

### 技术栈

| 层次       | 选型                                                     |
| :--------- | :------------------------------------------------------- |
| 应用框架   | Next.js 16.4.3 App Router、React 19.3.1                  |
| 语言与校验 | TypeScript 6.0.3 strict、Zod 4.6.7                       |
| AI 接入    | AI SDK 7.0.153、`@ai-sdk/openai-compatible` 3.0.78       |
| 编排画布   | `@xyflow/react` 12.12.0、`@dagrejs/dagre` 3.1.3          |
| 状态与存储 | Zustand 5.0.16、IndexedDB（idb 8.0.4）                   |
| UI 与动效  | Tailwind CSS 4.3.3、shadcn/ui、Motion 14.6.0             |
| Markdown   | react-markdown 10.1.0、remark-gfm 4.0.1，不启用原始 HTML |
| 测试与质量 | Vitest 5.0.5、ESLint 9、Prettier 3、TypeScript 类型检查  |
| 部署       | Next standalone、Node.js 22 LTS、本地构建后发布          |

### 编排级别

| 级别 | 协作方式                                    |
| :--- | :------------------------------------------ |
| L0   | 单个子 Agent 直答，不为简单任务建立复杂团队 |
| L1   | 单个子 Agent，可按能力使用工具              |
| L2   | 2～3 个子 Agent 串行分工                    |
| L3   | 并行分析后汇合，适合可拆分的任务            |
| L4   | 更完整的计划，带审校闸门和最多两轮返工      |

模型负责结构化评分与计划，确定性代码负责级别决策、计划校验、依赖调度、预算和取消。需要工具且评分过低的任务会至少升到 L1，避免静态直答计划丢失必要工具。

## 评测结果

最终证据来自配置冻结后仅运行一次的 **holdout2-final**：提示词 v1.3、定级规则 v1.9，30 道路由题各运行 2 轮，另有 8 条护栏用例。开发集、holdout-1 和离线复算曾参与调参，不作为最终改进证据。

| 指标                 |                                                 结果 |
| :------------------- | ---------------------------------------------------: |
| 路由准确率           |                                   **86.7%**（60 轮） |
| 低估 / 高估          |                                     **10.0% / 3.3%** |
| 平均绝对级别误差 MAE |                                             **0.22** |
| 两轮定级一致率       |                                            **73.3%** |
| 安全护栏             | **8/8 正确**，4 条应拦截全部命中，4 条正常问题无误拦 |
| 成本估算             |        相比一律 L4，节省 **63.3% token、57.2% 耗时** |

成本比例使用 T11、T13、T15 的 18 条真实 completed 运行记录，按历史均值估算；不是为本轮重新执行三种策略得到的对照实验。完整数据保存在工作区 `collab/reports/eval/T16/holdout2-final/`，汇总见 `collab/reports/eval/T16/final.md`。

**局限**：每个留出集只有 30 道路由题；只测试了一个模型；标签由开发者标注；成本样本量较小。两轮一致率也说明模型评分仍有波动，这些结果不能代表所有任务和模型上的表现。

### 复现评测

评测会真实调用模型并消耗额度，必须显式使用 live 模式；请为每次开发评测设置新的标签，不要覆盖已有证据，也不要重跑冻结的最终留出集。

```bash
LLM_MODE=live EVAL_SET=dev EVAL_TAG=my-route-eval EVAL_GUARD=1 npm run eval:route
```

核心命令是 `npm run eval:route`。`EVAL_SET` 可选 `dev`、`holdout`、`holdout2`；`EVAL_GUARD=1` 时加入 8 条护栏用例。任务串行执行，结果写入 `../collab/reports/eval/` 下对应任务与标签的目录。

## 安装运行指南

### 1. 准备环境

- Node.js **22 或更高版本**
- npm（依赖版本已锁定在 `package-lock.json`）

```bash
npm install
cp .env.example .env.local
```

Windows 资源管理器中也可以直接复制 `.env.example` 并重命名为 `.env.local`。该文件已被 Git 忽略，不要提交真实凭据。

### 2. mock 模式（默认）

`.env.local` 保持 `LLM_MODE=mock` 即可，**不需要任何 Key**：

```bash
npm run dev
```

打开 <http://localhost:3000>。mock 模式可完整体验生成、编排、工具、审校、历史和回放。

### 3. live 模式

在 `.env.local` 中设置：

```dotenv
LLM_MODE=live
LLM_BASE_URL=https://your-openai-compatible-endpoint.example/v1
LLM_API_KEY=你的密钥
LLM_MODEL=你的模型名
```

接口需兼容 OpenAI Chat Completions 流式调用。真实地址和密钥只放在本地环境文件或部署环境文件中，不要写入源码、报告或截图。

### 4. 质量检查与生产构建

```bash
npm run check
npm run build
npm run start
```

`npm run check` 依次执行 ESLint、TypeScript、全部单元/集成测试和 Prettier 检查，不执行真实模型评测。

## 环境配置说明

应用与部署变量如下；`.env.example` 提供了对应模板。没有特殊需求时，本地 mock 开发只需保留默认值。

| 变量           | 含义                             | 必填条件                          | 默认值                        |
| :------------- | :------------------------------- | :-------------------------------- | :---------------------------- |
| `LLM_MODE`     | 模型接入模式：`mock` 或 `live`   | 否                                | `mock`                        |
| `LLM_BASE_URL` | OpenAI 兼容接口基础地址          | `LLM_MODE=live` 时必填            | 无                            |
| `LLM_API_KEY`  | 模型接口密钥                     | live 时必填且不能为空白           | 无                            |
| `LLM_MODEL`    | 模型名称                         | 否                                | `deepseek-flash`              |
| `ACCESS_CODE`  | 演示访问码；空字符串等价于未设置 | 公网演示建议设置                  | 空，不启用校验                |
| `NODE_ENV`     | Node/Next 运行环境               | 生产 standalone 设为 `production` | 由 Next 命令设置              |
| `PORT`         | HTTP 监听端口                    | 否                                | `3000`                        |
| `HOSTNAME`     | HTTP 监听地址                    | 否                                | `0.0.0.0`                     |
| `NODE_OPTIONS` | Node 启动参数，可限制堆内存      | 否                                | 未设置；部署脚本限制为 256 MB |

评测脚本另使用以下一次性变量，它们不是应用运行配置：

| 变量          | 含义                                         | 必填条件                 | 默认值 |
| :------------ | :------------------------------------------- | :----------------------- | :----- |
| `EVAL_SET`    | 路由数据集：`dev` / `holdout` / `holdout2`   | 执行 `eval:route` 时必填 | 无     |
| `EVAL_TAG`    | 输出目录标签，1～32 位小写字母、数字或连字符 | 执行 `eval:route` 时必填 | 无     |
| `EVAL_GUARD`  | 是否包含护栏：`0` 或 `1`                     | 执行 `eval:route` 时必填 | 无     |
| `REPORT_MODE` | T16 离线报告模式：`offline` 或 `final`       | 执行 `eval:t16` 时必填   | 无     |

## 部署

部署前提是本机已安装 Node.js、npm、tar、SSH/SCP，并已配置部署私钥与 `.env.deploy`。不要把 `.env.deploy` 提交到 Git，也不要在日志中打印它。

```bash
bash scripts/deploy.sh
```

脚本会依次执行质量检查、本地生产构建和 standalone 打包，剔除 Windows 原生包后上传；随后更新运行环境、原子切换 release、重启服务并轮询健康检查。服务器只运行产物，不安装项目依赖或执行构建。发布目录只保留最近 3 个 release。

如需回滚到上一个 release：

```bash
bash scripts/deploy.sh --rollback
```

回滚只切换已有版本并重启，不重新构建或上传环境文件。

## 目录结构

```text
web/
├── scripts/                 打包、服务器初始化与发布脚本
├── src/
│   ├── app/                 页面与 Route Handlers
│   ├── components/          Agent、工作台、画布、回放、视觉背景与 UI 组件
│   ├── eval/                路由数据集、指标与离线报告逻辑
│   ├── lib/
│   │   ├── assistant/       专属 Agent 创建逻辑
│   │   ├── canvas/          图推导、布局与流式摘要
│   │   ├── client/          API 与运行控制器
│   │   ├── contracts/       Zod 数据契约
│   │   ├── orchestrator/    定级、计划校验与编排器
│   │   ├── run/             事件 reducer 与回放
│   │   ├── storage/         IndexedDB 持久化
│   │   ├── stream/          NDJSON 编解码
│   │   └── visual/          风格定义、星辰形状与光标拖拽模型（纯函数，有单元测试）
│   ├── server/              环境、提示词、LLM、工具与服务端护栏
│   ├── stores/              Zustand 运行状态
│   └── test/                测试替身与共享配置
├── .env.example             环境变量模板（不含真实凭据）
├── SECURITY.md              安全机制与已知限制
└── package.json             精确依赖与脚本
```

测试文件通常与源码同目录，命名为 `*.test.ts` 或 `*.test.tsx`；真实模型文件为 `*.live.ts`，不会进入默认测试。`.deploy/` 是本地发布产物目录，已被 Git 忽略。

## 脚本说明

| 命令                                  | 用途                                                     |
| :------------------------------------ | :------------------------------------------------------- |
| `npm run dev`                         | 启动开发服务器                                           |
| `npm run build`                       | 构建 Next.js 生产与 standalone 产物                      |
| `npm run start`                       | 使用 Next 启动生产服务器                                 |
| `npm run lint`                        | 运行 ESLint                                              |
| `npm run typecheck`                   | 运行 TypeScript 类型检查                                 |
| `npm run test`                        | 运行全部非 live 测试                                     |
| `npm run test:watch`                  | 以监听模式运行测试                                       |
| `npm run format`                      | 使用 Prettier 格式化                                     |
| `npm run format:check`                | 检查格式                                                 |
| `npm run check`                       | 依次运行 lint、typecheck、test、format:check             |
| `node scripts/package-standalone.mjs` | 组装 standalone、静态资源和 public，剔除 Windows 原生包  |
| `bash scripts/deploy.sh`              | 检查、构建、发布并做健康检查                             |
| `npm run smoke:live`                  | 串行执行 3 个示例 Agent 的 12 条真实 starter，会消耗额度 |
| `npm run eval:route`                  | 执行路由/护栏真实评测，需要 live 和 EVAL_* 变量          |
| `npm run eval:cost`                   | 执行真实成本采样，会消耗额度                             |
| `npm run eval:t16`                    | 根据已保存数据离线生成 T16 报告，不调用模型              |

真实联调和评测脚本都不应作为日常检查反复运行；默认 `npm run check` 已覆盖无需额度的质量验证。

## 安全说明

详见 [SECURITY.md](SECURITY.md)。主要机制包括服务端凭据隔离、请求体长度限制、Zod 输入校验、访问码的恒定时间比较、单进程限流、提示词数据区隔离、Markdown 禁用原始 HTML、工具白名单、确定性危机规则、专业边界与审校闸门。

当前公网地址使用 HTTP，仅用于受控演示。请勿输入个人敏感信息、账号密码或机密资料；正式对外提供服务时应启用 HTTPS，并使用平台级限流和更完整的账号权限体系。访问码是演示级共享口令，不是完整的用户认证系统。

## 团队信息

- 队名：AdAstra
- 学校：西安交通大学 电信学部
- 指导老师：刘帅
- 成员与分工：

| 成员           | 主要工作                                                                                 | 工作量占比 |
| :------------- | :--------------------------------------------------------------------------------------- | :--------- |
| 季宗泽（队长） | 产品定位、系统架构与数据契约、浏览器编排器、复杂度定级与评测、提示词工程、模型接入与部署 | 60%        |
| 安晟颉         | 编排画布与视觉设计、工作台交互、界面测试、演示视频                                       | 20%        |
| 韩颜伟         | 安全护栏与访问控制、评测数据标注、技术文档与提交材料                                     | 20%        |
