# 理据 GEO 内容体检

面向中文公众号和博客长文的 GEO 准备度诊断原型。用户提交文章后，系统生成四维评分、预测读者问题、逐题证据诊断，以及按需生成 FAQ 和事实卡片。

## 本地运行

```bash
npm install
npm run dev
```

默认地址：`http://127.0.0.1:3000`

复制 `.env.example` 中的变量到本地环境后配置模型、Redis、令牌密钥和限流盐值。没有模型密钥时使用安全本地兜底；生产环境没有 Redis 或安全密钥时失败关闭。

只读健康检查位于 `GET /api/health`。配置完整时返回 `200 / ok`，缺少模型、Redis 或生产安全配置时返回 `503 / degraded`；响应只包含布尔状态，不返回环境变量内容。

服务端为所有 API 输出结构化日志，字段仅包含请求 ID、路由、状态码、耗时、结果来源、模型状态和限流模式。日志不会记录文章正文、问题证据、分析 Token、API Key 或内部 Prompt。

生产响应默认包含 CSP、禁止 iframe、MIME 嗅探防护、严格 Referrer Policy、Permissions Policy 与 HSTS。`RATE_LIMIT_SALT` 和 `ANALYSIS_TOKEN_SECRET` 均要求至少 32 字节且不能相同；Redis 正常模式使用共享模型调用上限，配额降级模式每个实例最多调用模型 30 次/小时。导出的 Markdown 会转义正文中的原始 HTML。

## 真实服务配置

首次接入真实服务时运行：

```bash
npm run setup:env
```

命令会创建权限为 `600` 的 `.env.local`，并自动生成 `RATE_LIMIT_SALT` 与 `ANALYSIS_TOKEN_SECRET`。如果文件已经存在，命令会拒绝覆盖。

随后只在本机编辑 `.env.local`，补充以下凭据：

- DeepSeek：`OPENAI_API_KEY`，默认接口为 `https://api.deepseek.com/v1`，模型为 `deepseek-chat`。
- Upstash：`UPSTASH_REDIS_REST_URL` 与 `UPSTASH_REDIS_REST_TOKEN`。
- 公开环境保持 `REDIS_QUOTA_FAIL_OPEN=false`。

密钥不得写入 README、提交记录、Issue、截图或聊天。配置完成并重启开发服务后，`GET /api/health` 应返回 `200 / ok`。

真实服务本地验收：

```bash
npm run check
npm run blackbox:model
npm run build
```

## GitHub 与 Vercel

项目通过公开 GitHub 仓库连接 Vercel，不依赖 Vercel CLI。推送前必须确认 `.env.local`、`.next`、`node_modules`、`.vercel` 和本地测试产物均处于忽略状态。

在 Vercel 的 Preview 和 Production 环境中分别配置 `.env.example` 列出的全部变量。部署完成后执行：

```bash
GEO_BASE_URL=https://your-preview.example.com npm run blackbox:model
```

Preview 故障测试结束后，必须恢复 `REDIS_QUOTA_FAIL_OPEN=false`。

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

   无真实模型密钥时显式验证降级结果：

   ```bash
   npm run blackbox:fallback
   ```

   接入真实模型后显式验证模型结果：

   ```bash
   npm run blackbox:model
   ```

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

## MVP 边界

- 正文只在当前请求中处理，不保存到服务端数据库。
- 最近一份报告仅保存在浏览器本地，并带有过期和体积清理策略。
- MVP 不包含账号、团队 RBAC、支付或服务端报告历史。
- 生产部署需要真实模型凭据、Upstash Redis、监控告警和独立隐私说明。
