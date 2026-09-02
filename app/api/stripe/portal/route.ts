import { NextRequest, NextResponse } from "next/server";

import { createPortalPost } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest): Promise<NextResponse> {
  return createPortalPost(request);
}
