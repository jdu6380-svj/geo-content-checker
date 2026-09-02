# Evidra

Evidra 是面向 AI 搜索时代的内容可信度审查平台。用户提交文章后，系统生成四维 GEO 评分、预测读者问题、逐题验证原文证据，并按需生成辅助修改材料。

## 本地运行

项目统一使用 Node.js 22.x；本地与 CI 验证基线为 `v22.23.1`。`.nvmrc`、GitHub Actions 与 B.1.5 校验使用该基线，`package.json#engines` 声明兼容的 `22.23.x` 运行时。不要使用 Node.js 24+ 运行安装、开发服务、检查或构建。

```bash
nvm install
nvm use
node --version # 必须为 v22.23.1
npm ci
npm run dev
```

默认地址：`http://127.0.0.1:3000`

- `npm run dev`：使用 Turbopack 的轻量开发模式；显式禁用真实模型并清空 Upstash Redis 环境变量，分析结果使用既有安全降级链路。
- `npm run dev:model`：使用 Turbopack 的真实 AI 链路，读取本机 `.env.local` 中的模型与 Redis 配置，仅用于显式的本地 Beta 验收；它不会替你补齐或创建 Redis 配置。
- `npm run dev:webpack`：轻量模式的 webpack 回退；Turbopack 遇到兼容性问题时使用。
- `npm run typecheck:app`：仅检查 `app`、`components`、`lib` 与 Next.js 运行配置，适合开发中快速反馈。
- `npm run check`：完整检查应用、验证脚本与 ESLint，继续作为 CI 门禁。

复制 `.env.example` 中的变量到本地环境后配置模型、Redis、令牌密钥和限流盐值。没有模型密钥时使用安全本地兜底；生产环境没有 Redis 或安全密钥时失败关闭。

只读健康检查位于 `GET /api/health`。配置完整时返回 `200 / ok`，缺少模型、Redis 或生产安全配置时返回 `503 / degraded`；响应只包含布尔状态，不返回环境变量内容。

### 开发模式与真实服务验收

轻量模式验收使用 `npm run dev`。运行一轮文章审查后，应在结构化日志中看到评分、问题预测和诊断的 `source: "fallback"`、`modelStatus: "disabled"` 与 `rateLimitMode: "memory"`；这确认开发模式没有调用真实 AI 或 Redis。

真实模式验收前，先在本机 `.env.local` 配置 `OPENAI_BASE_URL`、`OPENAI_API_KEY`、`OPENAI_MODEL`、`UPSTASH_REDIS_REST_URL`、`UPSTASH_REDIS_REST_TOKEN`，以及现有的安全密钥。随后在 Node `v22.23.1` 下启动：

```bash
npm run dev:model
```

在服务运行期间检查 `GET /api/health` 的模型与 Redis readiness 均为 `true`，再通过登录后的商业工作台提交一条非敏感测试内容。真实验收必须确认商业运行由受控 executor 完成、私有结果可回访且额度只在成功后扣减；旧匿名 API 不再用于模型验收。`dev:model` 缺少 Upstash 凭据时会在开发环境回退到 `memory`，即使模型可用也不算 Redis 验证通过。

服务端为所有 API 输出结构化日志，并由代码拥有的顶层白名单限制为请求/路由/状态/耗时、结果来源、限流状态、模型与 provider 状态/耗时、预算、Token 数量、可选费用、受限响应形状及校验诊断等运行元数据类别；只记录 Token 数量，不记录授权 Token 或任何内容。日志不会记录文章正文、问题证据、API Key 或内部 Prompt。

生产响应默认包含 CSP、禁止 iframe、MIME 嗅探防护、严格 Referrer Policy、Permissions Policy 与 HSTS。`RATE_LIMIT_SALT` 和 `ANALYSIS_TOKEN_SECRET` 均要求至少 32 字节且不能相同；Redis 正常模式使用共享模型调用上限，配额降级模式每个实例最多调用模型 30 次/小时。导出的 Markdown 会转义正文中的原始 HTML。

## 真实服务配置

首次接入真实服务时运行：

```bash
npm run setup:env
```

命令会创建权限为 `600` 的 `.env.local`，并自动生成 `RATE_LIMIT_SALT`、`ANALYSIS_TOKEN_SECRET` 与 `BETA_EVENT_HMAC_SECRET`。如果文件已经存在，命令只补充缺少的变量，不覆盖已有值。

随后只在本机编辑 `.env.local`，补充以下凭据：

- DeepSeek：`OPENAI_API_KEY`，默认接口为 `https://api.deepseek.com`，模型为 `deepseek-v4-flash`。
- Upstash：`UPSTASH_REDIS_REST_URL` 与 `UPSTASH_REDIS_REST_TOKEN`。
- 公开环境保持 `REDIS_QUOTA_FAIL_OPEN=false`。

密钥不得写入 README、提交记录、Issue、截图或聊天。配置完成并重启开发服务后，`GET /api/health` 应返回 `200 / ok`。

真实服务本地验收：

```bash
npm run check
npm run blackbox:legacy-migration
npm run build
```

## GitHub 与 Vercel

项目通过公开 GitHub 仓库连接 Vercel，不依赖 Vercel CLI。推送前必须确认 `.env.local`、`.next`、`node_modules`、`.vercel` 和本地测试产物均处于忽略状态。

在 A.5 阶段，仅在 Vercel `Preview` 环境为 `feature/public-beta-hardening` 配置 `.env.example` 所需变量。Production 环境变量、Production 部署、Promote、Merge 和标签保持锁定；Preview 门禁全部通过后再单独评估 Production。新 Preview 必须由 Git Integration 产生，不使用 Vercel CLI 部署。部署完成后执行：

```bash
# 安全测试运行器需预先注入 VERCEL_AUTOMATION_BYPASS_SECRET。
GEO_BASE_URL=https://your-preview.vercel.app \
npm run blackbox:legacy-migration
```

受 Deployment Protection 保护的 Preview 必须使用 Vercel 官方 `x-vercel-protection-bypass` 请求头。该 Secret 只属于自动化测试运行器，不加入 `.env.example`、Vercel 应用环境变量或仓库。

仓库提供 GitHub Actions 工作流 `Preview Legacy Migration Boundary`。在当前 Draft PR 中，它只对 `feature/public-beta-hardening` 的 PR 更新运行，并按 Commit SHA 等待 Git Integration Preview；合并后也可使用手动入口。工作流固定使用 GitHub Environment `Preview`，并要求：

- Environment Secrets：`VERCEL_AUTOMATION_BYPASS_SECRET`、`VERCEL_TOKEN`
- Environment Variables：`VERCEL_ORG_ID`、`VERCEL_PROJECT_ID`
- 手动入口输入：唯一 Preview Deployment URL 和完整 Commit SHA

工作流会先通过 Vercel API 发现或校验对应 Preview，确认 Project、Git 来源、Preview Target、Branch、READY 状态和 Commit SHA，再运行 `blackbox:legacy-migration`。它不会创建、重试、Promote 或修改任何 Deployment；也不代表模型、支付、数据库或私有报告验收已经完成。

如果 Preview 变量在已有 Deployment 创建后更新，旧 Deployment 不会读取新值。A.5 不点击 Redeploy；等待下一次真实产品、缺陷、安全、稳定性或发布文档 Commit 触发新的 Git Integration Preview。

Preview 故障测试结束后，必须恢复 `REDIS_QUOTA_FAIL_OPEN=false`。

`npm run release:check` 会阻断缺少真实模型、Redis、安全密钥、反馈入口、支持邮箱和 Sentry 配置的 Release 构建，并要求 `REDIS_QUOTA_FAIL_OPEN=false`。完整的 Preview 变量清单、Health 对应关系和 Git Integration 验收顺序见 [`docs/public-beta-runbook.md`](docs/public-beta-runbook.md)。

## Sprint 验收流程

每轮功能开发固定执行以下顺序：

1. 完成功能、接口契约、状态管理和安全策略修改。
2. 同步补充测试代码：
   - 每个新功能在 `scripts/blackbox.mjs` 中增加成功和失败用例。
   - 覆盖无权限、超限、异常输入和降级结果。
   - 测试输出不得包含正文、Token、API Key 或内部 Prompt。
3. 运行第一次代码检查：

   ```bash
   npm run check
   npm run security:unit
   ```

4. 保持开发服务运行，执行完整接口黑盒测试：

   ```bash
   npm run blackbox
   ```

   测试其他环境时使用：

   ```bash
   GEO_BASE_URL=https://your-preview.example.com npm run blackbox
   ```

   商业运行的真实 AI、私有报告和额度验证只使用已授权的 staging smoke，不使用旧匿名 API。

5. 在业务逻辑稳定后执行 UI 优化：
   - 优化加载、成功、局部失败、会话失败和重新体检状态。
   - 保持现有产品视觉体系，不进行无关的大规模重设计。
6. 执行 UI 浏览器验收：
   - 检查输入、加载、成功、局部失败和会话失败状态。
   - 检查桌面、621px 和 390px 视口。
   - 检查长标题、长问题、状态标签、按钮和手风琴无溢出或重叠。
   - 检查键盘焦点、错误提示、减少动画和重新体检流程。
   - 完整走通输入、报告、动态追问和补丁生成。
7. UI 修改后执行最终回归门禁：

   ```bash
   npm run check
   npm run blackbox
   npm run build
   ```

## 自动化覆盖

`npm run blackbox` 当前验证：

- 健康检查状态、无敏感配置泄露及统一请求 ID
- 损坏 gzip 和解压炸弹拦截
- 缺少或伪造分析令牌返回 401
- 令牌与设备身份绑定
- 评分、预测、诊断和补丁操作额度
- 认证后的 gzip 请求
- 模型结果与安全降级结果来源
- 预热 30 分钟设备限流
- 安全响应头与 Markdown 原始 HTML 转义

测试脚本不会输出文章正文、分析令牌或环境密钥。

## 当前商业与匿名边界

- 认证商业工作台使用 Clerk actor、Neon workspace/member、私有 Blob 结果和服务端 entitlement/quota；workspace、项目、run 与 result 均由服务端归属校验。
- 商业分析只从认证后的 project-level analyze 入口执行；报告成功持久化后才扣除一次额度，失败、取消或未生成完整报告不扣除。
- 首发支付 provider 为支付宝一次性套餐；未配置支付宝、Neon、Blob、Clerk 或 OpenAI-compatible executor 时，商业入口保持 fail-closed，不展示伪成功。
- 旧匿名分析端点仅返回 `401 AUTHENTICATION_REQUIRED` 并引导登录；首页仍可保留本地草稿、模板和输入预览，但不会产生商业 run、报告或额度记录。
- staging 配置检查、迁移、一次性 workspace provisioning、health、smoke 和人工验收顺序见 [`docs/staging-launch-runbook.md`](docs/staging-launch-runbook.md) 与 [`docs/staging-handoff-template.md`](docs/staging-handoff-template.md)。交接模板只记录变量名、状态和责任，不记录凭证值。
- 匿名兼容体验的本地缓存与指标不是商业账户、账单、entitlement 或客户报告事实；商业 staging/production 仍需真实凭证、迁移和人工验收。
