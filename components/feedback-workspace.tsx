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

import { EvidraBrandMark } from "@/components/evidra-brand-mark";

type FeedbackWorkspaceProps = {
  feedbackUrl?: string;
};

export function FeedbackWorkspace({ feedbackUrl }: FeedbackWorkspaceProps) {
  const canOpenForm = Boolean(feedbackUrl?.startsWith("https://"));

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
            <p>告诉我们哪里影响了理解、信任或完成审查。请勿在反馈中粘贴文章正文或其他敏感信息。</p>
          </header>

          <section className="feedback-form-launch" aria-labelledby="feedback-form-heading">
            <span className="feedback-form-icon"><MessageSquareText aria-hidden="true" className="size-5" /></span>
            <div>
              <h2 id="feedback-form-heading">提交 Beta 使用反馈</h2>
              <p>反馈将在 Google Form 中填写，Evidra 不在本页保存输入内容。</p>
            </div>
            {canOpenForm ? (
              <a href={feedbackUrl} target="_blank" rel="noreferrer" className="feedback-primary-action">
                打开反馈表
                <ExternalLink aria-hidden="true" className="size-4" />
              </a>
            ) : (
              <span className="feedback-primary-action is-disabled" aria-disabled="true">反馈表暂不可用</span>
            )}
          </section>

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
                <span><small>微信</small><strong>Du-jQ7</strong></span>
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
