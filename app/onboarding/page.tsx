import { OrganizationSwitcher } from "@clerk/nextjs";
import Link from "next/link";

import { CommercialWorkspaceOnboarding } from "@/components/commercial-workspace-onboarding";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  const configured = Boolean(
    process.env.COMMERCIAL_AUTH_ADAPTER === "clerk" &&
    process.env.COMMERCIAL_DATA_ADAPTER === "neon" &&
    process.env.CLERK_SECRET_KEY?.trim() &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim() &&
    process.env.DATABASE_URL?.trim() &&
    (process.env.COMMERCIAL_WORKSPACE_BOOTSTRAP === "clerk-org" || process.env.COMMERCIAL_CLERK_ORG_WORKSPACE_MAP?.trim()),
  );
  if (!configured) {
    return <main className="commercial-onboarding" aria-labelledby="commercial-onboarding-title"><section><h1 id="commercial-onboarding-title">工作区设置暂不可用</h1><p>Clerk、Neon 或工作区解析模式尚未完成受控配置。</p><nav aria-label="工作区设置导航"><Link href="/">返回首页</Link><Link href="/support">支持与联系</Link></nav></section></main>;
  }
  return <main className="commercial-onboarding" aria-labelledby="commercial-onboarding-title">
    <section>
      <p className="commercial-eyebrow">Authenticated onboarding</p>
      <h1 id="commercial-onboarding-title">设置内容团队工作区</h1>
      <p>选择已有组织，或创建一个新组织。工作区身份始终来自已验证的 Clerk session，不读取 URL 或表单中的 workspace 标识。</p>
      <OrganizationSwitcher hidePersonal afterCreateOrganizationUrl="/onboarding" afterSelectOrganizationUrl="/onboarding" />
      <CommercialWorkspaceOnboarding />
    </section>
  </main>;
}
