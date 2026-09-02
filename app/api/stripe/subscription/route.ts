import { NextRequest, NextResponse } from "next/server";

import { getSubscriptionGet } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return getSubscriptionGet(request);
}
