# Evidra D.1 High Fidelity UI Reconstruction — Design QA

## 视觉真值

- 最终参考图：`/var/folders/d6/wwcsfb6j1ksd8x7ghrc88gbm0000gn/T/codex-clipboard-da3e5eb1-fb4d-45af-b267-e8f6ed917b87.png`
- 参考内容：Diagnosis、Evidence、Patch、Report、Feedback 的 Desktop / Mobile 组合视觉稿。
- 比较范围：布局比例、导航结构、视觉重量、卡片密度、阅读顺序、留白、按钮层级与移动端重排。
- 实现约束：仅使用现有真实 Score、Risk、Evidence、Finding、Diagnosis 与 Patch 数据；未补造参考图中的固定分数、历史、账户、下载或人工服务。

## 阶段截图

### Phase 1 — Diagnosis

- Desktop `1440 × 900`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase1-diagnosis-1440x900.png`
- Mobile `390 × 844`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase1-diagnosis-390x844.png`
- 对照图：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase1-diagnosis-compare-final.png`
- 结果：桌面形成工作台导航、问题目录、诊断正文与辅助行动四段层级；移动端默认展开首项详情，保持“为什么重要 → 依据 → 如何优化 → 操作”的阅读路径。

### Phase 2 — Evidence

- Desktop `1440 × 900`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase2-evidence-1440x900.png`
- Mobile `390 × 844`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase2-evidence-390x844.png`
- 对照图：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase2-evidence-compare-v1.png`
- 结果：形成 Evidence 分类目录、判断卡片与可信度辅助栏；每项保留 Evidence ID、判断问题、原文依据、判断原因和建议动作。

### Phase 3 — Patch

- Desktop `1440 × 900`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase3-patch-1440x900.png`
- Desktop `1280 × 800`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase3-patch-1280x800.png`
- Mobile `390 × 844`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase3-patch-390x844.png`
- 对照图：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase3-patch-compare-v1.png`
- 结果：桌面采用原文 / 修改建议双栏；移动端将已生成建议置于原文之前。真实降级流程生成 `8` 项材料，切换 Report 后返回 Patch，生成结果仍保持。

### Phase 4 — Report

- Desktop `1440 × 900`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase4-report-1440x900.png`
- Desktop `1280 × 800`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase4-report-1280x800.png`
- Mobile `390 × 844`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase4-report-390x844.png`
- 对照图：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase4-report-compare-v1.png`
- 结果：首屏优先呈现大型 Score Ring、风险结论、下一步行动、Top 3 风险与四项评分，避免旧版长页 Dashboard 的信息平铺。

### Phase 5 — Feedback

- Mobile `390 × 844`：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase5-feedback-390x844.png`
- 对照图：`/Users/macbook/Documents/Codex/2026-07-13/ai-agent-hr-ai-ai-ai/artifacts/d1/phase5-feedback-compare-v1.png`
- 结果：保留两个开放输入区、邮箱、绿泡泡 `Du-jQ7` 与 Beta 福利说明；未创建假提交、账号、支付或额度能力。

## 视觉一致性结论

- Diagnosis、Evidence、Patch、Report 使用同一 Header、Sidebar、主工作区和辅助栏体系。
- 桌面主体比例与参考稿一致地强调内容工作区，而非营销 Hero 或数据后台。
- 背景使用 `#F8FAFC`，Surface 使用白色，品牌紫负责主操作；Evidence 蓝、风险橙、成功绿和危险红只承担状态语义。
- 页面标题、模块标题和正文层级分别稳定在约 `28–32px`、`18–22px`、`14–16px`。
- Surface 圆角保持 `8–12px`，阴影克制；列表和分隔线优先于嵌套 Card。

## 交互与真实数据

- 新文章通过现有 fallback 流程完成审查，报告真实返回 `64 / 100`、高风险、`5` 项诊断与 `5` 条逐字引用。
- 修改建议通过现有 `生成修改建议` 操作真实生成，没有写入固定参考数据。
- 报告、依据、诊断和修改使用纯展示视图切换；组件保持挂载，因此切页不丢失 Patch 生成状态。
- 移动端提供报告 / 依据 / 诊断 / 修改子导航，并保留现有全局流程状态机。
- 浏览器控制台在 Report 与 Feedback 测试会话中均为 `0` 条 error。

## 响应式验证

- `1440 × 900`：Report、Evidence、Diagnosis、Patch 均 `scrollWidth = 1440`，无页面横向溢出。
- `1280 × 800`：Report、Evidence、Diagnosis、Patch 均 `scrollWidth = 1280`，无页面横向溢出。
- `390 × 844`：Report、Evidence、Diagnosis、Patch 均 `scrollWidth = 390`，无页面横向溢出。
- Feedback 在 `1440 × 900`、`1280 × 800`、`390 × 844` 下分别保持与视口相同的 `scrollWidth`。
- 移动端 Patch 已确认建议区域优先出现，底部工作流导航不遮挡主要操作内容。

## 已修正问题

- P1：旧 Report 以长页方式同时展示全部模块，首屏视觉焦点不足。已改为 overview / evidence / diagnosis / patch 工作区视图。
- P1：移动端 Patch 原文先于建议，无法快速看到行动结果。已改为建议优先、原文随后。
- P2：切换工作区视图可能卸载 Patch 并丢失生成结果。已改为保持组件挂载并通过展示状态切换。
- P2：移动端缺少报告内快速导航。已加入四项紧凑子导航并验证无横向溢出。

## 有意保留的差异

- 参考稿中的固定 `72 / 100` 仅用于视觉比例；实现始终渲染现有真实评分。
- 参考稿中的问题数量、维度数量与示例文案不替换现有 Schema 输出。
- 不实现历史、账户、下载报告、人工审核、自动应用修改或其他不存在的业务能力。
- 组合参考图不是逐页面独立像素源，因此精确像素差异属于后续 P3，而非当前阻塞项。

## D.2 Pixel Fidelity Pass

### 页面级对照

- Homepage：`artifacts/d2/p0-home-final-1440x900.png`；对照图 `artifacts/d2/p0-home-compare-final.png`。首屏编辑画布、标题区和 Context Panel 比例完成校准。
- Report：`artifacts/d2/p1-report-after-1440x900.png`；对照图 `artifacts/d2/p1-report-compare-final.png`。Score Ring、风险结论和 Top 3 成为首屏主视觉。
- Evidence：`artifacts/d2/p2-evidence-after-1440x900.png`；对照图 `artifacts/d2/p2-evidence-compare-final.png`。阅读链路固定为“判断问题 → 原文证据 → 判断依据 → 当前状态 → 建议动作”。
- Diagnosis：`artifacts/d2/p3-diagnosis-after-1440x900.png`；对照图 `artifacts/d2/p3-diagnosis-compare-final.png`。三栏比例、独立诊断卡片和行动区完成收敛。
- Patch：`artifacts/d2/p4-patch-after-1440x900.png`；对照图 `artifacts/d2/p4-patch-compare-final.png`。原文与修改建议调整为等宽独立画布，建议区降低大面积绿色背景，仅保留状态语义。

### 响应式与浏览器验证

- `1440 × 900`：Report、Evidence、Diagnosis、Patch 的 `scrollWidth` 均为 `1440`。
- `1280 × 800`：Report、Evidence、Diagnosis、Patch 的 `scrollWidth` 均为 `1280`；Patch 截图为 `artifacts/d2/qa-patch-1280x800.png`。
- `390 × 844`：Homepage、Report、Evidence、Diagnosis、Patch 的 `scrollWidth` 均为 `390`。
- 移动端最终截图：`artifacts/d2/qa-home-390x844-final.png`、`artifacts/d2/qa-report-390x844.png`、`artifacts/d2/qa-evidence-390x844-final.png`、`artifacts/d2/qa-diagnosis-390x844.png`、`artifacts/d2/qa-patch-390x844.png`。
- 修复后 Homepage Context Panel 不再保留桌面 `400px` 最小列宽；Evidence 后置桌面三栏规则不再覆盖移动端单栏。
- 最终度量与控制台记录：`artifacts/d2/qa-metrics.json`；页面控制台 error 数量为 `0`。

### 工程验证

- `npm run check`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- 本轮仅调整 UI Layer 的组件组合与视觉样式；未改动 API、Pipeline、Schema、Parser、Evidence 数据结构、Scoring、Prompt、Model 或 Fallback。

## UI Reconstruction Phase 1 — 七态高保真复核

### Target UI 映射

- Dashboard 首页：`/Users/macbook/Downloads/Evidra/034f6c2bfc8cbcc34c780be07ceb3e97.png`
- 文件上传完成：`/Users/macbook/Downloads/Evidra/1f840101-de79-4f1d-acd9-59ecb99138b6.png`
- AI 分析过程：`/Users/macbook/Downloads/Evidra/1b238d79-f3a6-440a-88ce-3beec4dd1686.png`
- 邀请好友 Modal：`/Users/macbook/Downloads/Evidra/5dd9ef8e-a67f-40bd-9c33-c78f12982395.png`
- 通知 Dropdown：`/Users/macbook/Downloads/Evidra/20376a59-6e09-4483-bdd7-f22728b313c8.png`
- 用户菜单 Dropdown：`/Users/macbook/Downloads/Evidra/bf357ce0-739d-4b20-a23c-6320e5206c3a.png`
- 粘贴正文状态：`/Users/macbook/Downloads/Evidra/d4acba55-2931-4c48-8987-3391da1fe932.png`

### 最终运行截图

- Dashboard：`artifacts/ui-reconstruction-phase1/dashboard-1280x720-v2.png`
- 文件上传完成：`artifacts/ui-reconstruction-phase1/upload-complete-1280x720-v2.png`
- AI 分析过程：`artifacts/ui-reconstruction-phase1/analysis-progress-1280x720-v2.png`
- 邀请好友 Modal：`artifacts/ui-reconstruction-phase1/invite-modal-1280x720-v2.png`
- 通知 Dropdown：`artifacts/ui-reconstruction-phase1/notifications-1280x720-v2.png`
- 用户菜单 Dropdown：`artifacts/ui-reconstruction-phase1/account-menu-1280x720-v2.png`
- 粘贴正文状态：`artifacts/ui-reconstruction-phase1/paste-editor-1280x720-v2.png`

### 尺寸与层级校准

- 邀请 Modal 实测 `500 × 650`，与 Target 相同；遮罩、邀请链接、三种分享方式和邀请记录保持同一阅读顺序。
- 通知 Dropdown 实测 `480 × 375`，Target 约为 `480 × 378`；三条通知、语义色图标、时间和底部入口完成对齐。
- 用户菜单实测 `228 × 379`，Target 约为 `228 × 376`；Profile、四个菜单项和退出操作保持目标比例。
- 粘贴编辑器实测高度 `322px`，工具栏为 `8` 项；提交按钮位于编辑器底栏，标题和字数均可回到真实空状态。
- 分析卡片实测高度 `724px`，Target 约为 `722px`；四阶段进度、Evidence 检查 Surface、任务列表和提示保持目标视觉重量。
- Header、Sidebar、Card、Button、Modal、Dropdown、Typography 和 Color Token 均复用同一套 Phase 1 视觉规则。

### 真实交互与冻结边界

- 文件完成态通过浏览器真实选择本地 `.docx` 文件触发，没有写入固定上传成功状态。
- AI 分析态通过现有提交和 fallback 分析链路触发，没有伪造 Score、Evidence、诊断或完成结果。
- 邀请、通知和用户菜单保持纯 UI 展示与现有切换逻辑；未接入账户、支付、历史或新的服务能力。
- 本轮未修改 API、Pipeline、Schema、Parser、Evidence 数据结构、Scoring、Prompt、Model 或 Fallback。
- 浏览器控制台 error 数量为 `0`。

### 工程验证

- `npm run check`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。

## Evidra Phase 2 Report System Implementation

### Target UI 映射

- Report Overview：`/var/folders/d6/wwcsfb6j1ksd8x7ghrc88gbm0000gn/T/codex-clipboard-85267e5c-4d57-40c7-a1aa-e931577922d6.png`
- Evidence Analysis：`/var/folders/d6/wwcsfb6j1ksd8x7ghrc88gbm0000gn/T/codex-clipboard-f4ab6aee-b8cc-4dea-a9e5-2c8d57bf75da.png`
- Diagnosis：`/var/folders/d6/wwcsfb6j1ksd8x7ghrc88gbm0000gn/T/codex-clipboard-cf035672-43b5-4e07-9cfc-b04541022b81.png`
- Patch Recommendation：`/var/folders/d6/wwcsfb6j1ksd8x7ghrc88gbm0000gn/T/codex-clipboard-09513fc0-6e41-42c6-8568-ed630bd26cff.png`
- Recheck Result：`/var/folders/d6/wwcsfb6j1ksd8x7ghrc88gbm0000gn/T/codex-clipboard-ee87a03e-325c-468b-a156-83a6125b5931.png`
- Final Report Summary：`/var/folders/d6/wwcsfb6j1ksd8x7ghrc88gbm0000gn/T/codex-clipboard-ebb0a445-eb56-40b6-b3dc-97f55d750ab1.png`

### 页面与组件落地

- 保留 Phase 1 Header、Sidebar 与 App Shell，新增 Report 内部五段导航与最终报告汇总。
- Overview 复用真实 Score、维度评分、风险与 Evidence 状态，采用 Target 的两列 Hero、维度卡与右侧报告导航比例。
- Evidence 使用文章正文与 Evidence Panel 双栏结构；Diagnosis 使用摘要、筛选与横向问题记录；Patch 使用 Original / Suggested Patch 双栏。
- Recheck 展示 Before / After、三项指标变化与改进总结；最终汇总连接 Evidence、Diagnosis、Patch、Recheck 四个真实视图。
- 分数下降或持平时，Recheck 与最终汇总会显示对应趋势文案和状态色，不再误显示“提升”。

### 截图与视觉对照

- Desktop `1440 × 900`：`artifacts/phase2-report-system/overview-qa-1440x900.png`、`evidence-qa-1440x900.png`、`diagnosis-qa-1440x900.png`、`patch-qa-1440x900.png`、`recheck-qa-1440x900.png`、`final-summary-qa-1440x900.png`。
- Target / Implementation 对照：`compare-overview-qa.png`、`compare-evidence-qa.png`、`compare-diagnosis-qa.png`、`compare-patch-qa.png`、`compare-recheck-qa.png`、`compare-final-summary-qa.png`。
- Desktop `1280 × 800` 与 Mobile `390 × 844` 均完成六个状态截图；移动端汇总图为 `mobile-contact-sheet-qa.png`。
- 三档视口所有页面 `scrollWidth === clientWidth`，无页面横向溢出；详细数据记录于 `artifacts/phase2-report-system/qa-metrics.json`。

### 交互闭环与真实数据

- 浏览器实际完成：粘贴正文 → Mock 分析 → Overview → Evidence → Diagnosis → 生成 Patch → 应用建议 → 修改正文 → Recheck → Final Summary。
- 所有 Score、Risk、Evidence、Finding 与维度分数来自现有 Mock / fallback 数据，没有写死参考图中的固定数值或问题文案。
- 当前 `http://localhost:3001` 在 `1440 × 900`、`1280 × 800`、`390 × 844` 会话中均为 `0` 条 console warning/error。
- 未修改 API、Pipeline、Schema、Parser、Evidence 数据结构、Scoring、Prompt、Model、Fallback 或 Phase 1 分析状态流程。

### 有意保留的差异

- Target 中固定分数、风险数量、Evidence 状态与示例文章仅作为视觉数据，不替换现有 Mock 输出。
- Final Summary 参考图中的导出 PDF、分享报告等不存在能力未实现。
- Phase 1 Header、Sidebar 的品牌与账户展示保持现状，没有为 Phase 2 重新设计 App Shell。

### 工程验证

- `npm run check`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。

## Evidra Phase 2.1 Visual Alignment Pass

### Target / Implementation 对照

- Report Overview：`artifacts/phase2-report-system/phase21-overview-target-vs-implementation.png`。
- Evidence Analysis：`artifacts/phase2-report-system/phase21-evidence-target-vs-implementation.png`。
- Diagnosis：`artifacts/phase2-report-system/phase21-diagnosis-target-vs-implementation.png`。
- Patch Recommendation：`artifacts/phase2-report-system/phase21-patch-target-vs-implementation.png`。
- 所有对照均使用 `1440 × 900` 同尺寸截图，左侧为 Target，右侧为当前 Implementation。

### 视觉对齐结论

- Overview 将评分、风险与结论拆成稳定的首屏层级，维度卡高度、右侧 Report Navigation 和页面留白接近 Target。
- Evidence 保持文章 / Evidence Panel 双栏比例，强化主 Evidence 卡，并让 Claim、Evidence、Source、Confidence 保持可扫描的标签和值层级。
- Diagnosis 强化风险等级、筛选激活态与问题行层级；真实数据为全高风险时仍沿用现有状态，不替换 Target 示例分布。
- Patch 使用真实优先段落作为 Original 上下文，Suggested Patch 区分主建议和紧凑建议，保持修改前后对比感。
- Header、Sidebar、全局颜色、字体和 Phase 1 Design Language 未调整。

### 响应式与浏览器验证

- `1440 × 900`：四个页面完成浏览器截图与同尺寸视觉比较。
- `1280 × 800`：页面 `scrollWidth === clientWidth`，无横向溢出。
- `390 × 844`：页面 `scrollWidth === clientWidth`，无横向溢出。
- 浏览器控制台仅包含 React DevTools 与 Fast Refresh 信息，error 数量为 `0`。

### 工程验证

- `npm run check`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- 本轮仅修改 UI Layer；未修改业务逻辑、数据结构、分析流程或冻结范围。

## Evidra Phase 3 Interaction Layer

### 交互实现

- Evidence Card 支持展开与收起，展开内容覆盖 Claim、Evidence、Source、Confidence 与 Detail；来源操作会平滑定位到对应原文段落。
- Diagnosis 问题行支持展开，详情展示原文位置、问题原因、判断依据与处理建议，并复用现有 Evidence / Patch 页面导航。
- Patch 建议支持逐项应用、已应用状态与数量汇总；应用至少一项后开放“进入重新验证”，复用现有人工修改与 Recheck 流程。
- 保持现有 Mock 数据、Phase 2 页面结构和 Design System，不自动改写正文，不改变分析流程或数据结构。

### 浏览器验证

- Evidence 展开 / 收起与原文定位：通过。
- Diagnosis 展开、Evidence 跳转、Patch 跳转：通过。
- Patch 生成、应用状态、已应用计数：通过。
- Patch → 编辑器重新验证入口 → Recheck 页面：通过。
- Recheck 在正文未重新分析时正确显示“尚未生成新的复检结果”，未伪造比较结果。
- 浏览器控制台无应用 warning/error；仅记录 React DevTools 与 Fast Refresh 开发信息。

### 截图

- `artifacts/phase3-interaction/evidence-expanded.png`
- `artifacts/phase3-interaction/diagnosis-expanded.png`
- `artifacts/phase3-interaction/patch-applied.png`
- `artifacts/phase3-interaction/recheck-entry.png`
- `artifacts/phase3-interaction/recheck-page.png`

### 工程验证

- `npm run check`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- 本轮仅修改 UI Layer；未修改 API、数据结构、Pipeline、Scoring、Prompt、Model、Fallback 或分析状态机。

## Evidra Phase 3.1 Motion Polish

### P0 动效

- Report Score 在评分区域进入可视范围后递增，浏览器采样序列为 `0 → 13 → 29 → 38 → 45 → 50 → 52 → 53`。
- Recheck Before / Change / After 使用错峰数值动画，浏览器采样确认 Before、变化值与 After 连续过渡至最终结果。
- Patch 应用后触发卡片状态过渡、完成图标反馈与 Recheck 操作条进入动画，保持人工确认业务含义不变。

### P1 交互反馈

- Report、Evidence、Diagnosis、Patch、Recheck 核心卡片增加仅限鼠标设备的轻量 Hover 提升。
- 主要按钮增加 Hover 与 Active 反馈，Active 实测缩放矩阵约为 `0.98`。
- Sidebar 项目增加颜色、位移与图标的平滑过渡。
- Notification、Account Dropdown 与 Invite Modal 增加克制的进入动画。
- `prefers-reduced-motion` 下禁用装饰动画，数字直接显示最终值。

### 浏览器与截图

- `output/playwright/phase31-recheck-motion.png`
- `output/playwright/phase31-patch-applied-motion.png`
- `output/playwright/phase31-modal-motion.png`
- Desktop `1440 × 900` 完成视觉复核，无布局变化或内容遮挡。
- 浏览器控制台 error `0`、warning `0`。

### 工程验证

- `npm run check`：通过。
- `npm run build`：通过。
- `git diff --check`：通过。
- 本轮仅修改 React UI 与 CSS Motion；未修改 API、数据结构、分析流程或业务状态机。

final result: passed
