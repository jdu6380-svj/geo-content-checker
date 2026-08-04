"use client";

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  Gift,
  Mail,
  MessageSquareText,
  MessagesSquare,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { EvidraBrandMark } from "@/components/evidra-brand-mark";

type FeedbackWorkspaceProps = {
  feedbackUrl?: string;
};

export function FeedbackWorkspace({ feedbackUrl }: FeedbackWorkspaceProps) {
  const canOpenForm = Boolean(feedbackUrl?.startsWith("https://"));
  const [problem, setProblem] = useState("");
  const [improvement, setImprovement] = useState("");
  const mailtoUrl = useMemo(() => {
    const subject = encodeURIComponent("Evidra Beta 使用反馈");
    const body = encodeURIComponent([
      "你遇到了什么问题？",
      problem.trim() || "未填写",
      "",
      "你希望我们如何改进？",
      improvement.trim() || "未填写",
    ].join("\n"));
    return `mailto:3949536640@qq.com?subject=${subject}&body=${body}`;
  }, [improvement, problem]);
  const canSubmit = Boolean(problem.trim() || improvement.trim());

  return (
    <main className="feedback-page">
      <aside className="feedback-sidebar" aria-label="反馈页导航">
        <Link href="/" className="feedback-brand" aria-label="返回 Evidra 审查工作台">
          <EvidraBrandMark className="feedback-brand-mark" />
          <span>
            <strong>Evidra</strong>
            <small>内容可信度审查</small>
          </span>
        </Link>

        <nav className="feedback-navigation">
          <Link href="/" className="feedback-navigation-item">
            <ArrowLeft aria-hidden="true" className="size-4" />
            返回审查工作台
          </Link>
          <span className="feedback-navigation-item is-active" aria-current="page">
            <MessageSquareText aria-hidden="true" className="size-4" />
            产品反馈
          </span>
        </nav>

        <div className="feedback-sidebar-footer">
          <span><ShieldCheck aria-hidden="true" className="size-3.5" />受控 Beta</span>
          <div>
            <Link href="/privacy">隐私</Link>
            <Link href="/terms">条款</Link>
          </div>
        </div>
      </aside>

      <section className="feedback-content">
        <div className="feedback-panel">
          <header className="feedback-heading">
            <p className="section-kicker">Evidra Beta</p>
            <h1>帮助我们做得更好</h1>
            <p>你的反馈会帮助我们改进审查体验。请勿粘贴文章正文、API 密钥或其他敏感信息。</p>
          </header>

          <form className="feedback-form" onSubmit={(event) => event.preventDefault()}>
            <div className="feedback-field">
              <div className="feedback-field-heading">
                <label htmlFor="feedback-problem">你遇到了什么问题？</label>
                <span>{problem.length} / 1000</span>
              </div>
              <textarea
                id="feedback-problem"
                value={problem}
                onChange={(event) => setProblem(event.target.value)}
                maxLength={1000}
                placeholder="请描述影响理解、信任或完成审查的问题…"
              />
            </div>

            <div className="feedback-field">
              <div className="feedback-field-heading">
                <label htmlFor="feedback-improvement">你希望我们如何改进？</label>
                <span>{improvement.length} / 1000</span>
              </div>
              <textarea
                id="feedback-improvement"
                value={improvement}
                onChange={(event) => setImprovement(event.target.value)}
                maxLength={1000}
                placeholder="告诉我们更理想的体验、信息或操作方式…"
              />
            </div>

            <div className="feedback-form-actions">
              {canOpenForm ? (
                <a href={feedbackUrl} target="_blank" rel="noreferrer" className="feedback-secondary-action">
                  打开完整反馈表
                  <ExternalLink aria-hidden="true" className="size-4" />
                </a>
              ) : null}
              <a
                href={canSubmit ? mailtoUrl : undefined}
                aria-disabled={!canSubmit}
                className={`feedback-primary-action ${canSubmit ? "" : "is-disabled"}`}
              >
                提交反馈
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
            </div>
          </form>

          <section className="feedback-contact-section" aria-labelledby="feedback-contact-heading">
            <div>
              <p className="section-kicker">联系方式</p>
              <h2 id="feedback-contact-heading">需要补充说明？</h2>
            </div>
            <div className="feedback-contact-list">
              <a href="mailto:3949536640@qq.com" className="feedback-contact-row">
                <span className="feedback-contact-icon is-email"><Mail aria-hidden="true" className="size-5" /></span>
                <span><small>邮箱</small><strong>3949536640@qq.com</strong></span>
                <ArrowRight aria-hidden="true" className="size-4" />
              </a>
              <div className="feedback-contact-row">
                <span className="feedback-contact-icon is-wechat"><MessagesSquare aria-hidden="true" className="size-5" /></span>
                <span><small>绿泡泡</small><strong>Du-jQ7</strong></span>
                <span className="feedback-contact-meta">添加时请备注 Evidra Beta</span>
              </div>
            </div>
          </section>

          <section className="feedback-benefit" aria-labelledby="feedback-benefit-heading">
            <span className="feedback-benefit-icon"><Gift aria-hidden="true" className="size-5" /></span>
            <div>
              <h2 id="feedback-benefit-heading">反馈福利</h2>
              <p>感谢参与 Evidra Beta 测试。完成有效反馈后，将获得测试用户专属福利。</p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}
