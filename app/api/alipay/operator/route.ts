import { NextResponse } from "next/server";

import { createOperatorGet, createOperatorPost } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return createOperatorGet(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return createOperatorPost(request);
}
