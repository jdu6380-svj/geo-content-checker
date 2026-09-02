import { NextResponse } from "next/server";

import {
  createCommercialOnboardingGet,
  createCommercialOnboardingPost,
} from "./handler";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<NextResponse> {
  return createCommercialOnboardingGet(request);
}

export async function POST(request: Request): Promise<NextResponse> {
  return createCommercialOnboardingPost(request);
}
