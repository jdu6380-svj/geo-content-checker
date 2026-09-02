import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(): Promise<NextResponse> {
  return NextResponse.json(
    { error: "ANALYSIS_LAUNCH_REQUIRED", message: "请通过项目分析入口启动内容审查。" },
    { status: 409, headers: { "Cache-Control": "no-store" } },
  );
}
