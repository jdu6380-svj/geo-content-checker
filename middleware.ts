import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const commercialRoute = createRouteMatcher([
  "/api/commercial(.*)",
  "/api/stripe/checkout(.*)",
  "/api/stripe/plans(.*)",
  "/api/stripe/portal(.*)",
  "/api/stripe/subscription(.*)",
  "/api/alipay/checkout(.*)",
  "/api/alipay/plans(.*)",
  "/api/alipay/operator(.*)",
  "/onboarding(.*)",
  "/dashboard(.*)",
]);
const clerkConfigured = Boolean(
  process.env.CLERK_SECRET_KEY?.trim() && process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim(),
);

export default clerkConfigured
  ? clerkMiddleware(async (auth, request) => {
      if (commercialRoute(request)) await auth.protect();
    })
  : function failClosedCommercialMiddleware(request: Request) {
      const pathname = new URL(request.url).pathname;
      if (
        pathname.startsWith("/api/commercial") ||
        pathname.startsWith("/api/stripe/checkout") ||
        pathname.startsWith("/api/stripe/plans") ||
        pathname.startsWith("/api/stripe/portal") ||
        pathname.startsWith("/api/stripe/subscription") ||
        pathname.startsWith("/api/alipay/checkout") ||
        pathname.startsWith("/api/alipay/plans") ||
        pathname.startsWith("/api/alipay/operator") ||
        pathname.startsWith("/onboarding") ||
        pathname.startsWith("/dashboard")
      ) {
        return NextResponse.json(
          { error: "AUTH_UNAVAILABLE", message: "商业身份服务尚未配置。" },
          { status: 503, headers: { "Cache-Control": "no-store" } },
        );
      }
      return NextResponse.next();
    };

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
