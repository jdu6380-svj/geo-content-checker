"use client";

import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Copy,
  CreditCard,
  FileCheck2,
  Gift,
  Hand,
  Link2,
  LogOut,
  Mail,
  Settings,
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

const INVITE_RECORDS = [
  { name: "Zoey", email: "zoey@example.com", status: "已接受", date: "2025-05-27", tone: "is-success" },
  { name: "Leo", email: "leo@example.com", status: "待接受", date: "2025-05-26", tone: "is-warning" },
  { name: "Mia", email: "mia@example.com", status: "已接受", date: "2025-05-25", tone: "is-success" },
] as const;

const NOTIFICATIONS = [
  { title: "内容分析完成", description: "《AI多轮时代内容策略》\n报告已生成。", time: "2 分钟前", tone: "is-purple", icon: FileCheck2 },
  { title: "发现可信度风险", description: "多维度识别 3 项 Evidence 缺失。", time: "15 分钟前", tone: "is-warning", icon: AlertTriangle },
  { title: "获取审查报表", description: "查看词条：72 → 85", time: "1 小时前", tone: "is-success", icon: CheckCircle2 },
] as const;

export function AppHeader({
  analysisStarted,
  onShowEditor,
  onNewAnalysis,
  onFeedbackClick,
  navigation,
}: AppHeaderProps) {
  const [layer, setLayer] = useState<HeaderLayer>(null);
  const [copied, setCopied] = useState(false);

  function toggleLayer(nextLayer: Exclude<HeaderLayer, null>) {
    setLayer((current) => current === nextLayer ? null : nextLayer);
  }

  async function copyInviteLink() {
    try {
      await navigator.clipboard.writeText("https://evidra.ai/invite/team");
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      setCopied(false);
    }
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
              <span>欢迎回来， <strong>Nana</strong></span>
            </button>

            <div className="phase-header-actions">
              <button
                type="button"
                className="phase-header-action is-invite"
                onClick={() => toggleLayer("invite")}
                aria-expanded={layer === "invite"}
              >
                <Gift aria-hidden="true" />
                <span>邀请好友</span>
              </button>
              <button
                type="button"
                className={`phase-header-icon-button ${layer === "notifications" ? "is-active" : ""}`}
                onClick={() => toggleLayer("notifications")}
                aria-label="查看通知"
                aria-expanded={layer === "notifications"}
              >
                <Bell aria-hidden="true" />
                <span className="phase-notification-count">{layer === "notifications" ? "5" : "3"}</span>
              </button>
              <button
                type="button"
                className={`phase-account-trigger ${layer === "account" ? "is-active" : ""}`}
                onClick={() => toggleLayer("account")}
                aria-label="打开用户菜单"
                aria-expanded={layer === "account"}
              >
                <span className="phase-user-avatar">N</span>
                <ChevronDown aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="phase-header-hidden-nav" aria-hidden="true">{navigation}</div>

          {layer === "notifications" ? (
            <section className="phase-header-popover phase-notification-popover" aria-label="通知列表" tabIndex={-1} autoFocus>
              <header>
                <h2>通知</h2>
                <button type="button">全部标记为已读</button>
              </header>
              <ul>
                {NOTIFICATIONS.map(({ title, description, time, tone, icon: Icon }) => (
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
              <button type="button" className="phase-popover-footer">查看全部通知 <span>→</span></button>
            </section>
          ) : null}

          {layer === "account" ? (
            <section className="phase-header-popover phase-account-popover" aria-label="用户菜单" tabIndex={-1} autoFocus>
              <div className="phase-account-profile">
                <span className="phase-user-avatar is-large">N</span>
                <div><strong>Nana</strong><span>Pro Plan</span></div>
              </div>
              <div className="phase-account-menu-group">
                <button type="button"><UserRound aria-hidden="true" />个人资料</button>
                <button type="button"><Settings aria-hidden="true" />账户设置</button>
                <button type="button"><CreditCard aria-hidden="true" />订阅管理</button>
                <button type="button"><CircleHelp aria-hidden="true" />帮助中心</button>
              </div>
              <button type="button" className="phase-account-logout"><LogOut aria-hidden="true" />退出登录</button>
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
            <button type="button" className="phase-modal-close" onClick={() => setLayer(null)} aria-label="关闭邀请窗口">
              <X aria-hidden="true" />
            </button>
            <header>
              <h2 id="phase-invite-title">邀请好友加入 Evidra</h2>
              <p>邀请团队成员共同提升内容可信度。</p>
            </header>

            <div className="phase-invite-section">
              <label htmlFor="phase-invite-link">邀请链接</label>
              <div className="phase-invite-link-row">
                <input id="phase-invite-link" value="https://evidra.ai/invite/team" readOnly />
                <button type="button" onClick={copyInviteLink}>
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? "已复制" : "复制链接"}
                </button>
              </div>
            </div>

            <div className="phase-invite-section">
              <span className="phase-invite-label">分享方式</span>
              <div className="phase-share-methods">
                <button type="button"><span className="phase-wechat-mark" aria-hidden="true" />微信</button>
                <button type="button"><Mail aria-hidden="true" className="is-mail" />邮件</button>
                <button type="button"><Link2 aria-hidden="true" />复制链接</button>
              </div>
            </div>

            <div className="phase-invite-records">
              <h3>邀请记录</h3>
              <ul>
                {INVITE_RECORDS.map((record) => (
                  <li key={record.email}>
                    <span className="phase-invite-avatar">{record.name.slice(0, 1)}</span>
                    <div><strong>{record.name}</strong><span>{record.email}</span></div>
                    <p><b className={record.tone}>{record.status}</b><span>{record.date}</span></p>
                  </li>
                ))}
              </ul>
            </div>
            <p className="phase-invite-note">邀请链接长期有效，任何拥有链接的人都可以加入团队。</p>
          </section>
        </div>
      ) : null}

      <button type="button" className="phase-feedback-event-proxy" onClick={onFeedbackClick} tabIndex={-1} aria-hidden="true" />
    </>
  );
}
