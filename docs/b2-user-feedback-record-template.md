# B.2 用户反馈记录模板

## 1. 记录头

| 字段 | 填写值 |
| --- | --- |
| Observation ID | `B2-O___` |
| 匿名参与者 ID | `B2-U___` |
| 目标画像 | `independent_content_consultant` |
| 月处理量 | `4_7` / `8_12` / `13_20` |
| Input Artifact ID | 仅填写安全 ID |
| 内容类型 | `public_account` / `blog_longform` / `professional_article` |
| 真实交付 | `true` / `false` |

不得填写姓名、公司、客户、标题、正文、日期或联系方式。

## 2. 准入检查

- [ ] 为企业客户交付中文专业长文。
- [ ] 独立负责内容交付和修改决策。
- [ ] 每月处理 4 至 20 篇内容。
- [ ] 本次使用真实待交付文章。
- [ ] 对文章具有合法处理权限。
- [ ] 已理解脱敏和退出规则。

任一项不满足，不纳入目标用户观察。

## 3. Evidence 反馈

执行人提问：

1. “你是否认可这里指出的问题确实需要处理？”
2. “这些依据是否帮助你判断交付风险？”

记录：

| 字段 | 填写值 |
| --- | --- |
| reviewedEvidenceIds | 安全 ID 列表 |
| recognition | `recognized` / `rejected` |
| usefulness | `valuable` / `not_valuable` |

不记录用户原话或 Evidence 原文。

## 4. Patch 反馈

记录：

| 字段 | 填写值 |
| --- | --- |
| reviewedPatchIds | 安全 ID 列表 |
| adoptedPatchIds | 安全 ID 列表，未采用时为空 |
| adoptedProblemIds | 安全 ID 列表，未采用时为空 |
| status | `adopted` / `partially_adopted` / `not_adopted` |
| adoptionCodes | 从下列代码中选择至少一个 |

采用原因代码：

- [ ] `evidence_supported`
- [ ] `actionable_change`
- [ ] `client_requirement`

不采用或部分采用原因代码：

- [ ] `meaning_risk`
- [ ] `effort_too_high`
- [ ] `not_relevant`

只复制 Patch 但未修改文章时，记录为 `not_adopted`。

## 5. Recheck 反馈

| 字段 | 填写值 |
| --- | --- |
| recheckIds | 完成时填写安全 ID 列表，否则为空 |
| status | `completed` / `not_completed` |
| outcome | `improved` / `unchanged` / `regressed` / `not_assessed` |
| helpfulness | `helpful` / `not_helpful` / `not_recorded` |

一致性要求：

- `completed` 必须有 Recheck ID、结果和帮助判断。
- `not_completed` 必须使用空 ID、`not_assessed` 和 `not_recorded`。
- 未采用任何 Patch 时，不得记录已完成 Recheck。

## 6. 下一篇需求

执行人只询问：

> 你是否愿意继续用它检查下一篇真实交付内容？

记录：

- [ ] `confirmed`
- [ ] `interested`
- [ ] `none`

不得询问或记录价格、付款承诺或联系方式。

## 7. 有效性与价值信号

执行人确认：

- [ ] 所有 Artifact ID 属于同一 Stage 1 Artifact。
- [ ] 所有决策字段均已记录。
- [ ] Patch 和 Recheck 状态组合一致。
- [ ] 记录中没有自由文本。
- [ ] 记录中没有正文、身份信息或凭证。

由 validator 输出：

| 字段 | 可能结果 |
| --- | --- |
| result | `beta_observation_valid` / `beta_observation_invalid` |
| valueLoop | `value_loop_complete` / `value_loop_incomplete` |

不要手工填写 validator 结论或完整性 SHA-256。

## 8. 中止处理

出现敏感内容、版本不匹配、fallback、技术错误或参与者退出时：

1. 停止该次价值验证。
2. 不补写正向结果。
3. 不保留文章、截图或口头原话。
4. 不将不完整记录标记为 `beta_observation_valid`。
