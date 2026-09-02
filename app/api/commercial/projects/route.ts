import { NextRequest, NextResponse } from "next/server";

import { createCommercialProject, getCommercialProjects } from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest): Promise<NextResponse> {
  return getCommercialProjects(request);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return createCommercialProject(request);
}
