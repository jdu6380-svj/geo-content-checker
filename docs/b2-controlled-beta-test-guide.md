# B.2 Controlled Beta 测试说明

## 文档包

执行真实用户测试时，按以下文档使用：

1. [Beta 用户测试操作手册](./b2-beta-user-test-manual.md)
2. [单用户测试流程](./b2-single-user-test-flow.md)
3. [Observation Artifact 模板](./b2-observation-artifact-template.md)
4. [用户反馈记录模板](./b2-user-feedback-record-template.md)
5. [脱敏数据记录规范](./b2-redacted-data-recording-standard.md)

本说明定义阶段边界和判定标准；上述文档定义单次测试的实际操作与记录方法。

## 1. 当前状态

本阶段状态：

`READY FOR CONTROLLED USER TEST`

这表示已经具备开始邀请制真实用户测试的工程条件，不表示 B.2 已经 PASS。

当前保留基线：

| 项目 | 当前值 |
| --- | --- |
| Vercel Project | `geo-content-checker` |
| Branch | `feature/public-beta-hardening` |
| Commit SHA | `70d886968d598f5133275a7d82ffbd2548e5cefa` |
| Deployment | `dpl_BezFBqJo5jWXYrPnLB5U2sxjWJjb` |
| Preview URL | `https://geo-content-checker-45y7mt12s.vercel.app/` |
| Source | Git Integration |
| Region | `hnd1` |
| Deployment State | `READY` |
| Access | Vercel Authentication 保护 |

2026-07-29 只读复核结果：

- Project、Branch、SHA 与当前保留版本匹配。
- Deployment 与 Ready State 均为 `READY`。
- 未认证访问会进入 Vercel Authentication，这是当前保护策略，不是应用错误。
- 同一 SHA 已完成 B.1 Technical Validation、Browser UX Smoke 和 Sentry Smoke。
- 本次未关闭访问保护、未重新部署、未修改 Preview 配置。

## 2. 测试目标

B.2 只验证以下四个商业价值信号：

1. Evidence 是否获得用户认可并建立信任。
2. Patch 是否被用户实际采用。
3. 修改后的 Recheck 是否产生可感知价值。
4. 用户是否愿意继续处理下一篇真实内容。

B.2 不验证支付，不开发 SaaS，也不扩大用户规模。

## 3. 目标用户

仅邀请同时满足以下条件的用户：

- 为企业客户交付中文专业长文的独立内容顾问。
- 独立决定工具采购和内容交付。
- 每月处理约 4 至 20 篇公众号文章、博客或专业内容。
- 本次愿意使用一篇真实待交付文章完成测试。

本阶段不邀请：

- 泛创作者。
- SEO 机构。
- 需要站点扫描或排名追踪的用户。
- 寻求 AI 排名、流量或引用保证的用户。

## 4. 测试前准备

每次测试开始前，由执行人完成：

1. 确认使用当前保留 Preview，不切换 Deployment。
2. 确认参与者符合目标用户画像。
3. 创建匿名参与者 ID，例如 `B2-U001`。
4. 创建观察 ID，例如 `B2-O001`。
5. 告知参与者不要提交法律禁止处理、未经授权或高度敏感的内容。
6. 不要求参与者提供姓名、公司名称、客户名称或联系方式到测试记录。

文章正文只进入当前 Preview 的正常分析流程，不复制到测试文档、聊天、截图或观察 artifact。

## 5. 用户验证流程

### Step 1：提交真实文章

参与者在当前 Preview 提交一篇真实待交付文章。

执行人只记录：

- 内容类型：公众号、博客长文或专业文章。
- 使用场景：客户交付前检查。
- 是否为真实交付内容。
- 匿名 Artifact ID。

不记录标题和正文。

### Step 2：完成首次审查

参与者完成：

`评分 → 5 个问题 → Evidence 诊断`

逐项询问：

1. 是否认可系统指出的问题。
2. 是否理解问题为什么存在。
3. Evidence 是否帮助其判断风险。

记录状态：

- Evidence 认可：`recognized` / `rejected`
- Evidence 价值：`valuable` / `not_valuable`
- 被查看的 Evidence ID

如果本次只获得 fallback、技术错误或未完成诊断，不计为价值闭环成功。

### Step 3：验证 Patch 采用

参与者查看 Patch 后自行决定是否修改文章。

记录：

- 被查看的 Patch ID。
- 实际采用的 Patch ID。
- 被修改的 Problem ID。
- 采用状态：`adopted` / `partially_adopted` / `not_adopted`
- 原因代码：
  - `evidence_supported`
  - `actionable_change`
  - `client_requirement`
  - `meaning_risk`
  - `effort_too_high`
  - `not_relevant`

不记录参与者修改后的正文。

复制 Patch 只能作为行为代理，不能单独证明已实际采用。

### Step 4：验证 Recheck

参与者通过“编辑原文”返回编辑器，完成修改后重新分析。

记录：

- 是否完成 Recheck。
- Recheck Artifact ID。
- 结果：`improved` / `unchanged` / `regressed`
- 用户判断：`helpful` / `not_helpful`

未完成 Recheck 也必须如实记录，不得补记为成功。

### Step 5：验证下一篇需求

测试结束时只询问：

“你是否愿意继续用它检查下一篇真实交付内容？”

记录：

- `confirmed`：明确愿意处理下一篇。
- `interested`：有兴趣，但尚未确认下一篇。
- `none`：没有继续使用需求。

不要在本阶段询问或收取 ¥99、¥129 或其他费用。

## 6. 数据记录

Controlled Beta 观察 artifact 由
`scripts/b2-controlled-beta-validation.ts` 校验。

允许保存：

- 匿名参与者 ID。
- Observation、Analysis、Evidence、Problem、Advice、Patch、Recheck Artifact ID。
- 内容类型和真实交付状态。
- Evidence 认可与价值状态。
- Patch 查看、采用和原因代码。
- Recheck 状态与结果。
- 下一篇需求状态。
- Artifact 关系和 SHA-256。

禁止保存：

- 用户正文或修改后正文。
- 客户名称、公司名称、姓名、邮箱或其他身份信息。
- Prompt、Evidence 原文、问题正文或模型完整输出。
- API Key、Authorization、Cookie、Token、环境变量。
- 包含文章内容的截图、录屏或日志。

现有 `/api/beta-event` 保持不变：

- `analysis_completed` 可确认分析完成。
- `diagnosis_feedback` 仅作为 Evidence 价值代理。
- `patch_copied` 仅作为 Patch 兴趣代理。
- 实际采用、Recheck 价值和下一篇需求由受控观察 artifact 记录。

## 7. 结果判定

一次观察记录有效，要求五个步骤的状态均已记录。

负面反馈同样是有效观察：

- 不认可 Evidence。
- 不采用 Patch。
- 不完成 Recheck。
- 没有下一篇需求。

只有以下四项同时成立，才标记：

`value_loop_complete`

1. Evidence：`recognized + valuable`
2. Patch：`adopted` 或 `partially_adopted`
3. Recheck：`completed + improved + helpful`
4. 下一篇：`confirmed`

`interested` 只算方向性信号，不算完整闭环。

## 8. 成功指标

当前阶段首先观察：

- Evidence 信任人数和比例。
- Patch 实际采用人数和比例。
- Recheck 完成及有效人数和比例。
- 下一篇需求人数和比例。
- 完整价值闭环人数。

90 天商业目标保持不变：

- 30 名完成真实文章审查的用户。
- 10 名独立付费用户。
- 至少 5 名完成第二次付款。
- 累计实际收款 ¥2,000。

当前不执行支付，因此后三项保持 `deferred`，不能用意愿替代实际付款。

## 9. 冻结与停止规则

测试期间保持：

- 使用当前 Preview、Branch 和 SHA。
- 不新增功能。
- 不修改 Prompt、Model Adapter、Provider 参数、Scoring、API Schema 或分析状态机。
- 不进行 UI 重构、支付开发、账号系统或 Team 功能开发。
- 不 Commit、Push 或 Deploy，除非后续单独批准经过确认的 P0/P1 缺陷修复。

出现以下情况时停止该次观察：

- 参与者提交不应处理的敏感内容。
- Preview 无法完成核心流程。
- 结果为 fallback 或技术错误，无法形成真实价值判断。
- Artifact 关系不完整或隐私校验失败。

## 10. 下一步

当前版本保持不变。

下一步只做：

1. 邀请符合画像的真实用户。
2. 按本说明完成受控测试。
3. 收集脱敏 observation artifact。
4. 等待真实用户反馈形成稳定模式。

在真实反馈出现前，不启动新功能、商业化开发或 UI 改造。
