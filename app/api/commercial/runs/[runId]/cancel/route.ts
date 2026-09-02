import { NextResponse } from "next/server";

import { postCommercialRunCancel } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ runId: string }> }): Promise<NextResponse> {
  return postCommercialRunCancel(request, context);
}
