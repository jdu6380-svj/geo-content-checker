# B.2 单用户测试流程

## 1. 流程摘要

建议时长：45 至 60 分钟。

```text
基线确认
  ↓
参与者告知与准入
  ↓
真实文章提交
  ↓
首次审查与 Evidence 判断
  ↓
Patch 查看与实际采用
  ↓
修改后 Recheck
  ↓
下一篇需求确认
  ↓
脱敏记录与 Artifact 校验
```

每次只测试一名参与者和一篇真实待交付文章。

## 2. T-10 分钟：执行人准备

完成以下检查：

- Preview、Branch、SHA 和 Deployment 与固定基线一致。
- 参与者符合目标画像。
- 参与者对文章具有合法处理权限。
- 已分配匿名参与者 ID 和 Observation ID。
- 未开启截图、录屏、会议转写或浏览器内容采集。
- 反馈模板和 Observation 模板已准备。

任何一项不满足，不开始测试。

## 3. 0 至 5 分钟：告知与同意

向参与者宣读操作手册中的测试前告知。

只确认：

- 参与者理解本次测试目标。
- 参与者同意使用真实待交付文章。
- 参与者知道不会记录正文或身份信息。
- 参与者知道可以随时停止。

不要记录口头原话。

## 4. 5 至 10 分钟：提交真实文章

参与者自行在 Preview 中提交文章。

执行人记录：

- 内容类型：
  - `public_account`
  - `blog_longform`
  - `professional_article`
- 使用场景：`client_delivery_prepublication`
- 真实交付：`true`
- Input Artifact ID

执行人不查看或复制文章正文，不记录标题。

如果分析失败、返回 fallback 或出现技术错误，停止本次价值验证。

## 5. 10 至 20 分钟：Evidence 信任

让参与者自行查看评分、问题和 Evidence 诊断。

依次询问：

1. “你是否认可这里指出的问题确实需要处理？”
2. “这些依据是否帮助你判断交付风险？”

记录：

- 被查看的 Evidence ID。
- 认可状态：
  - `recognized`
  - `rejected`
- 价值状态：
  - `valuable`
  - `not_valuable`

不要解释系统为什么正确，也不要说服参与者接受结果。

## 6. 20 至 35 分钟：Patch 实际采用

让参与者查看 Patch，并自行决定是否修改文章。

观察并记录：

- 被查看的 Patch ID。
- 实际采用的 Patch ID。
- 与采用 Patch 关联的 Problem ID。
- 采用状态：
  - `adopted`
  - `partially_adopted`
  - `not_adopted`
- 原因代码，可多选：
  - `evidence_supported`
  - `actionable_change`
  - `client_requirement`
  - `meaning_risk`
  - `effort_too_high`
  - `not_relevant`

判定规则：

| 用户行为 | 记录状态 |
| --- | --- |
| 采用全部被查看 Patch | `adopted` |
| 采用部分被查看 Patch | `partially_adopted` |
| 未采用任何 Patch | `not_adopted` |
| 只复制但未实际修改 | 不算采用 |

不得保存用户修改前后的正文差异。

## 7. 35 至 45 分钟：Recheck

参与者完成修改后，通过现有流程重新分析。

记录：

- Recheck 状态：
  - `completed`
  - `not_completed`
- Recheck ID，仅在完成时记录。
- 结果：
  - `improved`
  - `unchanged`
  - `regressed`
  - 未完成时使用 `not_assessed`
- 用户判断：
  - `helpful`
  - `not_helpful`
  - 未完成时使用 `not_recorded`

Recheck 只能关联本次实际采用的 Patch。未采用 Patch 时，不得记录已完成 Recheck。

## 8. 45 至 50 分钟：下一篇需求

只询问：

> 你是否愿意继续用它检查下一篇真实交付内容？

记录：

- `confirmed`：明确愿意处理下一篇。
- `interested`：有兴趣，但尚未确认下一篇。
- `none`：没有继续使用需求。

不要询问付款金额，不收取费用，不将“有兴趣”记录为“已确认”。

## 9. 50 至 60 分钟：收尾

执行人完成：

1. 检查反馈模板没有自由文本或敏感信息。
2. 检查所有 Artifact ID 来自同一 Stage 1 Artifact。
3. 将状态填入 Observation 输入模板。
4. 运行现有校验逻辑生成最终 Artifact。
5. 确认完整性 SHA-256 由 validator 生成。
6. 将临时记录中的正文、截图或可识别信息全部排除。

## 10. 结果判定

观察有效要求：

- 目标用户画像匹配。
- 使用真实交付文章。
- Artifact 引用有效。
- Evidence、Patch、Recheck 和下一篇决策均已记录。
- 状态组合一致。
- 无禁止字段。

完整价值闭环要求同时满足：

- Evidence：`recognized` 和 `valuable`
- Patch：`adopted` 或 `partially_adopted`
- Recheck：`completed`、`improved` 和 `helpful`
- 下一篇：`confirmed`

负面结果可以是 `beta_observation_valid`，但其价值闭环必须保持 `value_loop_incomplete`。
