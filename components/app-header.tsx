"use client";

import {
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  CreditCard,
  FileCheck2,
  Hand,
  RotateCcw,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";

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

const BETA_STATUS_ITEMS = [
  { name: "单用户体验", detail: "当前浏览器会话", status: "已启用", date: "Beta", tone: "is-success" },
  { name: "账户与订阅", detail: "不创建用户身份", status: "未启用", date: "Beta", tone: "is-warning" },
  { name: "团队与邀请", detail: "不提供协作入口", status: "未启用", date: "Beta", tone: "is-warning" },
] as const;

const BETA_NOTICES = [
  { title: "本地体验模式", description: "当前不会创建真实账户或同步个人身份。", time: "Beta", tone: "is-purple", icon: UserRound },
  { title: "报告来自当前会话", description: "仅展示本次提交内容的审查结果。", time: "当前", tone: "is-warning", icon: FileCheck2 },
  { title: "反馈入口已开放", description: "可通过左侧反馈入口提交真实体验。", time: "可用", tone: "is-success", icon: CircleHelp },
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
              <small>内容可信度审查</small>
            </span>
          </button>

          <div className="phase-header-main">
            <button type="button" className="phase-header-greeting" onClick={analysisStarted ? onNewAnalysis : onShowEditor}>
              <Hand aria-hidden="true" />
              <span><strong>Beta 体验模式</strong> · 当前会话</span>
            </button>

            <div className="phase-header-actions">
              <button
                type="button"
                className="phase-header-action is-invite"
                onClick={() => toggleLayer("invite")}
                aria-expanded={layer === "invite"}
              >
                <CircleHelp aria-hidden="true" />
                <span>Beta 说明</span>
              </button>
              <button
                type="button"
                className={`phase-header-icon-button ${layer === "notifications" ? "is-active" : ""}`}
                onClick={() => toggleLayer("notifications")}
                aria-label="查看 Beta 提示"
                aria-expanded={layer === "notifications"}
              >
                <Bell aria-hidden="true" />
              </button>
              <button
                type="button"
                className={`phase-account-trigger ${layer === "account" ? "is-active" : ""}`}
                onClick={() => toggleLayer("account")}
                aria-label="打开 Beta 状态菜单"
                aria-expanded={layer === "account"}
              >
                <span className="phase-user-avatar">B</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="phase-header-hidden-nav" aria-hidden="true">{navigation}</div>

          {layer === "notifications" ? (
            <section className="phase-header-popover phase-notification-popover" aria-label="Beta 提示" tabIndex={-1} autoFocus>
              <header>
                <h2>Beta 提示</h2>
                <button type="button" onClick={() => setLayer(null)}>关闭</button>
              </header>
              <ul>
                {BETA_NOTICES.map(({ title, description, time, tone, icon: Icon }) => (
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
            <section className="phase-header-popover phase-account-popover" aria-label="Beta 状态菜单" tabIndex={-1} autoFocus>
              <div className="phase-account-profile">
                <span className="phase-user-avatar is-large">B</span>
                <div><strong>Beta 访客</strong><span>本地体验模式</span></div>
              </div>
              <div className="phase-account-menu-group">
                <button type="button" disabled><UserRound aria-hidden="true" />未绑定真实账户</button>
                <button type="button" disabled><Settings aria-hidden="true" />设置暂未开放</button>
                <button type="button" disabled><CreditCard aria-hidden="true" />无订阅计划</button>
                <button type="button" disabled><CircleHelp aria-hidden="true" />当前为单用户 Beta</button>
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
            <button type="button" className="phase-modal-close" onClick={() => setLayer(null)} aria-label="关闭 Beta 说明">
              <X aria-hidden="true" />
            </button>
            <header>
              <h2 id="phase-invite-title">Evidra Beta 体验说明</h2>
              <p>当前为单用户受控体验，不提供账户、订阅、团队或好友邀请能力。</p>
            </header>

            <div className="phase-invite-section">
              <label htmlFor="phase-invite-link">当前体验模式</label>
              <div className="phase-invite-link-row">
                <input id="phase-invite-link" value="单用户 · 当前浏览器 · 本地草稿" readOnly />
                <button type="button" disabled><Check aria-hidden="true" />Beta 模式</button>
              </div>
            </div>

            <div className="phase-invite-section">
              <span className="phase-invite-label">可体验流程</span>
              <div className="phase-share-methods">
                <button type="button" disabled><FileCheck2 aria-hidden="true" />提交内容</button>
                <button type="button" disabled><ShieldCheck aria-hidden="true" />查看依据</button>
                <button type="button" disabled><RotateCcw aria-hidden="true" />重新验证</button>
              </div>
            </div>

            <div className="phase-invite-records">
              <h3>能力状态</h3>
              <ul>
                {BETA_STATUS_ITEMS.map((record) => (
                  <li key={record.name}>
                    <span className="phase-invite-avatar">{record.name.slice(0, 1)}</span>
                    <div><strong>{record.name}</strong><span>{record.detail}</span></div>
                    <p><b className={record.tone}>{record.status}</b><span>{record.date}</span></p>
                  </li>
                ))}
              </ul>
            </div>
            <p className="phase-invite-note">当前 Preview 不代表正式账户服务，也不会生成真实邀请、订阅或团队记录。</p>
          </section>
        </div>
      ) : null}

      <button type="button" className="phase-feedback-event-proxy" onClick={onFeedbackClick} tabIndex={-1} aria-hidden="true" />
    </>
  );
}
