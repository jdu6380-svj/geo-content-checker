import { NextRequest, NextResponse } from "next/server";

import { createCheckoutPost } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return createCheckoutPost(request);
}
