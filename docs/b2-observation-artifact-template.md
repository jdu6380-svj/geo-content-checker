# B.2 Observation Artifact 模板

## 1. 模板用途

以下 JSON 是 `B2ControlledBetaObservationInput` 的填写模板。

模板中的 `not_recorded` 表示尚未完成记录，因此模板本身不是有效观察。测试结束后必须替换为真实枚举值，并由现有 B.2 validator 校验。

最终 Artifact 的 `integrity.payloadSha256` 必须由 validator 生成，不得手工计算后覆盖。

## 2. 输入模板

```json
{
  "observationId": "B2-O001",
  "participant": {
    "anonymousId": "B2-U001",
    "profile": "independent_content_consultant",
    "monthlyArticleVolume": "4_7"
  },
  "article": {
    "artifactId": "INPUT-ARTIFACT-ID",
    "contentType": "professional_article",
    "useCase": "client_delivery_prepublication",
    "realDelivery": true
  },
  "evidenceTrust": {
    "reviewedEvidenceIds": [
      "E001"
    ],
    "recognition": "not_recorded",
    "usefulness": "not_recorded"
  },
  "patchAdoption": {
    "reviewedPatchIds": [
      "PATCH-ARTIFACT-ID"
    ],
    "adoptedPatchIds": [],
    "adoptedProblemIds": [],
    "status": "not_recorded",
    "adoptionCodes": []
  },
  "recheck": {
    "recheckIds": [],
    "status": "not_recorded",
    "outcome": "not_assessed",
    "helpfulness": "not_recorded"
  },
  "nextArticle": {
    "demand": "not_recorded"
  }
}
```

## 3. 允许值

### 参与者

- `monthlyArticleVolume`：
  - `4_7`
  - `8_12`
  - `13_20`

### 文章

- `contentType`：
  - `public_account`
  - `blog_longform`
  - `professional_article`

### Evidence

- `recognition`：
  - `recognized`
  - `rejected`
  - `not_recorded`
- `usefulness`：
  - `valuable`
  - `not_valuable`
  - `not_recorded`

### Patch

- `status`：
  - `adopted`
  - `partially_adopted`
  - `not_adopted`
  - `not_recorded`
- `adoptionCodes`：
  - `evidence_supported`
  - `actionable_change`
  - `client_requirement`
  - `meaning_risk`
  - `effort_too_high`
  - `not_relevant`

### Recheck

- `status`：
  - `completed`
  - `not_completed`
  - `not_recorded`
- `outcome`：
  - `improved`
  - `unchanged`
  - `regressed`
  - `not_assessed`
- `helpfulness`：
  - `helpful`
  - `not_helpful`
  - `not_recorded`

### 下一篇需求

- `demand`：
  - `confirmed`
  - `interested`
  - `none`
  - `not_recorded`

## 4. 状态一致性

| Patch 状态 | adoptedPatchIds | adoptedProblemIds | adoptionCodes |
| --- | --- | --- | --- |
| `adopted` | 非空，数量等于 reviewedPatchIds | 非空且属于采用 Patch | 至少一个 |
| `partially_adopted` | 非空，数量少于 reviewedPatchIds | 非空且属于采用 Patch | 至少一个 |
| `not_adopted` | 空数组 | 空数组 | 至少一个 |

| Recheck 状态 | recheckIds | outcome | helpfulness |
| --- | --- | --- | --- |
| `completed` | 非空且关联已采用 Patch | 非 `not_assessed` | 非 `not_recorded` |
| `not_completed` | 空数组 | `not_assessed` | `not_recorded` |

## 5. 引用规则

- `article.artifactId` 必须等于同一 Stage 1 Artifact 的 Input Artifact ID。
- Evidence ID 必须存在于同一 Stage 1 Artifact。
- Patch ID 必须存在于同一 Stage 1 Artifact。
- adopted Problem ID 必须属于实际采用的 Patch。
- Recheck ID 必须属于实际采用的 Patch。
- ID 只允许字母、数字、下划线、点、冒号和连字符，最长 128 字符。
- 不得跨文章、跨参与者或跨会话拼接引用。

## 6. 禁止加入模板

不得增加：

- 用户正文或修改后正文。
- 标题、客户名称、公司名称、姓名、邮箱或联系方式。
- Prompt、Evidence 原文、问题正文或模型完整输出。
- API Key、Authorization、Cookie、Token 或环境变量。
- 自由文本评价、逐字引语或截图路径。

需要解释用户决策时，只使用已批准的枚举代码。
