import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request): Promise<NextResponse> {
  const target = process.env.NEXT_PUBLIC_APP_URL?.trim();
  try {
    const appUrl = new URL(target ?? "");
    if (appUrl.protocol !== "https:" || appUrl.username || appUrl.password) throw new Error("invalid app url");
    return NextResponse.redirect(new URL("/dashboard?billing=success", appUrl), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "PAYMENT_UNAVAILABLE", message: "支付服务尚未配置。" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
