import Link from "next/link";
import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = { title: "支持与联系" };

export default function SupportPage() {
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  const feedback = process.env.NEXT_PUBLIC_FEEDBACK_URL?.trim();
  const safeEmail = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  let safeFeedback: string | null = null;
  try { if (feedback && new URL(feedback).protocol === "https:") safeFeedback = feedback; } catch { safeFeedback = null; }
  return <LegalDocument title="支持与联系" summary="在不提交敏感支付或账户信息的前提下联系 Evidra 支持。" sections={[
    { title: "团队与交付支持", content: <><p>登录、工作区共享额度、客户项目、交付报告或分析运行问题可通过下方已配置渠道联系。我们不会在此页面承诺固定响应时间。</p>{safeEmail ? <p>支持邮箱：<a href={`mailto:${safeEmail}`}>{safeEmail}</a></p> : <p>支持邮箱暂未配置。</p>}</> },
    { title: "反馈入口", content: safeFeedback ? <p><a href={safeFeedback} rel="noreferrer">打开安全反馈入口</a></p> : <p>反馈入口暂未配置。</p> },
    { title: "支付与退款审核", content: <><p>退款仅通过受控人工审核处理。请说明账户与工作区问题，但不要发送私钥、签名、Cookie、完整订单号或原始支付回调。</p><p><Link href="/terms">查看套餐、额度与退款说明</Link></p></> },
    { title: "数据请求", content: <p><Link href="/privacy">查看商业账户、运行结果和支付记录的数据说明</Link></p> },
  ]} />;
}
