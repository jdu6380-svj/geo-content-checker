import { NextRequest, NextResponse } from "next/server";

import { createAlipayCheckoutPost } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return createAlipayCheckoutPost(request);
}
