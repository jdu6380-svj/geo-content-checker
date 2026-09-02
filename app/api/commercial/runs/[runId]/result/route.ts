import { NextRequest, NextResponse } from "next/server";

import { getCommercialResult } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ runId: string }> }): Promise<NextResponse> {
  return getCommercialResult(request, context);
}
