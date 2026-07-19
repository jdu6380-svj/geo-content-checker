# 理据 GEO 产品现状与路线图

> 更新时间：2026-07-20  
> 当前候选版本：`v0.1.0-beta.1`  
> 当前分支：`feature/public-beta-hardening`  
> 当前阶段：核心契约与 Beta 体验优化，尚未部署 Preview 或 Production

## 1. 产品定位

理据 GEO 是面向 AI 搜索时代的内容理解与可信度优化平台，帮助内容被 AI 正确理解、引用和推荐，但不承诺任何外部平台的排名、流量或引用结果。

当前 Beta 服务于中文长文章、博客、公众号、知识内容和专业文章。未来可扩展到产品页面、Landing Page、帮助文档、品牌内容和企业知识库。

产品围绕理据 Content Intelligence Loop 工作：

```text
Analyze -> Diagnose -> Improve -> Verify -> Learn
```

理据 GEO 不是通用聊天机器人、完整文章写作工具、自动发布系统、关键词排名工具、CMS 或社交媒体运营工具。

## 2. 当前核心能力

### 内容 GEO 体检

- 输入标题、发布日期和最多 `12,000` 字正文。
- 输出 GEO 综合评分和四个评分维度。
- 预测 AI 搜索或问答用户可能提出的五个问题。
- 对每个问题分别判断可回答程度、风险、缺失信息和修改方向。

### Evidence 诊断

- 将诊断结论关联到 `Para-X` 原文段落。
- 验证模型引用必须是原文中的连续文本。
- 模型输出异常时返回明确 `fallback`，不冒充真实模型结果。
- 当前不展示未经校准的可信度百分比。

### 内容优化工作流

- 生成 FAQ、事实卡片和 Markdown 内容补丁。
- 所有事实性内容必须能够回到原文 Evidence。
- 支持逐项查看、完整复制和返回编辑器重新检测。

### 企业级工作台体验

- 提供编辑、分析、报告、追问、Patch 和 Evidence 工作区。
- 支持桌面和移动端、键盘操作、动态状态播报和减少动画偏好。
- 提供 `/privacy`、`/terms`、反馈入口和支持邮箱。

## 3. 已完成的工程与安全能力

- Node.js 固定为 `22.x`，GitHub Actions 已覆盖类型检查、Lint、安全单测、fallback 黑盒和构建。
- 标题上限 `120` 字，正文上限 `12,000` 字，最多 `80` 段，单段最多 `800` 字。
- 压缩请求体上限 `64KB`，解压后上限 `128KB`；覆盖异常 Content-Length、损坏 gzip 和压缩炸弹。
- 客户端随机 UUID，服务端使用 HMAC 派生设备和共享 IP 身份。
- Redis 不保存原始 IP、User-Agent、客户端 UUID、正文、Prompt 或 Evidence。
- 设备限制为 `6 次/分钟`、`10 次/日`，共享 IP 为 `30 次/分钟`、`100 次/日`。
- 全局模型预算为 `180 次模型调用/小时`。
- 结构化日志和 Sentry 仅记录路由、请求 ID、状态、耗时、模型状态、Token、费用和限流模式。
- `GET /api/health` 检查模型、Redis、安全密钥、反馈和 Sentry 配置。
- 已创建 Draft PR，CI 已通过；Production、Merge 和标签仍锁定。
- Vercel 与东京 `hnd1` Upstash Redis 已建立，当前 Deployment 数量为 `0`。

## 4. 当前 API

| API | 作用 |
| --- | --- |
| `POST /api/analysis-session` | 创建匿名分析会话并检查额度 |
| `POST /api/evaluate-scoring` | 生成总分、维度评分和段落索引 |
| `POST /api/predict-questions` | 预测文章相关问题 |
| `POST /api/qa-diagnostic` | 对单个问题执行 Evidence 诊断 |
| `POST /api/generate-patches` | 生成内容优化 Patch |
| `POST /api/warmup` | 已计划弃用的模型预热接口 |
| `POST /api/beta-event` | 记录匿名 Beta 产品指标 |
| `GET /api/health` | 检查发布配置状态 |

## 5. 当前发布状态

| 领域 | 状态 |
| --- | --- |
| MVP 核心流程 | 已完成 |
| Beta 安全加固 | 已完成 |
| Draft PR 与 CI | 已完成 |
| Upstash 与模型 Preview 配置 | 大部分完成 |
| Sentry 与成本变量 | 待补齐 |
| 核心优化 Phase A | 进行中 |
| Preview 验收 | 未开始 |
| 两阶段模型验证 | 未开始 |
| 受控真实用户 Beta | 未开始 |
| Production | 锁定 |

## 6. 核心优化路线 v8

### Phase A.0：基础契约

- 引入分析版本、API 契约版本和报告 Schema 版本。
- 使用版本化 Hash 防止重复分析和错误恢复旧报告。
- 使用受限 `sessionStorage` 恢复未提交草稿与分析状态。
- 删除客户端自动 Warmup；保留并明确弃用服务端接口。

### Phase A.1：可信 PatchAction

- 默认生成低风险的作者补充证据和结构修改建议。
- FAQ 与事实卡片作为实验内容草稿入口。
- 每个 Action 具有服务端生成的 ID、创建时间和严格 Evidence 约束。
- 禁止新增原文不存在的数字、实体、事实和效果承诺。

### Phase A.2：Evidence 可信度

- 由服务端明确返回 `valid`、`missing` 或 `invalid`。
- UI 不再通过 Evidence 数组长度推断可信状态。
- 展示精确引用、段落位置、缺失和无效定位，不展示虚假可信度分数。

### Phase A.3：匿名漏斗与信任指标

- 扩展编辑、分析、报告阅读、Patch 和反馈事件。
- `report_viewed` 只在报告核心区域真实可见并累计停留 10 秒后触发。
- 新增诊断是否有帮助的匿名反馈和正向反馈率。
- 不记录正文、问题文本、Evidence、Prompt 或原始身份。

### Phase A.4：低风险体验优化

- 只调整首屏信息层级、主操作、真实 Loading、报告首屏、Evidence 状态和 Patch 模式入口。
- 不替换组件库、Design Token、页面结构或组件边界。
- 不建设完整 Motion System 或品牌重构。

### Phase A.5：Preview 验收

- 在 Node 22 下完成本地检查、构建、安全与 fallback 黑盒。
- 按 Build、Health、首页、完整分析、模型黑盒和 Sentry Smoke 顺序验收。
- 正常 Preview 通过后再执行隔离故障测试，删除故障部署后必须恢复验证。

### Phase B.1：两阶段模型技术验证

- Stage 1 负责评分和问题预测。
- Stage 2 负责诊断、Evidence 和修改建议。
- 旧流程保留为完整回滚路径，不返回半成品或混合来源报告。
- 使用 10 篇文章、两条流程、每篇三次进行 60 次匿名盲评。

### Phase B.2：受控真实 Beta

- 使用邀请制 Preview 验证至少 50 篇真实公众号、博客和专业文章。
- 至少收集 30 条诊断反馈，样本充分后目标正向反馈率 `>=70%`。
- 验证 `analysis_completed -> patch_applied -> repeat_analysis` 内容智能闭环。
- 至少 5 名不同匿名用户完成完整闭环。

## 7. 模型与 Evidence 门禁

- Evidence 定位准确率：`100%`。
- Evidence 语义支撑准确率：`>90%`。
- 修改建议可执行性：`>=90%`。
- 模型来源成功率：`>=95%`。
- 同一文章总分最大差值：`<=10`。
- 各维度归一化差值：`<=15`。
- P50：`<=20s`；P95：`<=45s`。
- 实验 Token 目标降低 `>=50%`。
- 每份成功报告综合成本不高于旧流程，目标降低 `>=30%`。
- 虚构 Evidence、明显误导建议和系统性错误容忍度为 `0`。

## 8. Beta North Star

```text
Verified Content Intelligence Loop =
analysis_completed + patch_applied + repeat_analysis
```

支持指标包括：

- 首次分析完成率。
- 报告有效阅读率。
- 诊断正向反馈率。
- Patch 请求、生成和复制率。
- 跨日期重复分析率。
- 完整闭环用户数。

## 9. Release Blockers

- [ ] Phase A 全部通过。
- [ ] Sentry Preview 配置和隐私检查通过。
- [ ] 模型成本变量及供应商费用告警配置完成。
- [ ] Preview Health、完整流程和 `blackbox:model` 通过。
- [ ] Redis、timeout、429、无效 JSON 和 fallback 故障验证通过。
- [ ] B.1 模型稳定性、Evidence 和成本门禁通过。
- [ ] B.2 真实 Beta 样本和信任指标达到最低要求。
- [ ] Production 回滚点和发布检查确认完成。

所有阻断项清零前，PR 保持 Draft，不合并、不部署 Production、不创建标签。

## 10. 当前明确不做

- 数据库、账号、团队空间、支付和订阅。
- 服务端文章、完整报告或历史记录持久化。
- 自动抓取 URL、自动发布和完整文章代写。
- SEO 关键词排名、CMS 和社交媒体运营能力。
- 完整视觉重构、品牌重构和大型动画系统。

## 11. 执行顺序

```text
A.0 契约稳定
  -> A.1 Patch 可信
  -> A.2 Evidence 可信
  -> A.3 用户行为数据
  -> A.4 低风险体验
  -> A.5 Preview 验收
  -> B.1 两阶段模型技术验证
  -> B.2 真实用户验证
  -> Production 决策
```
