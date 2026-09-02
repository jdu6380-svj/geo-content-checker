import { CommercialDashboard } from "@/components/commercial-dashboard";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default function DashboardPage() {
  const clerkConfigured = Boolean(
    process.env.CLERK_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
  );
  const commercialConfigured = Boolean(
    process.env.COMMERCIAL_AUTH_ADAPTER?.trim() && process.env.COMMERCIAL_DATA_ADAPTER?.trim(),
  );

  if (!clerkConfigured || !commercialConfigured) {
    return (
      <main className="commercial-dashboard commercial-dashboard-locked" aria-labelledby="commercial-dashboard-locked-title">
        <section className="commercial-dashboard-locked-panel">
          <h1 id="commercial-dashboard-locked-title">商业工作台暂不可用</h1>
          <p>身份或商业数据服务尚未配置。请完成受控配置后再访问项目数据。</p>
          <nav aria-label="商业工作台导航"><Link href="/">返回首页</Link><Link href="/support">支持与联系</Link></nav>
        </section>
      </main>
    );
  }

  return <CommercialDashboard />;
}
