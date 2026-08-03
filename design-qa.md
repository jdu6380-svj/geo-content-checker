# Design QA

Date: 2026-07-18

Browser: latest stable Chromium through the Codex in-app browser

Scope: Phase 1 global visual system and Phase 2 report productization

## Source Visual Truth

- Primary product direction: `/Users/macbook/Downloads/Gemini_Generated_Image_dmnlibdmnlibdmnl.png`
- Editor detail reference: `/Users/macbook/Downloads/已生成图像 1.png`
- Report summary reference: `/Users/macbook/Downloads/已生成图像 2.png`
- Report diagnosis reference: `/Users/macbook/Downloads/已生成图像 3.png`
- Approved deviation: the implementation is the working enterprise product surface, not the marketing Hero shown in the references.

## Phase 1 Evidence

- Before desktop: `design-qa/phase-1/before/editor-1280x800.png`
- After desktop: `design-qa/phase-1/after/editor-1280x800.png`
- Fresh development-server desktop smoke capture: `design-qa/phase-1/after/editor-final-1280x800.png`
- Before mobile: `design-qa/phase-1/before/editor-390x844.png`
- After mobile: `design-qa/phase-1/after/editor-390x844.png`
- Reference comparison: `design-qa/phase-1/comparisons/editor-reference-after-1280x800.png`
- Before/after comparisons: `design-qa/phase-1/comparisons/editor-before-after-1280x800.png` and `design-qa/phase-1/comparisons/editor-before-after-390x844.png`

## Phase 2 Evidence

- Before desktop: `design-qa/phase-2/before/report-1280x800.png`
- After desktop overview: `design-qa/phase-2/structural-after/report-1440x1024.png`
- After desktop focused state: `design-qa/phase-2/structural-after/report-1280x800.png`
- Before mobile: `design-qa/phase-2/before/report-390x844.png`
- After mobile: `design-qa/phase-2/structural-after/report-390x844.png`
- Latest desktop before/after: `design-qa/phase-2/comparisons/report-structural-before-after-1280x800.png`
- Latest mobile before/after: `design-qa/phase-2/comparisons/report-structural-before-after-390x844.png`
- Latest summary reference comparison: `design-qa/phase-2/comparisons/report-structural-reference-summary-1440x1024.png`
- Latest diagnosis reference comparison: `design-qa/phase-2/comparisons/report-structural-reference-diagnosis-1280x800.png`
- Latest focused diagnosis reference comparison: `design-qa/phase-2/comparisons/report-structural-focused-reference-1280x800.png`

The earlier `after/` and `comparisons/` files remain as intermediate history; the `structural-after/` and `report-structural-*` files are the final Phase 2 evidence.

Phase 2 states:

- Desktop overview: cached report with context rail, master-detail diagnosis and output rail, `1440x1024` CSS viewport.
- Desktop focused state: first diagnostic selected with detail panel visible, `1280x800` CSS viewport.
- Mobile overview: cached report with stacked context, accordion diagnosis and natural page flow, `390x844` CSS viewport.

## Findings

No actionable P0, P1, or P2 findings remain.

- Typography: compact enterprise hierarchy, readable Chinese fallback metrics, zero letter-spacing overrides, and clear report/editor heading contrast.
- Layout: report command bar, context rail, master-detail diagnosis, output rail, evidence and Patch surfaces form a distinct report cockpit with natural page growth.
- Sticky behavior: score rail is `sticky` at desktop with the tokenized offset and returns to normal flow below `1024px`.
- Tokens: restrained background, white Surface, dark text, neutral borders and teal primary action remain consistent across editor and report states.
- Interaction surfaces: diagnostic expansion uses `aria-expanded` and `aria-controls`; loading and error regions use appropriate live-state semantics.
- Content: no marketing Hero, fake KPI, decorative chart, gradient, simulated scanning state, or newly invented analysis conclusion.

## Responsive Verification

| CSS viewport | Result |
| --- | --- |
| 1440 | Desktop report layout and score rail remain stable |
| 1280 | Two-column report layout, sticky score rail, no horizontal overflow |
| 1024 | Two-column layout begins; score rail is sticky with `top: 80px` |
| 1023 | Single-column layout; score rail is static |
| 768 | Tablet layout remains readable with natural document flow |
| 621 | Single-column layout, no horizontal overflow |
| 390 | Single-column layout, static score rail, exact `390x844` capture |

Measured breakpoint checks:

- `1023px`: `documentScrollWidth=1023`, `railPosition=static`.
- `1024px`: `documentScrollWidth=1024`, `railPosition=sticky`, `railTop=80px`.
- `390px`: `documentScrollWidth=390`, `railPosition=static`.

## Interaction Verification

- Cached report reload and return-to-editor flow: passed.
- Diagnostic expansion: `aria-expanded` changes `false -> true`; focused content height is stable after transition.
- Report anchor offset: tokenized scroll margin verified against the header offset.
- Sample loading, overwrite confirmation, date selection, submission loading and fallback success: passed in the Phase 1 regression pass.
- Patch loading, success, full Markdown copy and copy feedback: passed in the Phase 2 interaction pass.
- Browser console: no current Webpack runtime error; the former `__webpack_modules__[moduleId] is not a function` error is gone after rebuilding `.next` cleanly.
- Keyboard order contains no custom positive `tabindex`; visible controls retain native focus order.

## Automated Checks

- `npm run check`: passed.
- `npm run build`: passed with Next.js 15.5.20.
- `GEO_BASE_URL=http://127.0.0.1:3001 npm run blackbox:fallback`: passed, 15/15 checks.
- `git diff --check`: passed after the final report write.

## Comparison History

### Phase 1

- Unified the editor frame, application header, controls, status styling, sample library and responsive workspace rhythm.
- Replaced an initially incorrect full-page mobile artifact with an exact viewport capture.
- Re-captured desktop evidence after exposing the in-app browser so the physical image dimensions matched the CSS viewport.

### Phase 2

- Extracted report presentation responsibilities into `ReportWorkspace`, `ReportScoreRail`, `DiagnosisSection` and `DiagnosticAccordionItem` without changing business state or API contracts.
- Replaced the distorted `390x844` after artifact with a live exact viewport capture; verified physical dimensions with `sips`.
- Re-captured the expanded diagnostic after waiting for the grid transition and verified `aria-hidden="false"` and a non-zero content height.
- Compared both report references and focused diagnosis content against the rendered implementation on shared canvases.

## P3 Notes

- The circular Next.js development indicator appears in local screenshots and is absent from production.
- Safari and Firefox full interaction checks remain a later cross-browser checkpoint; Chromium is the visual baseline for this phase.
- Reference images contain marketing content intentionally excluded by the approved working-product scope.
- Repeated local reloads can return the expected in-memory warmup rate-limit response; this does not affect the fallback black-box result.

## D.0.8.1 Visual Simplification

- QA date: 2026-08-03.
- Baseline commit: `11c1ca61328611d84ea7b57aed2d4d9363612f62`.
- Visual reference: `codex-clipboard-8cbf0bea-c4c5-44a4-a1cf-781aa2303e21.png`.
- Scope remained UI / Presentation Layer only.

Visual changes:

- Reduced the homepage to title, body, examples and one primary review action.
- Hid the publication date from the UI while preserving `publishedAt` and the request contract.
- Removed the duplicate report chapter rail while retaining Score Ring, risk, Evidence, Diagnosis, Patch and Recheck.
- Replaced repeated status explanations with concise Chinese states: 有效、缺失、无效.
- Removed duplicate diagnosis numbering and reduced nested Card, Shadow and Badge treatments.
- Preserved Advice, Content Draft and Recheck semantics, including required human review.

Verification:

| Viewport | Homepage | Report | Horizontal overflow | Clipped buttons |
| --- | --- | --- | --- | --- |
| 1440×900 | PASS | PASS | 0 | 0 |
| 1280×800 | PASS | PASS | 0 | 0 |
| 390×844 | PASS | PASS | 0 | 0 |

- Mobile primary CTA measured `328×44`.
- Empty submission displayed both field errors and restored focus to the title input.
- Form controls retain native DOM order with no positive `tabindex`.
- Evidence, expanded Diagnosis and Patch remained readable without horizontal overflow.
- Recheck result remained factual: Baseline `75`, New Result `80`, 改善 `0`, 无变化 `5`, 下降 `0`, 不可比较 `0`.
- Browser console reported zero application errors and zero application warnings.
- `npm run check`, `npm run build` and `git diff --check` passed.
- Local screenshots are stored in the Git-ignored `design-qa-artifacts/` directory.
- Pipeline, API, Schema, Parser, Evidence validator, Scoring, Prompt, Model, Fallback and B.2 Validation artifacts were not modified.

## Result

final result: passed
