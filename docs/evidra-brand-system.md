# Evidra Brand System

> D.0.1 baseline: `249a9b2264d0bf72b3e7f0b2a0ac930a00ed665f`
> Status: Approved implementation direction

## Positioning

**English:** Evidra is an AI evidence review platform for trustworthy content in the AI search era.

**中文：** Evidra 是面向 AI 搜索时代的内容可信度审查平台。

Evidra is a professional review workspace, not a general AI writing tool. It helps editorial teams inspect whether a piece of content is understandable, sufficiently supported, and ready for human revision before publication.

## Product Promise

**让关键判断有据可查。**

Evidra makes the relationship between a diagnosis, its source evidence, the remaining information gap, and the next editorial action visible. It does not promise ranking, traffic, citation, or automatic factual correctness.

## Product Keywords

- Evidence-first
- Traceable
- Editorial
- Transparent
- Bounded
- Professional

## Naming

- Product name: `Evidra`
- Chinese category: `AI 内容可信度审查`
- English category: `AI Evidence Review`
- Long descriptor: `面向 AI 搜索时代的内容可信度审查平台`
- `GEO` remains a domain term for the score and review method. It is not part of the product name.
- Do not use legacy product names, `Evidra GEO`, or generic labels such as `AI 分析工具` as the product name.

## Logo Direction: Evidence Ledger

The mark combines three ideas in one compact symbol:

1. The vertical spine and three rows form the letter `E`.
2. The rows represent evidence records in an editorial ledger.
3. The three signal nodes represent traceability from claim to source.

The mark must remain flat, legible, and unanimated. Do not add gradients, glow, AI spark effects, or decorative depth.

### Usage

- Minimum digital size: `24px`.
- Preferred app-shell size: `36px`.
- Keep clear space equal to at least one evidence-node diameter around the mark.
- Use the full mark with the `Evidra` wordmark in navigation and legal surfaces.
- The mark may appear alone only for favicon, compact mobile controls, or clearly established app context.

## Color System

| Token | Value | Role |
| --- | --- | --- |
| Evidra Ink | `#17201F` | Wordmark, primary text, mark surface |
| Evidence Green | `#0F766E` | Verified evidence, primary action |
| Evidence Node | `#31A99B` | Logo signal nodes, small proof accents |
| Workflow Indigo | `#5964CF` | Recheck and workflow comparison |
| Proof Blue | `#416B8A` | Source structure and informational state |
| Caution Amber | `#A86313` | Missing evidence and review caution |
| Critical Coral | `#C85745` | Invalid evidence, failure, high risk |
| Canvas | `#F7F9FB` | Product workspace background |
| Surface | `#FFFFFF` | Primary working surface |

Color is always paired with text or an icon for status communication. Evidence Green is not used as decoration; it means verification, readiness, or a primary command.

## Typography

- Interface and Chinese content use the system sans stack for predictable rendering and privacy-safe loading.
- The `Evidra` wordmark uses the same sans stack at a heavier weight, with zero letter spacing.
- Scores, paragraph IDs, request IDs, and comparable metrics use the data/monospace stack.
- Display type is reserved for the product title and report headline. Compact panels use smaller, tighter headings.
- Letter spacing remains `0`; hierarchy comes from weight, size, spacing, and contrast.

## Voice

Evidra is direct, evidence-led, and careful about uncertainty.

- Say: `证据已验证`, `缺少证据`, `需要人工复核`, `重新验证`。
- Avoid: `自动改稿`, `保证提升`, `绝对可信`, `一键优化`。
- Explain what the system observed, what evidence supports it, and what remains a human decision.

## Experience Principles

1. Evidence is visible before persuasion.
2. Risk is explicit, not dramatized.
3. AI progress is transparent, not theatrical.
4. Every generated material has a stated boundary and next action.
5. The interface behaves like a professional review workspace, not a marketing landing page.

## Frozen Product Boundary

D.0.1 changes brand expression only. Pipeline, API, Schema, Parser, Evidence validation, Scoring, Prompt, model parameters, Fallback behavior, and B.2 validation artifacts remain unchanged.
