import { SignUp } from "@clerk/nextjs";
import Link from "next/link";

export default function SignUpPage() {
  const configured = Boolean(
    process.env.CLERK_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
  );
  if (!configured) {
    return <main className="legal-document" aria-labelledby="sign-up-unavailable-title"><h1 id="sign-up-unavailable-title">注册暂不可用</h1><p>身份服务尚未配置。</p><nav aria-label="注册页面导航"><Link href="/">返回首页</Link><Link href="/support">支持与联系</Link></nav></main>;
  }
  return <SignUp routing="path" path="/sign-up" forceRedirectUrl="/onboarding" fallbackRedirectUrl="/onboarding" />;
}
