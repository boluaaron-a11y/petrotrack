import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const AUTH_COOKIE_NAME = "pt_session";
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 120;
const apiRateStore = new Map<string, { count: number; windowStart: number }>();

const PUBLIC_PATHS = ["/auth", "/dips", "/api/auth/start", "/api/auth/verify", "/api/auth/session", "/api/auth/logout", "/api/dips"];

function isPublicPath(pathname: string): boolean {
  if (pathname.startsWith("/_next") || pathname.startsWith("/favicon")) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

function getClientKey(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  return ip;
}

function isRateLimited(request: NextRequest): boolean {
  if (!request.nextUrl.pathname.startsWith("/api/")) return false;

  const now = Date.now();
  const key = getClientKey(request);
  const current = apiRateStore.get(key);

  if (!current || now - current.windowStart >= RATE_LIMIT_WINDOW_MS) {
    apiRateStore.set(key, { count: 1, windowStart: now });
    return false;
  }

  current.count += 1;
  apiRateStore.set(key, current);
  return current.count > RATE_LIMIT_MAX;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isRateLimited(request)) {
    console.warn(`[security] rate-limit hit for ${getClientKey(request)} on ${pathname}`);
    return NextResponse.json({ ok: false, error: "Too many requests" }, { status: 429 });
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const hasSessionCookie = Boolean(request.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (hasSessionCookie) {
    return NextResponse.next();
  }

  console.warn(`[security] unauthorized request path=${pathname} ip=${getClientKey(request)}`);

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = "/auth";
  redirectUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(redirectUrl);
}

export const config = {
  matcher: ["/:path*"],
};
