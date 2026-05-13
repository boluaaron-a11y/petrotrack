import { NextResponse } from "next/server";

import { AUTH_COOKIE_NAME, createSessionToken } from "@/lib/auth";
import { UserProfile } from "@/lib/types";
import { verifyOtp } from "@/lib/otpStore";

// Must match the list in /api/auth/start/route.ts
const TEST_PHONES = new Set([
  "+2340000000001",
  "+2340000000002",
  "+2340000000003",
  "+2340000000004",
  "+2340000000005",
]);
const TEST_OTP = "000000";

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

async function resolveUserFromPhone(phone: string): Promise<UserProfile | null> {
  if (process.env.XANO_AUTH_BY_PHONE_ENDPOINT) {    const endpoint = process.env.XANO_AUTH_BY_PHONE_ENDPOINT;
    const baseUrl = process.env.XANO_BASE_URL;
    if (!baseUrl) {
      throw new Error("Missing XANO_BASE_URL");
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      id?: string;
      fullName?: string;
      name?: string;
      station?: string;
      branchCode?: string;
      roles?: string[];
      role?: string;
    };

    const roles = Array.isArray(data.roles)
      ? data.roles.filter((role): role is string => typeof role === "string" && role.length > 0)
      : typeof data.role === "string" && data.role.length > 0
        ? [data.role]
        : ["attendant"];

    return {
      id: data.id ?? `usr_${Date.now()}`,
      fullName: data.fullName ?? data.name ?? phone,
      station: data.station ?? data.branchCode ?? "mokwa",
      roles,
    };
  }

  // Sample mode — use test profile if available, otherwise generic attendant.
  const testProfile = TEST_PHONE_PROFILES[phone];
  if (testProfile) {
    return { id: `usr_${phone}`, ...testProfile };
  }

  return {
    id: `usr_${phone}`,
    fullName: `User ${phone.slice(-4)}`,
    station: "mokwa",
    roles: ["attendant"],
  };
}
const TEST_PHONE_PROFILES: Record<string, Omit<UserProfile, "id">> = {
  "+2340000000001": { fullName: "Super Admin (Test)",  station: "okigwe", roles: ["super_admin", "admin", "manager"] },
  "+2340000000002": { fullName: "Okigwe Manager (Test)", station: "okigwe", roles: ["manager"] },
  "+2340000000003": { fullName: "Branch Admin (Test)",  station: "okigwe", roles: ["admin"] },
  "+2340000000004": { fullName: "Okigwe Attendant (Test)", station: "okigwe", roles: ["attendant"] },
  "+2340000000005": { fullName: "Mokwa Attendant (Test)",  station: "mokwa",   roles: ["attendant"] },
};

export async function POST(request: Request) {
  const body = (await request.json()) as { phone?: string; code?: string };
  const phone = normalizePhone(body.phone ?? "");
  const code = (body.code ?? "").trim();

  if (!phone || !code) {
    return NextResponse.json({ ok: false, error: "Phone and OTP code are required" }, { status: 400 });
  }

  // Test phones bypass the in-memory OTP store (won't survive across serverless invocations)
  const otpValid = TEST_PHONES.has(phone)
    ? code === TEST_OTP
    : verifyOtp(phone, code);

  if (!otpValid) {
    return NextResponse.json({ ok: false, error: "Invalid or expired OTP" }, { status: 401 });
  }

  const user = await resolveUserFromPhone(phone);
  if (!user) {
    return NextResponse.json({ ok: false, error: "User not found for this phone number" }, { status: 403 });
  }

  const token = createSessionToken(user);
  const response = NextResponse.json({ ok: true, user });

  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Number(process.env.AUTH_SESSION_TTL_SECONDS ?? "2592000"),
  });

  return response;
}
