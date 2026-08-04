"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  Copy,
  FileCheck2,
  Link2,
  ListChecks,
  RefreshCw,
  RotateCcw,
  Sparkles,
  TextSelect,
  UserRoundCheck,
} from "lucide-react";

import { postGeoBetaEvent, postGeoJson } from "@/lib/client/geo-api";
import type { DiagnosticsState } from "@/lib/client/report-state";
import type {
  GeneratePatchesResponse,
  Paragraph,
  PatchAction,
  PatchMode,
} from "@/lib/schemas/geo";

type PatchWorkshopProps = {
  title: string;
  paragraphs: Paragraph[];
  diagnostics: DiagnosticsState;
  runId: string | null;
  onBackToEditor: () => void;
};

type PatchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: GeneratePatchesResponse }
  | { status: "error"; error: string };

function initialPatchStates(): Record<PatchMode, PatchState> {
  return {
    advice: { status: "idle" },
    content_draft: { status: "idle" },
  };
}

async function readError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: unknown };
    return typeof payload.message === "string" ? payload.message : "补丁生成失败，请稍后重试。";
  } catch {
    return "补丁生成失败，请稍后重试。";
  }
}

function copyWithSelection(text: string): boolean {
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.inset = "0 auto auto -9999px";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

async function copyWithClipboard(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) throw new Error("Clipboard API unavailable");

  await new Promise<void>((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error("Clipboard write timed out")), 1_500);

    navigator.clipboard.writeText(text).then(
      () => {
        window.clearTimeout(timeoutId);
        resolve();
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId);
        reject(error);
      },
    );
  });
}

function actionPresentation(action: PatchAction) {
  if (action.type === "author_evidence") {
    return {
      eyebrow: "证据补充",
      title: action.field,
      body: action.reason,
      sourceLabel: "来源问题",
      source: action.relatedQuestion ?? "诊断指出关键事实仍缺少可核验依据",
      purpose: "补齐支撑核心结论的事实、来源或适用边界。",
      decision: "需要人工确认事实、来源与适用边界",
      accent: "patch-action-evidence",
      sourceClassName: "status-warning",
    };
  }
  if (action.type === "structure_change") {
    return {
      eyebrow: "结构调整",
      title: action.title,
      body: action.instruction,
      sourceLabel: "作用段落",
      source: action.targetParagraphIds.join(", "),
      purpose: "降低读者定位步骤、结论与适用边界的成本。",
      decision: "需要人工判断结构调整是否改变原意",
      accent: "patch-action-structure",
      sourceClassName: "status-secondary",
    };
  }
  if (action.type === "faq") {
    return {
      eyebrow: "FAQ 参考材料",
      title: action.question,
      body: action.answer,
      sourceLabel: "使用证据",
      source: `${action.evidence.paragraphId} · “${action.evidence.quote}”`,
      purpose: "把已有原文事实整理为可核对的问答表达。",
      decision: "核对问答是否完整表达原文边界",
      accent: "patch-action-faq",
      sourceClassName: "status-success",
    };
  }
  return {
    eyebrow: "事实卡片参考",
    title: action.label,
    body: action.value,
    sourceLabel: "使用证据",
    source: `${action.evidence.paragraphId} · “${action.evidence.quote}”`,
    purpose: "把已有原文事实整理为可复核的结构化材料。",
    decision: "核对事实卡片是否脱离上下文或扩大结论",
    accent: "patch-action-fact",
    sourceClassName: "status-info",
  };
}

export function PatchWorkshop({ title, paragraphs, diagnostics, runId, onBackToEditor }: PatchWorkshopProps) {
  const [activeMode, setActiveMode] = useState<PatchMode>("advice");
  const [patches, setPatches] = useState<Record<PatchMode, PatchState>>(initialPatchStates);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copying" | "copied" | "manual">("idle");
  const generateButtonRef = useRef<HTMLButtonElement>(null);
  const copyButtonRef = useRef<HTMLButtonElement>(null);
  const manualCopyRef = useRef<HTMLTextAreaElement>(null);
  const restoreActionFocusRef = useRef(false);
  const activePatch = patches[activeMode];
  const diagnosticResults = Object.values(diagnostics).flatMap((item) => item.data ? [item.data] : []);
  const canGenerate = paragraphs.length > 0 && diagnosticResults.length > 0;
  const evidenceGapCount = diagnosticResults.filter(
    (item) => item.evidenceStatus !== "valid" || item.missingInfo.length > 0,
  ).length;
  const validEvidenceCount = diagnosticResults.filter((item) => item.evidenceStatus === "valid").length;

  useEffect(() => {
    if (activePatch.status !== "success" || !restoreActionFocusRef.current) return;
    restoreActionFocusRef.current = false;
    copyButtonRef.current?.focus();
  }, [activePatch.status]);

  function selectMode(mode: PatchMode) {
    setActiveMode(mode);
    setCopyStatus("idle");
  }

  function setActivePatch(next: PatchState) {
    setPatches((current) => ({ ...current, [activeMode]: next }));
  }

  async function generatePatches() {
    if (!canGenerate || activePatch.status === "loading") return;
    restoreActionFocusRef.current = document.activeElement === generateButtonRef.current;
    setActivePatch({ status: "loading" });
    setCopyStatus("idle");
    if (runId) void postGeoBetaEvent({ event: "patch_requested", runId });

    try {
      const response = await postGeoJson("/api/generate-patches", {
        title,
        numbered_paragraphs: paragraphs,
        diagnostics: diagnosticResults,
        mode: activeMode,
      });
      if (!response.ok) throw new Error(await readError(response));
      const data = (await response.json()) as GeneratePatchesResponse;
      setActivePatch({ status: "success", data });
      if (runId) void postGeoBetaEvent({ event: "patch_generated", runId });
    } catch (requestError) {
      setActivePatch({
        status: "error",
        error: requestError instanceof Error ? requestError.message : "补丁生成失败，请稍后重试。",
      });
    }
  }

  async function copyMarkdown() {
    if (activePatch.status !== "success") return;
    setCopyStatus("copying");

    try {
      if (!copyWithSelection(activePatch.data.markdown)) {
        await copyWithClipboard(activePatch.data.markdown);
      }
      setCopyStatus("copied");
      if (runId) void postGeoBetaEvent({ event: "patch_copied", runId });
    } catch {
      setCopyStatus("manual");
      window.requestAnimationFrame(() => manualCopyRef.current?.select());
    }
  }

  const modeTitle = activeMode === "advice" ? "修改建议" : "内容参考材料";
  const modeDescription = activeMode === "advice"
    ? "把诊断中的证据缺口和结构问题整理为可执行清单，明确为什么改、改什么。"
      : "生成基于证据约束的修改参考材料，不替代完整改稿与事实审核。";

  return (
    <section id="patch-workshop" className="patch-workshop section-anchor min-w-0" aria-busy={activePatch.status === "loading"}>
      <div className="flex flex-col gap-4 border-b border-[var(--geo-border)] pb-5 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="section-kicker">修改工作台</p>
          <h2 className="mt-1 text-xl font-semibold text-[var(--geo-text)] sm:text-2xl">从诊断结论到重新验证</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--geo-text-muted)]">
            先确认问题依据，再准备修改材料。所有内容都需人工应用，复检只呈现真实变化。
          </p>
        </div>
        <span className="status-badge status-neutral inline-flex w-fit shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs">
          <UserRoundCheck aria-hidden="true" className="size-3.5" />
          人工审核后应用
        </span>
      </div>

      <div
        className="mt-4 flex flex-col gap-2 border-y border-[var(--geo-border)] py-3 sm:flex-row sm:items-center sm:gap-4"
        role="group"
        aria-label="修改与重新验证流程"
      >
        <div className="flex min-w-0 items-center gap-2" aria-current="step">
          <span className="geo-muted text-xs font-medium">当前</span>
          <span className="geo-heading text-sm font-semibold">准备修改材料</span>
        </div>
        <ArrowRight aria-hidden="true" className="hidden size-4 shrink-0 text-[var(--geo-text-soft)] sm:block" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="geo-muted text-xs font-medium">下一步</span>
          <span className="geo-body text-sm font-semibold">重新验证</span>
        </div>
      </div>

      <div className="patch-mode-switch mt-4 grid overflow-hidden sm:grid-cols-2" aria-label="修改材料类型">
        <button
          type="button"
          aria-pressed={activeMode === "advice"}
          onClick={() => selectMode("advice")}
          className={`patch-mode-option ${activeMode === "advice" ? "is-active" : ""}`}
        >
          <span className="patch-mode-icon"><ListChecks aria-hidden="true" className="size-4" /></span>
          <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold">修改建议</span>
            <span className="mt-0.5 block text-xs leading-5">关联诊断，明确为什么改、改什么</span>
          </span>
          <span className="patch-mode-state">{activeMode === "advice" ? "当前" : "查看"}</span>
        </button>
        <button
          type="button"
          aria-pressed={activeMode === "content_draft"}
          onClick={() => selectMode("content_draft")}
          className={`patch-mode-option ${activeMode === "content_draft" ? "is-active" : ""}`}
        >
          <span className="patch-mode-icon"><FileCheck2 aria-hidden="true" className="size-4" /></span>
          <span className="min-w-0 text-left">
            <span className="block text-sm font-semibold">内容草稿</span>
            <span className="mt-0.5 block text-xs leading-5">基于证据约束的修改参考材料</span>
          </span>
          <span className="patch-mode-state">{activeMode === "content_draft" ? "当前" : "查看"}</span>
        </button>
      </div>

      <div className="patch-mode-guidance mt-4 grid overflow-hidden sm:grid-cols-3">
        {(activeMode === "advice"
          ? [
              { icon: Link2, label: "输入依据", value: `${diagnosticResults.length} 项诊断，其中 ${evidenceGapCount} 项存在证据或信息缺口` },
              { icon: ListChecks, label: "交付用途", value: "形成逐项可执行清单，并保留与来源问题的关联" },
              { icon: UserRoundCheck, label: "人工决策门", value: "确认事实来源、适用范围与原意；建议不代表问题已解决" },
            ]
          : [
              { icon: Link2, label: "输入依据", value: `${validEvidenceCount} 项诊断含有效证据，可用于组织参考材料` },
              { icon: FileCheck2, label: "交付用途", value: "整理 FAQ 与事实卡片参考，不是 AI 自动改稿" },
              { icon: UserRoundCheck, label: "人工决策门", value: "逐项核对证据、语气与全文衔接；材料不保证结果提升" },
            ]
        ).map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="min-w-0 px-4 py-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--geo-text-body)]">
                <Icon aria-hidden="true" className="size-3.5 text-[var(--geo-primary)]" />
                {item.label}
              </div>
              <p className="mt-1.5 text-xs leading-5 text-[var(--geo-text-muted)]">{item.value}</p>
            </div>
          );
        })}
      </div>

      {!paragraphs.length ? (
        <p className="patch-empty-note mt-4 border-l-2 pl-4 text-sm leading-6">
          缓存报告不含正文，请重新运行体检后生成内容补丁。
        </p>
      ) : diagnosticResults.length === 0 ? (
        <p className="patch-empty-note mt-4 border-l-2 pl-4 text-sm leading-6">
          至少完成一项诊断后，才能生成可信的修改建议。
        </p>
      ) : null}

      {canGenerate && activePatch.status !== "success" ? (
        <div className={`patch-callout mt-4 grid items-center gap-4 rounded-lg border p-4 sm:grid-cols-[1fr_auto] sm:p-5 ${activePatch.status === "error" ? "patch-callout-error" : "patch-callout-ready"}`}>
          <div>
            <p className="data-label">当前材料</p>
            <h3 className="mt-1 text-sm font-semibold text-[var(--geo-text)]">
              {activePatch.status === "error" ? `${modeTitle}生成失败` : modeTitle}
            </h3>
            {activePatch.status === "error" ? (
              <p role="alert" aria-live="assertive" className="mt-1 text-sm leading-6 text-[var(--geo-status-danger)]">{activePatch.error}</p>
            ) : (
              <p className="mt-1 text-sm leading-6 text-[var(--geo-text-muted)]">
                {activePatch.status === "loading" ? `正在生成${modeTitle}。` : modeDescription}
              </p>
            )}
          </div>
          <button
            ref={generateButtonRef}
            type="button"
            onClick={generatePatches}
            disabled={activePatch.status === "loading"}
            className="primary-button h-10 w-full px-5 text-sm font-bold disabled:translate-y-0 disabled:cursor-wait disabled:opacity-65 sm:w-auto"
          >
            {activePatch.status === "error" ? (
              <RefreshCw aria-hidden="true" className="size-4" />
            ) : (
              <Sparkles aria-hidden="true" className={`size-4 ${activePatch.status === "loading" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
            )}
            {activePatch.status === "loading" ? "正在生成" : activePatch.status === "error" ? "重新生成" : `生成${modeTitle}`}
          </button>
        </div>
      ) : null}

      {activePatch.status === "loading" ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2" role="status" aria-live="polite" aria-label={`正在生成${modeTitle}`}>
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="card min-h-[150px] animate-pulse p-5 motion-reduce:animate-none">
              <div className="h-4 w-1/2 rounded bg-[var(--geo-surface-inset)]" />
              <div className="mt-5 h-3 w-full rounded bg-[var(--geo-surface-subtle)]" />
              <div className="mt-3 h-3 w-4/5 rounded bg-[var(--geo-surface-subtle)]" />
            </div>
          ))}
        </div>
      ) : null}

      {activePatch.status === "success" ? (
        <div className="patch-result-shell mt-4 overflow-hidden">
          <header className="patch-result-header flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="data-label">审核材料</p>
                <span className="status-badge status-neutral px-2 py-0.5 text-[10px]">
                  {activePatch.data.source === "model" ? "模型生成" : "安全降级生成"}
                </span>
              </div>
              <h3 className="mt-1.5 text-base font-semibold text-[var(--geo-text)]">
                {activeMode === "advice" ? "与诊断关联的修改建议" : "基于证据约束的修改参考材料"}
              </h3>
              <p className="mt-1 text-xs leading-5 text-[var(--geo-text-muted)]">
                {activeMode === "advice"
                  ? `${activePatch.data.actions.length} 项建议，逐项确认后再决定是否应用。`
                  : `${activePatch.data.actions.length} 项参考材料，不应直接替换全文。`}
              </p>
            </div>
            <div className="flex flex-col items-stretch gap-2 sm:items-end">
              <span role="status" aria-live="polite" className="inline-flex min-h-4 items-center justify-end gap-1.5 text-xs">
                {copyStatus === "copying" ? <span className="text-[var(--geo-text-muted)]">正在复制</span> : null}
                {copyStatus === "copied" ? (
                  <>
                    <Check aria-hidden="true" className="size-3.5 text-[var(--geo-primary)]" />
                    <span className="font-semibold text-[var(--geo-primary)]">已复制，尚未应用</span>
                  </>
                ) : null}
                {copyStatus === "manual" ? <span className="text-[var(--geo-amber)]">请在下方手动复制</span> : null}
              </span>
              <button
                ref={copyButtonRef}
                type="button"
                onClick={copyMarkdown}
                disabled={copyStatus === "copying"}
                className="secondary-button h-9 w-full px-4 text-sm font-semibold text-[var(--geo-primary)] disabled:cursor-wait disabled:opacity-65 sm:w-auto"
              >
                <Copy aria-hidden="true" className={`size-4 ${copyStatus === "copying" ? "animate-pulse motion-reduce:animate-none" : ""}`} />
                {copyStatus === "copying" ? "正在复制" : "复制全部 Markdown"}
              </button>
            </div>
          </header>

          <div className="patch-review-gate grid sm:grid-cols-3" aria-label="材料使用前检查">
            {[
              ["01", "核对来源", "确认建议对应的诊断与证据。"],
              ["02", "判断适用", "确认事实、语气和业务边界。"],
              ["03", "人工应用", "只采纳适合原文的修改内容。"],
            ].map(([number, label, description]) => (
              <div key={number} className="flex min-w-0 gap-3 px-4 py-3.5 sm:px-5">
                <span className="patch-review-number">{number}</span>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[var(--geo-text-body)]">{label}</p>
                  <p className="mt-1 text-[11px] leading-5 text-[var(--geo-text-soft)]">{description}</p>
                </div>
              </div>
            ))}
          </div>

          {copyStatus === "copied" ? (
            <div className="flex flex-col gap-3 border-b border-[var(--geo-status-success-border)] bg-[var(--geo-status-success-soft)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div className="flex min-w-0 items-start gap-3">
                <ClipboardCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--geo-primary)]" />
                <div>
                  <p className="text-sm font-semibold text-[var(--geo-primary)]">材料已复制，仍需人工核对并整合到原文</p>
                  <p className="mt-1 text-xs leading-5 text-[var(--geo-text-muted)]">复制不代表修改已完成。应用后运行完整复检，结果可能改善、无变化或下降。</p>
                </div>
              </div>
              <button type="button" onClick={onBackToEditor} className="secondary-button h-9 w-full shrink-0 px-4 text-xs font-semibold sm:w-auto">
                返回原文
                <ArrowRight aria-hidden="true" className="size-3.5" />
              </button>
            </div>
          ) : null}

          {copyStatus === "manual" ? (
            <div className="border-b border-[var(--geo-status-warning-border)] bg-[var(--geo-status-warning-soft)] p-4 sm:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-sm font-bold">Markdown 文本</h3>
                <button
                  type="button"
                  onClick={() => manualCopyRef.current?.select()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-[var(--geo-status-warning-border)] bg-white px-3 text-xs font-semibold text-[var(--geo-amber)]"
                >
                  <TextSelect aria-hidden="true" className="size-3.5" />
                  全选文本
                </button>
              </div>
              <textarea
                ref={manualCopyRef}
                readOnly
                value={activePatch.data.markdown}
                onFocus={(event) => event.currentTarget.select()}
                className="mt-3 h-44 w-full resize-y rounded-lg border border-[var(--geo-status-warning-border)] bg-white p-3 font-mono text-xs leading-6 text-[var(--geo-text-body)] focus-visible:border-[var(--geo-primary)]"
                aria-label="可手动复制的 Markdown 文本"
              />
            </div>
          ) : null}

          <div className="patch-action-list">
            {activePatch.data.actions.map((action, index) => {
              const presentation = actionPresentation(action);
              return (
                <article key={action.id} className={`patch-action-row ${presentation.accent}`}>
                  <div className="patch-action-main min-w-0 px-4 py-5 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="patch-action-index">{String(index + 1).padStart(2, "0")}</span>
                      <span className={`status-badge px-2 py-1 text-[10px] font-semibold ${presentation.sourceClassName}`}>
                        {presentation.eyebrow}
                      </span>
                    </div>
                    <p className="data-label mt-4">{activeMode === "advice" ? "建议动作" : "参考内容"}</p>
                    <h3 className="mt-1.5 text-sm font-semibold leading-6 text-[var(--geo-text)]">{presentation.title}</h3>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-[var(--geo-text-body)]">{presentation.body}</p>
                  </div>
                  <dl className="patch-action-audit min-w-0 px-4 py-5 text-xs leading-5 sm:px-5">
                    <div>
                      <dt>{presentation.sourceLabel}</dt>
                      <dd>{presentation.source}</dd>
                    </div>
                    <div>
                      <dt>修改目的</dt>
                      <dd>{presentation.purpose}</dd>
                    </div>
                    <div>
                      <dt className="flex items-center gap-1.5"><UserRoundCheck aria-hidden="true" className="size-3.5" />人工确认</dt>
                      <dd>{presentation.decision}</dd>
                    </div>
                  </dl>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="patch-next-step mt-5 flex flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <span className="patch-review-number mt-0.5">04</span>
          <div>
            <h3 className="text-sm font-semibold text-[var(--geo-text)]">人工应用后，用同一套规则重新验证</h3>
            <p className="mt-1 text-xs leading-5 text-[var(--geo-text-muted)]">Evidra 会保留修改前基线；复检完成后分别展示改善、无变化、下降与不可比较。</p>
          </div>
        </div>
        <button type="button" onClick={onBackToEditor} className="secondary-button h-10 w-full shrink-0 px-4 text-sm font-semibold sm:w-auto">
          <RotateCcw aria-hidden="true" className="size-4" />
          返回原文并准备复检
        </button>
      </div>
    </section>
  );
}
