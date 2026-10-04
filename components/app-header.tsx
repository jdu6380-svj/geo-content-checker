"use client";

import { Hand, Plus } from "lucide-react";

import { EvidraBrandMark } from "@/components/evidra-brand-mark";

type AppHeaderProps = {
  analysisStarted: boolean;
  onShowEditor: () => void;
  onNewAnalysis: () => void;
};

export function AppHeader({ analysisStarted, onShowEditor, onNewAnalysis }: AppHeaderProps) {
  function confirmNewAnalysis() {
    if (!window.confirm("新建审查将结束当前报告视图，但会保留浏览器中的文章草稿。确认继续吗？")) return;
    onNewAnalysis();
  }

  return (
    <header className={`app-header ${analysisStarted ? "is-analysis" : "is-editor"}`}>
      <div className="app-header-grid">
        <button type="button" onClick={onShowEditor} className="app-brand" aria-label="返回 Evidra 内容审查工作台">
          <EvidraBrandMark className="brand-mark" />
          <span><strong>Evidra</strong><small>内容可信度审查</small></span>
        </button>
        <div className="phase-header-main">
          <div className="phase-header-greeting" role="status" aria-label="当前会话状态">
            <Hand aria-hidden="true" />
            <span><strong>{analysisStarted ? "审查进行中" : "准备开始审查"}</strong> · 当前会话</span>
          </div>
          <div className="phase-header-actions">
            {analysisStarted ? (
              <button type="button" className="phase-header-action" onClick={confirmNewAnalysis}>
                <Plus aria-hidden="true" />
                <span>新建审查</span>
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
