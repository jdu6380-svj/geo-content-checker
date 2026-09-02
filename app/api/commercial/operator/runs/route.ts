import { NextResponse } from "next/server";

import { createRunRecoveryGet, createRunRecoveryPost } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return createRunRecoveryGet(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return createRunRecoveryPost(request);
}
