# AgentForge

## 项目介绍

一句话生成你的专属 AI 助手。当前仅包含工程基线，业务功能待补充。

## 技术架构

基于 Next.js App Router、React 和 TypeScript。整体技术架构与模块说明待补充。

## 目录结构

```text
src/
  app/         页面与 Route Handlers
  components/  界面组件
  lib/         前后端共享纯逻辑
  server/      仅服务端代码
  stores/      客户端状态
```

## 本地运行

1. 安装依赖：`npm install`。
2. 复制 `.env.example` 为 `.env.local`，按需填写配置；`.env.local` 不得提交到 Git。
3. 启动开发服务器：`npm run dev`。

默认使用 `LLM_MODE=mock`，无需模型密钥。切换到 live 模式时，在 `.env.local` 中设置 `LLM_MODE=live`，并填写非空的 `DEEPSEEK_API_KEY`；`DEEPSEEK_MODEL` 默认为 `deepseek-chat`。

## 脚本说明

| 命令                   | 用途                                           |
| :--------------------- | :--------------------------------------------- |
| `npm run dev`          | 启动开发服务器                                 |
| `npm run build`        | 构建生产版本                                   |
| `npm run start`        | 启动生产服务器                                 |
| `npm run lint`         | 运行 ESLint                                    |
| `npm run typecheck`    | 运行 TypeScript 类型检查                       |
| `npm run test`         | 运行单元测试                                   |
| `npm run test:watch`   | 以监听模式运行单元测试                         |
| `npm run format`       | 格式化代码                                     |
| `npm run format:check` | 检查代码格式                                   |
| `npm run check`        | 依次运行 lint、typecheck、test 和 format:check |

## 团队信息

待补充。
