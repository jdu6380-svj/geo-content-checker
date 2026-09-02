"use client";

import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  FileCheck2,
  Hand,
  Plus,
  RotateCcw,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";

import { EvidraBrandMark } from "@/components/evidra-brand-mark";

type AppHeaderProps = {
  analysisStarted: boolean;
  onShowEditor: () => void;
  onNewAnalysis: () => void;
  feedbackUrl?: string;
  onFeedbackClick: () => void;
  navigation: ReactNode;
};

type HeaderLayer = "invite" | "notifications" | "account" | null;

const WORKFLOW_STATUS_ITEMS = [
  { name: "内容审查", detail: "粘贴或上传内容", status: "可开始", date: "当前", tone: "is-success" },
  { name: "认证工作台", detail: "保存项目与报告", status: "需登录", date: "账户", tone: "is-warning" },
  { name: "团队额度", detail: "在工作区统一管理", status: "工作台", date: "套餐", tone: "is-purple" },
] as const;

const WORKFLOW_NOTICES = [
  { title: "开始新的内容审查", description: "粘贴正文或上传文本文件，提交后生成审查结果。", time: "可用", tone: "is-purple", icon: FileCheck2 },
  { title: "报告仅基于已提交内容", description: "模板只用于准备输入，不代表真实分析结果。", time: "提醒", tone: "is-warning", icon: ShieldCheck },
  { title: "商业工作台", description: "登录后管理项目、共享额度、套餐与客户交付报告。", time: "账户", tone: "is-success", icon: UserRound },
] as const;

export function AppHeader({
  analysisStarted,
  onShowEditor,
  onNewAnalysis,
  onFeedbackClick,
  navigation,
}: AppHeaderProps) {
  const [layer, setLayer] = useState<HeaderLayer>(null);

  function toggleLayer(nextLayer: Exclude<HeaderLayer, null>) {
    setLayer((current) => current === nextLayer ? null : nextLayer);
  }

  function confirmNewAnalysis() {
    if (!window.confirm("新建审查将结束当前报告视图，但会保留浏览器中的文章草稿。确认继续吗？")) return;
    setLayer(null);
    onNewAnalysis();
  }

  return (
    <>
      <header className={`app-header ${analysisStarted ? "is-analysis" : "is-editor"}`}>
        <div className="app-header-grid">
          <button
            type="button"
            onClick={onShowEditor}
            className="app-brand"
            aria-label="返回 Evidra 内容审查工作台"
          >
            <EvidraBrandMark className="brand-mark" />
            <span>
              <strong>Evidra</strong>
              <small>AI 内容可信度与 GEO 发布前审查</small>
            </span>
          </button>

          <div className="phase-header-main">
            <div className="phase-header-greeting" role="status" aria-label="AI 内容发布前审查">
              <Hand aria-hidden="true" />
              <span><strong>AI 内容发布前审查</strong> · 当前工作区</span>
            </div>

            <div className="phase-header-actions">
              {analysisStarted ? (
                <button type="button" className="phase-header-action" onClick={confirmNewAnalysis}>
                  <Plus aria-hidden="true" />
                  <span>新建审查</span>
                </button>
              ) : null}
              <button
                type="button"
                className="phase-header-action is-invite"
                onClick={() => toggleLayer("invite")}
                aria-expanded={layer === "invite"}
              >
                <CircleHelp aria-hidden="true" />
                <span>工作流说明</span>
              </button>
              <button
                type="button"
                className={`phase-header-icon-button ${layer === "notifications" ? "is-active" : ""}`}
                onClick={() => toggleLayer("notifications")}
                aria-label="查看审查提醒"
                aria-expanded={layer === "notifications"}
              >
                <Bell aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`phase-account-trigger ${layer === "account" ? "is-active" : ""}`}
                onClick={() => toggleLayer("account")}
                aria-label="打开账户入口"
                aria-expanded={layer === "account"}
              >
                <span className="phase-user-avatar">E</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="phase-header-hidden-nav" aria-hidden="true">{navigation}</div>

          {layer === "notifications" ? (
            <section className="phase-header-popover phase-notification-popover" aria-label="审查提醒" tabIndex={-1} autoFocus>
              <header>
                <h2>审查提醒</h2>
                <button type="button" onClick={() => setLayer(null)}>关闭</button>
              </header>
              <ul>
                {WORKFLOW_NOTICES.map(({ title, description, time, tone, icon: Icon }) => (
                  <li key={title}>
                    <span className={`phase-notification-icon ${tone}`}><Icon aria-hidden="true" /></span>
                    <div>
                      <strong>{title}</strong>
                      <p>{description}</p>
                    </div>
                    <span className="phase-notification-time">{time}<i className={tone} /></span>
                  </li>
                ))}
              </ul>
              <button type="button" className="phase-popover-footer" onClick={() => setLayer(null)}>返回当前工作台</button>
            </section>
          ) : null}

          {layer === "account" ? (
            <section className="phase-header-popover phase-account-popover" aria-label="账户入口" tabIndex={-1} autoFocus>
              <div className="phase-account-profile">
                <span className="phase-user-avatar is-large">E</span>
                <div><strong>Evidra 工作台</strong><span>登录后保存项目与报告</span></div>
              </div>
              <div className="phase-account-menu-group">
                <Link href="/sign-in"><UserRound aria-hidden="true" />登录</Link>
                <Link href="/sign-up"><Plus aria-hidden="true" />注册</Link>
                <Link href="/dashboard"><FileCheck2 aria-hidden="true" />项目、额度与套餐</Link>
              </div>
              <button type="button" className="phase-account-logout is-neutral" onClick={() => setLayer(null)}><X aria-hidden="true" />关闭菜单</button>
            </section>
          ) : null}
        </div>
      </header>

      {layer === "invite" ? (
        <div className="phase-modal-backdrop" role="presentation" onMouseDown={() => setLayer(null)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="phase-invite-title"
            className="phase-invite-modal"
            tabIndex={-1}
            autoFocus
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button type="button" className="phase-modal-close" onClick={() => setLayer(null)} aria-label="关闭工作流说明">
              <X aria-hidden="true" />
            </button>
            <header>
              <h2 id="phase-invite-title">Evidra 审查工作流</h2>
              <p>粘贴或上传内容即可开始发布前审查；登录商业工作台后，可按工作区管理项目、共享额度和客户交付报告。</p>
            </header>

            <div className="phase-invite-section">
              <label htmlFor="phase-invite-link">当前输入方式</label>
              <div className="phase-invite-link-row">
                <input id="phase-invite-link" value="粘贴正文 · 上传文本 · 使用审查模板" readOnly />
                <span className="phase-invite-status" role="status"><Check aria-hidden="true" />内容审查</span>
              </div>
            </div>

            <div className="phase-invite-section">
              <span className="phase-invite-label">可体验流程</span>
              <div className="phase-share-methods" aria-label="可体验流程状态">
                <span><FileCheck2 aria-hidden="true" />提交内容</span>
                <span><ShieldCheck aria-hidden="true" />查看依据</span>
                <span><RotateCcw aria-hidden="true" />重新验证</span>
              </div>
            </div>

            <div className="phase-invite-records">
              <h3>能力状态</h3>
              <ul>
                {WORKFLOW_STATUS_ITEMS.map((record) => (
                  <li key={record.name}>
                    <span className="phase-invite-avatar">{record.name.slice(0, 1)}</span>
                    <div><strong>{record.name}</strong><span>{record.detail}</span></div>
                    <p><b className={record.tone}>{record.status}</b><span>{record.date}</span></p>
                  </li>
                ))}
              </ul>
            </div>
            <p className="phase-invite-note">未登录时不会创建账户、订阅或团队记录；模板内容也不会被标记为真实用户报告。</p>
          </section>
        </div>
      ) : null}

      <button type="button" className="phase-feedback-event-proxy" onClick={onFeedbackClick} tabIndex={-1} aria-hidden="true" />
    </>
  );
}
