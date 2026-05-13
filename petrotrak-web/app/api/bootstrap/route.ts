import { NextResponse } from "next/server";

import { getSessionFromRequest } from "@/lib/auth";
import { UserProfile } from "@/lib/types";
import { hasXanoConfig, xanoRequest } from "@/lib/xano";

function normalizeRoles(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input.filter((role): role is string => typeof role === "string" && role.length > 0);
  }

  if (typeof input === "string" && input.length > 0) {
    return [input];
  }

  return ["attendant"];
}

function normalizeUser(input: unknown): UserProfile {
  const source = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  let fullName = "Branch User";
  if (typeof source.fullName === "string") {
    fullName = source.fullName;
  } else if (typeof source.name === "string") {
    fullName = source.name;
  }

  let station = "mokwa";
  if (typeof source.station === "string") {
    station = source.station;
  } else if (typeof source.branchCode === "string") {
    station = source.branchCode;
  }

  return {
    id: typeof source.id === "string" ? source.id : `user_${Date.now()}`,
    fullName,
    station,
    roles: normalizeRoles(source.roles ?? source.role),
  };
}

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (hasXanoConfig() && process.env.XANO_USER_ENDPOINT && process.env.XANO_AUTH_BY_PHONE_ENDPOINT) {
      const user = await xanoRequest(process.env.XANO_USER_ENDPOINT);
      return NextResponse.json({
        user: normalizeUser(user),
        source: "xano",
      });
    }
  } catch {
    // Fall back to local sample user when Xano is unavailable.
  }

  return NextResponse.json({
    user: session.user,
    source: "sample",
  });
}
