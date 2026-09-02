"use client";

import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
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
    const subject = encodeURIComponent("Evidra 产品使用反馈");
    const body = encodeURIComponent([
      "请告诉我们你的真实体验、问题或建议：",
      problem.trim() || "未填写",
      "",
      "你希望我们如何改进：",
      improvement.trim() || "未填写",
    ].join("\n"));
    return `mailto:3949536640@qq.com?subject=${subject}&body=${body}`;
  }, [improvement, problem]);
  const canSubmit = Boolean(problem.trim() || improvement.trim());

  return (
    <main className="feedback-page">
      <header className="feedback-topbar">
        <Link href="/" className="feedback-brand" aria-label="返回 Evidra 审查工作台">
          <EvidraBrandMark className="feedback-brand-mark" />
          <span>
            <strong>Evidra</strong>
            <small>内容可信度审查</small>
          </span>
        </Link>
        <div className="feedback-topbar-actions">
          <span><ShieldCheck aria-hidden="true" className="size-3.5" />安全反馈</span>
          <Link href="/"><ArrowLeft aria-hidden="true" className="size-4" />返回工作台</Link>
        </div>
      </header>

      <section className="feedback-content">
        <header className="feedback-hero">
          <div>
            <p className="section-kicker">Evidra 产品反馈</p>
            <h1>帮助我们做得更好</h1>
            <p>告诉我们你的真实体验。你的反馈会直接帮助 Evidra 改进内容可信度审查体验。</p>
          </div>
          <span className="feedback-hero-icon"><MessageSquareText aria-hidden="true" className="size-6" /></span>
        </header>

        <div className="feedback-layout">
          <section className="feedback-panel" aria-labelledby="feedback-form-heading">
            <header className="feedback-heading">
              <p className="section-kicker">开放反馈</p>
              <h2 id="feedback-form-heading">请告诉我们你的真实体验</h2>
              <p>请勿粘贴文章正文、API 密钥或其他敏感信息。</p>
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
                  placeholder="描述影响理解、信任或完成审查的问题…"
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
          </section>

          <aside className="feedback-aside" aria-label="反馈联系方式与福利">
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
                  <span className="feedback-contact-meta">添加时请备注 Evidra</span>
                </div>
              </div>
            </section>

            <section className="feedback-benefit" aria-labelledby="feedback-benefit-heading">
              <span className="feedback-benefit-icon"><ShieldCheck aria-hidden="true" className="size-5" /></span>
              <div>
                <p className="section-kicker">反馈边界</p>
                <h2 id="feedback-benefit-heading">请勿提交敏感内容</h2>
                <p>反馈仅用于改进产品体验，不会自动创建额度、订阅或退款承诺。</p>
              </div>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}
