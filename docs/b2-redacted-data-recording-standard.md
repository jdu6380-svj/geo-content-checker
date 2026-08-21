# B.2 脱敏数据记录规范

## 1. 目的

本规范适用于 B.2 Controlled Beta 的测试准备、执行、记录、校验、保存和汇总。

原则：

- 数据最小化。
- 正文与观察记录分离。
- 只记录完成 B.2 判定所需的结构化状态。
- 不因分析便利扩大采集范围。

## 2. 数据分类

### A 类：仅在 Preview 正常流程中临时处理

- 用户文章正文。
- 修改后的正文。
- Evidence 原文。
- 问题、Advice 和 Patch 正文。
- 模型响应正文。

A 类数据不得复制到测试记录、Codex 任务、Git、邮件、聊天、截图、录屏或共享文档。

### B 类：允许进入 Observation Artifact

- 匿名参与者 ID。
- Observation ID。
- Analysis、Evidence、Problem、Advice、Patch 和 Recheck Artifact ID。
- 目标画像状态。
- 月处理量区间。
- 内容类型和真实交付布尔值。
- Evidence、Patch、Recheck 和下一篇需求的枚举状态。
- Artifact 关联关系。
- Schema 版本、流程状态、校验结果。
- SHA-256 完整性摘要。

### C 类：禁止采集

- 姓名、昵称、公司、客户名称。
- 邮箱、手机号、社交账号或地址。
- 文章标题、正文、摘录或修改前后差异。
- Prompt、Evidence 原文、问题正文或模型完整输出。
- API Key、Authorization Header、Cookie、Token、环境变量。
- 浏览器存储、网络请求正文或完整 Runtime Log。
- 含上述内容的截图、录屏、会议转写或逐字引语。

## 3. 匿名 ID 规则

使用无语义序号：

- 参与者：`B2-U001`
- Observation：`B2-O001`

不得将姓名缩写、公司缩写、客户名、文章标题、邮箱、手机号或日期编码进 ID。

参与者与匿名 ID 的对应关系不建立、不保存。

## 4. Artifact ID 规则

- 仅使用同一 Stage 1 Artifact 已存在的 ID。
- 不从正文、标题或身份信息派生 ID。
- 不跨参与者、文章或会话复用关系。
- 不手工编造缺失 Evidence、Problem、Patch 或 Recheck ID。
- 无法验证关联时，将观察保持为不完整，不降低校验标准。

## 5. SHA-256 使用规则

SHA-256 仅用于：

- Artifact 完整性校验。
- 已批准 Artifact 之间的关系确认。

不得用于：

- 将姓名、邮箱、手机号或客户名称“哈希后保存”。
- 将整篇用户正文哈希后作为长期用户标识。
- 替代访问控制或数据删除。

低熵身份信息即使哈希后仍可能被反推，因此禁止进入记录。

## 6. 采集方式

允许：

- 执行人根据参与者行为选择预定义枚举值。
- 记录同一 Stage 1 Artifact 中的安全 ID。
- 由现有 validator 生成状态、问题代码和完整性摘要。

禁止：

- 自由文本反馈。
- 用户逐字引语。
- 粘贴文章或模型结果。
- 截图、录屏或会议自动转写。
- 导出浏览器 Cookie、Local Storage 或网络请求正文。
- 将凭证写入终端历史或测试文档。

## 7. 保存位置

Observation Artifact 不得保存到：

- Git 仓库或 Commit。
- `output/`、构建产物或公开下载目录。
- Codex 任务、Issue、PR 评论或聊天。
- 邮件正文、即时通信或公开表格。

使用经负责人批准的本地加密目录保存，每个文件只包含一个校验后的 Observation Artifact。

文件名只使用 Observation ID，例如：

`B2-O001.json`

文件名不得包含参与者、公司、客户或文章信息。

## 8. 访问与共享

- 只向 B.2 验收所需人员开放。
- 分享汇总时只提供计数、比例和状态分布。
- 不分享单个用户的可识别路径。
- 不向模型、第三方分析工具或未批准服务上传 Observation Artifact。
- 不通过 URL 查询参数传递任何 Artifact 内容。

## 9. 保留与删除

- 单用户 Observation Artifact 最长保留 90 天，用于当前 B.2 验证窗口。
- 形成脱敏汇总后删除不再需要的单用户 Artifact。
- 参与者退出或要求删除时，删除对应匿名 Observation，不保留映射副本。
- 测试中产生的临时笔记应在 Artifact 校验完成后立即删除。

## 10. 保存前检查

每个 Artifact 保存前必须确认：

- [ ] 只包含允许字段。
- [ ] 不包含正文、标题、原文或自由文本。
- [ ] 不包含身份信息。
- [ ] 不包含 Prompt、模型正文或 Evidence 原文。
- [ ] 不包含 API Key、Authorization、Cookie、Token 或环境变量。
- [ ] 所有 ID 符合安全格式。
- [ ] 所有关联来自同一 Stage 1 Artifact。
- [ ] validator 校验通过。
- [ ] 完整性 SHA-256 匹配。
- [ ] 文件位置不在 Git 仓库或公开目录。

任一项失败，不保存 Artifact。

## 11. 误采集处理

发现禁止数据进入临时记录时：

1. 立即停止继续复制或传播。
2. 删除包含禁止数据的临时副本。
3. 不通过聊天或 Issue 发送内容进行排查。
4. 当前 Observation 不得标记为有效。
5. 只保留不含用户数据的流程阻塞状态，等待负责人处理。

不得通过增加采集、修改 Schema 或关闭校验来恢复该次 Observation。

## 12. Privacy PASS 判定

同时满足以下条件才可判定 Privacy PASS：

- Artifact 只含匿名 ID、枚举状态、关系和完整性摘要。
- 禁止字段扫描通过。
- 敏感值检查通过。
- Artifact 关系与完整性检查通过。
- 保存位置和访问范围符合本规范。

Privacy PASS 不等于 B.2 价值闭环成功，两者必须分别报告。
