"use client";

import type { DragEvent, FormEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  Bold,
  Check,
  ChevronDown,
  Code2,
  FileCheck2,
  FileText,
  Heading,
  Image as ImageIcon,
  Italic,
  Link2,
  List,
  Quote,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Upload,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { QuickStartGuide, RecentReviewCard } from "@/components/workspace-dashboard-panels";

type EditorDraft = {
  title: string;
  content: string;
  publishedAt: string;
};

type EditorFieldErrors = Partial<Record<"title" | "content", string>>;

export type EditorWorkspaceSample = {
  id: string;
  title: string;
  status: string;
  description: string;
  badgeClassName: string;
};

export type EditorWorkspaceDimension = {
  label: string;
  indicatorClassName: string;
};

type EditorWorkspaceProps = {
  draft: EditorDraft;
  contentLength: number;
  maxArticleCharacters: number;
  remaining: number;
  fieldErrors: EditorFieldErrors;
  error: string;
  titleRef: RefObject<HTMLInputElement | null>;
  contentRef: RefObject<HTMLTextAreaElement | null>;
  samples: EditorWorkspaceSample[];
  dimensions: EditorWorkspaceDimension[];
  recheckContext: { score: number; issueCount: number } | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDraftChange: (field: keyof EditorDraft, value: string) => void;
  onLoadSample: (index: number) => void;
};

type EditorMode = "upload" | "paste";
type SelectedFile = { name: string; size: number; format: "MD" | "TXT" };

const TOOLBAR_ITEMS = [
  { label: "标题", icon: Heading },
  { label: "粗体", icon: Bold },
  { label: "斜体", icon: Italic },
  { label: "代码", icon: Code2 },
  { label: "列表", icon: List },
  { label: "引用", icon: Quote },
  { label: "链接", icon: Link2 },
  { label: "图片", icon: ImageIcon },
] as const;

const SAMPLE_PRESENTATION = [
  { marker: "01", tone: "is-word" },
  { marker: "02", tone: "is-pdf" },
  { marker: "03", tone: "is-markdown" },
] as const;

const SUPPORTED_UPLOAD_PATTERN = /\.(md|markdown|txt)$/i;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EditorWorkspace({
  draft,
  contentLength,
  maxArticleCharacters,
  remaining,
  fieldErrors,
  error,
  titleRef,
  contentRef,
  samples,
  recheckContext,
  onSubmit,
  onDraftChange,
  onLoadSample,
}: EditorWorkspaceProps) {
  const [mode, setMode] = useState<EditorMode>("upload");
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const contentText = draft.content ?? "";

  useEffect(() => {
    if (recheckContext) setMode("paste");
  }, [recheckContext]);

  async function handleFile(file: File) {
    setUploadError("");

    if (!SUPPORTED_UPLOAD_PATTERN.test(file.name)) {
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setUploadError("当前 Beta 仅支持 Markdown（.md、.markdown）与 TXT 文本文件。PDF、DOCX 尚未开放解析。");
      return;
    }

    try {
      const text = await file.text();
      if (!text.trim()) {
        setSelectedFile(null);
        setUploadError("文件内容为空，或无法按 UTF-8 文本读取。请改用粘贴正文。");
        return;
      }

      setSelectedFile({
        name: file.name,
        size: file.size,
        format: /\.txt$/i.test(file.name) ? "TXT" : "MD",
      });
      onDraftChange("title", file.name.replace(/\.[^.]+$/, ""));
      onDraftChange("content", text.slice(0, maxArticleCharacters));
    } catch {
      setSelectedFile(null);
      setUploadError("文件读取失败，请确认文件为 UTF-8 文本，或改用粘贴正文。");
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file) void handleFile(file);
  }

  function handleSample(index: number) {
    setSelectedFile(null);
    setUploadError("");
    setMode("paste");
    onLoadSample(index);
  }

  const titleLength = draft.title.length;
  const inputHasError = Boolean(error || fieldErrors.title || fieldErrors.content || remaining < 0);

  return (
    <section className="editor-workspace phase-one-editor">
      <div className="phase-editor-page-heading">
        <p className="phase-editor-kicker">内容可信度审查</p>
        <h1>{recheckContext ? "重新验证修改后的文章" : "开始一次内容可信度审查"}</h1>
        <p>{recheckContext ? "提交人工确认后的版本，对比修改前后的真实变化。" : "Evidra 基于 Evidence First 原则，帮助你识别内容风险，提升观点可信度。"}</p>
      </div>

      <div className="phase-editor-grid">
        <main className="phase-editor-main">
          <form className="phase-editor-card" onSubmit={onSubmit}>
            <div className="phase-editor-tabs" role="tablist" aria-label="内容提交方式">
              <button
                type="button"
                role="tab"
                aria-selected={mode === "upload"}
                className={mode === "upload" ? "is-active" : ""}
                onClick={() => setMode("upload")}
              >
                上传文档
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "paste"}
                className={mode === "paste" ? "is-active" : ""}
                onClick={() => setMode("paste")}
              >
                粘贴正文
              </button>
            </div>

            {mode === "upload" ? (
              <div
                className={`phase-upload-zone ${selectedFile ? "is-complete" : ""}`}
                onDragOver={(event) => event.preventDefault()}
                onDrop={handleDrop}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".md,.markdown,.txt,text/markdown,text/plain"
                  className="phase-file-input"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFile(file);
                  }}
                />

                {selectedFile ? (
                  <>
                    <span className="phase-upload-state-icon is-complete"><FileCheck2 aria-hidden="true" /></span>
                    <h2>文本文件读取完成</h2>
                    <p>正文已载入当前草稿，可开始分析</p>
                    <div className="phase-selected-file">
                      <span className="phase-file-type">{selectedFile.format}</span>
                      <div><strong>{selectedFile.name}</strong><span>{formatBytes(selectedFile.size)}</span></div>
                      <b><Check aria-hidden="true" />已载入</b>
                    </div>
                    <div className="phase-upload-actions">
                      <button type="button" className="phase-secondary-button" onClick={() => fileInputRef.current?.click()}>
                        <ArrowDownToLine aria-hidden="true" />重新上传
                      </button>
                      <button type="submit" className="phase-primary-button">
                        开始分析 <ArrowRight aria-hidden="true" />
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="phase-upload-state-icon"><Upload aria-hidden="true" /></span>
                    <h2>拖入文章文件，或选择文件上传</h2>
                    <p>支持 Markdown、TXT（UTF-8 文本，最多读取 {maxArticleCharacters.toLocaleString()} 字）</p>
                    <button type="button" className="phase-primary-button phase-file-button" onClick={() => fileInputRef.current?.click()}>
                      选择文件 <ChevronDown aria-hidden="true" />
                    </button>
                    <span className="phase-upload-hint">或直接拖拽文件到此处</span>
                  </>
                )}

                {uploadError ? <p className="phase-editor-error" role="alert">{uploadError}</p> : null}

                <div className="phase-upload-features">
                  <div><span><Sparkles aria-hidden="true" /></span><strong>智能解析结构</strong><small>自动提取标题、段落、引用</small></div>
                  <div><span><FileCheck2 aria-hidden="true" /></span><strong>识别事实依据</strong><small>定位事实陈述与数据来源</small></div>
                  <div><span><ShieldCheck aria-hidden="true" /></span><strong>评估可信风险</strong><small>多维度分析内容可信度</small></div>
                </div>
              </div>
            ) : (
              <div className="phase-paste-editor">
                <div className="phase-editor-field">
                  <div className="phase-field-heading"><label htmlFor="article-title">标题</label><span>{titleLength}/200</span></div>
                  <Input
                    id="article-title"
                    ref={titleRef}
                    value={draft.title}
                    onChange={(event) => onDraftChange("title", event.target.value)}
                    maxLength={200}
                    placeholder="请输入文章标题..."
                    aria-invalid={Boolean(fieldErrors.title)}
                  />
                  {fieldErrors.title ? <small className="phase-field-error">{fieldErrors.title}</small> : null}
                </div>

                <div className="phase-editor-field phase-body-field">
                  <div className="phase-field-heading"><label htmlFor="article-content">正文</label></div>
                  <div className="phase-rich-editor">
                    <div className="phase-rich-toolbar" aria-label="正文格式工具">
                      {TOOLBAR_ITEMS.map(({ label, icon: Icon }) => <button key={label} type="button" aria-label={label}><Icon aria-hidden="true" /></button>)}
                    </div>
                    <textarea
                      id="article-content"
                      ref={contentRef}
                      value={contentText}
                      onChange={(event) => onDraftChange("content", event.target.value)}
                      placeholder="请输入需要审查的文章正文..."
                      aria-invalid={Boolean(fieldErrors.content)}
                    />
                    <footer>
                      <span>字数统计：{contentLength.toLocaleString()} 字</span>
                      <button type="submit" className="phase-primary-button">开始分析 <ArrowRight aria-hidden="true" /></button>
                    </footer>
                  </div>
                  {fieldErrors.content ? <small className="phase-field-error">{fieldErrors.content}</small> : null}
                </div>

                {error ? <p className="phase-editor-error" role="alert">{error}</p> : null}
                {inputHasError && !error ? <p className="phase-editor-error" role="alert">请补充标题和正文后再开始分析。</p> : null}

              </div>
            )}

            <section className="phase-recent-list" aria-labelledby="phase-recent-list-title">
              <h2 id="phase-recent-list-title">示例审查内容</h2>
              <ul>
                {samples.slice(0, 3).map((sample, index) => {
                  const presentation = SAMPLE_PRESENTATION[index] ?? SAMPLE_PRESENTATION[0];
                  return (
                    <li key={sample.id}>
                      <span className={`phase-recent-file-icon ${presentation.tone}`}>{presentation.marker}</span>
                      <div><strong>Demo 内容 · {sample.title}</strong><span>{sample.status} · {sample.description}</span></div>
                      <button type="button" onClick={() => handleSample(index)}>载入示例 <ArrowRight aria-hidden="true" /></button>
                    </li>
                  );
                })}
              </ul>
            </section>
          </form>
        </main>

        <aside className="phase-editor-rail" aria-label="审查辅助信息">
          <QuickStartGuide />
          <RecentReviewCard />
        </aside>
      </div>

      <footer className="phase-editor-footer">
        <span><ShieldCheck aria-hidden="true" />你的内容仅用于审查分析，我们不会用于模型训练或其他用途。</span>
        <span>Evidra v1.0.0 <i />服务正常</span>
      </footer>
    </section>
  );
}
