# B.2 Beta 用户测试操作手册

## 1. 使用范围

本手册用于 B.2 Controlled Beta 的邀请制真实用户验证。

当前阶段只验证：

1. Evidence 是否建立信任。
2. Patch 是否被实际采用。
3. Recheck 是否产生可感知价值。
4. 用户是否愿意继续处理下一篇真实内容。

当前阶段不验证支付，不开发 SaaS，不扩大用户规模。

## 2. 固定工程基线

每次测试必须使用以下保留版本：

| 项目 | 固定值 |
| --- | --- |
| Project | `geo-content-checker` |
| Branch | `feature/public-beta-hardening` |
| Commit SHA | `70d886968d598f5133275a7d82ffbd2548e5cefa` |
| Deployment | `dpl_BezFBqJo5jWXYrPnLB5U2sxjWJjb` |
| Preview URL | `https://geo-content-checker-45y7mt12s.vercel.app/` |
| Deployment State | `READY` |
| Access | Vercel Authentication 保护 |

测试执行人不得切换 Deployment、关闭访问保护、修改环境变量或重新部署。

如果 Branch、SHA、Deployment 或 READY 状态无法确认，停止测试，不使用其他版本替代。

## 3. 参与者准入

参与者必须同时满足：

- 为企业客户交付中文专业长文的独立内容顾问。
- 独立负责内容交付，并可以自行决定是否采用修改。
- 每月处理约 4 至 20 篇公众号文章、博客长文或专业文章。
- 愿意用一篇真实待交付文章完成一次测试。
- 对该文章具有合法处理权限。

不纳入本阶段：

- 泛创作者。
- SEO 机构。
- 需要站点扫描或排名追踪的用户。
- 寻求 AI 排名、流量或引用保证的用户。
- 无权处理文章或客户资料的参与者。

## 4. 执行角色

单次测试包含两个角色：

- 参与者：独立完成提交、判断、修改和 Recheck。
- 执行人：说明规则、观察行为、记录枚举状态，不代替参与者操作或判断。

如需旁观人员，必须遵守相同脱敏规则。不得录屏、截图或抄录文章内容。

## 5. 测试前准备

执行人依次完成：

1. 只读确认固定工程基线。
2. 确认参与者符合目标画像。
3. 分配匿名参与者 ID，例如 `B2-U001`。
4. 分配本次 Observation ID，例如 `B2-O001`。
5. 打开 [单用户测试流程](./b2-single-user-test-flow.md)。
6. 准备 [用户反馈记录模板](./b2-user-feedback-record-template.md)。
7. 确认记录位置不在 Git 仓库、聊天、邮件正文或共享截图中。

匿名 ID 不得包含姓名、公司、客户、邮箱、手机号、日期或其他可识别信息。

## 6. 测试前告知

执行人向参与者说明：

> 本次测试使用一篇你有权处理的真实待交付文章。文章只进入当前受保护 Preview 的正常分析流程。测试记录只保存匿名 ID、Artifact 关联和选项状态，不保存标题、正文、客户信息、Prompt、Evidence 原文或模型输出。你可以随时停止测试。

参与者不同意上述边界时，不开始测试。

## 7. 执行原则

- 一名参与者、一次会话、一篇文章、一个 Observation。
- 参与者自行提交内容，执行人不接收文章文件。
- 参与者先表达判断，执行人再记录状态，避免引导答案。
- `patch_copied` 只能表示兴趣，不能证明实际采用。
- 只有参与者实际修改文章，才记录 `adopted` 或 `partially_adopted`。
- Recheck 必须基于参与者修改后的版本。
- 负面反馈是真实结果，不得改写成正向状态。
- fallback、技术错误或未完成流程不能作为价值闭环成功。

## 8. Artifact 记录

使用 [Observation Artifact 模板](./b2-observation-artifact-template.md)记录结构化输入。

所有 Evidence、Problem、Advice、Patch 和 Recheck ID 必须来自同一个 Stage 1 Artifact。不得人工编造、跨会话拼接或根据正文生成可识别 ID。

最终 Artifact 必须由现有 B.2 validator 生成完整性字段。不得手工填写或修改 SHA-256。

如果无法取得同一 Stage 1 Artifact 的关联 ID：

1. 保留该次用户反馈为未完成观察。
2. 不生成 `beta_observation_valid` 结论。
3. 不放宽 Schema 或改写代码。
4. 将其作为 B.2 流程阻塞项等待单独评估。

## 9. 停止条件

出现以下任一情况，立即停止当前测试：

- 参与者准备提交法律禁止处理、未经授权或高度敏感的内容。
- Preview 与固定 SHA 不匹配。
- Preview 无法完成核心流程。
- 首次审查仅得到 fallback 或技术错误。
- Artifact 关系无法确认属于同一次会话。
- 记录中误入正文、身份信息、凭证或其他禁止字段。
- 参与者主动退出。

停止后不得重试来替换负面结果。技术性中止可在后续另开新的 Observation，但必须保留独立 ID。

## 10. 测试结束

执行人完成：

1. 确认正文、修改后正文和模型输出未进入记录。
2. 将反馈选项转换为 Observation 输入。
3. 校验 Artifact 关系和枚举一致性。
4. 生成并校验 B.2 Observation Artifact。
5. 记录 `beta_observation_valid` 或 `beta_observation_invalid`。
6. 单独判断 `value_loop_complete` 或 `value_loop_incomplete`。
7. 按 [脱敏数据记录规范](./b2-redacted-data-recording-standard.md)保存。

`beta_observation_valid` 只表示记录完整且关系有效，不等于用户价值闭环成功。

## 11. 冻结边界

测试期间保持：

- 不修改代码、配置、Prompt、模型参数或核心分析逻辑。
- 不 Commit、Push 或 Deploy。
- 不修改 Preview 或 Production。
- 不增加账号、数据库、支付、Workspace 或 Team。
- 不进行 UI 或品牌重构。
- 不进入 ¥99、¥129 或其他收费验证。

真实用户反馈先形成稳定模式，再单独评估是否需要变更。
