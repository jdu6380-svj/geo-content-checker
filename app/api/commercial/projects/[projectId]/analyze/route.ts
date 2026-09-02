import { NextRequest, NextResponse } from "next/server";

import { postCommercialAnalyze } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ projectId: string }> }): Promise<NextResponse> {
  return postCommercialAnalyze(request, context);
}
