import { NextResponse } from "next/server";

import { createAlipayPlansGet } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return createAlipayPlansGet(request);
}
