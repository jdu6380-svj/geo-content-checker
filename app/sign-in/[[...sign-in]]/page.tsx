import { SignIn } from "@clerk/nextjs";
import Link from "next/link";

export default function SignInPage() {
  const configured = Boolean(
    process.env.CLERK_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
  );
  if (!configured) {
    return <main className="legal-document" aria-labelledby="sign-in-unavailable-title"><h1 id="sign-in-unavailable-title">登录暂不可用</h1><p>身份服务尚未配置。</p><nav aria-label="登录页面导航"><Link href="/">返回首页</Link><Link href="/support">支持与联系</Link></nav></main>;
  }
  return <SignIn routing="path" path="/sign-in" forceRedirectUrl="/onboarding" fallbackRedirectUrl="/onboarding" />;
}
