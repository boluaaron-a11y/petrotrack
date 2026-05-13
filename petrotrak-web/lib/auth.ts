import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

import { UserProfile } from "@/lib/types";

export type AppRole = "super_admin" | "admin" | "manager" | "attendant";

export type AuthSession = {
  user: UserProfile;
  issuedAt: number;
  expiresAt: number;
};

export const AUTH_COOKIE_NAME = "pt_session";
const SESSION_TTL_SECONDS = Number(process.env.AUTH_SESSION_TTL_SECONDS ?? "2592000");

function getSessionSecret(): string {
  const secret = process.env.AUTH_SESSION_SECRET;
  if (!secret || secret.length < 32) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Missing AUTH_SESSION_SECRET or secret is shorter than 32 chars");
    }
    // Development fallback — NOT safe for production
    return "dev-only-insecure-fallback-secret-32chars!!";
  }
  return secret;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8")
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function base64UrlDecode(input: string): string {
  const normalized = input.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(padded, "base64").toString("utf8");
}

function signPayload(payload: string): string {
  return createHmac("sha256", getSessionSecret()).update(payload).digest("base64url");
}

export function createSessionToken(user: UserProfile): string {
  const now = Math.floor(Date.now() / 1000);
  const session: AuthSession = {
    user,
    issuedAt: now,
    expiresAt: now + SESSION_TTL_SECONDS,
  };
  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = signPayload(payload);
  return `${payload}.${signature}`;
}

export function parseSessionToken(token: string | undefined | null): AuthSession | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payload, signature] = parts;
  const expected = signPayload(payload);

  const expectedBytes = Buffer.from(expected);
  const providedBytes = Buffer.from(signature);
  if (expectedBytes.length !== providedBytes.length) return null;
  if (!timingSafeEqual(expectedBytes, providedBytes)) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as AuthSession;
    if (!parsed?.user?.id || !Array.isArray(parsed.user.roles)) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function getSessionFromRequest(request: Request | NextRequest): AuthSession | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookieEntry = cookieHeader
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${AUTH_COOKIE_NAME}=`));

  if (!cookieEntry) return null;
  const token = cookieEntry.slice(AUTH_COOKIE_NAME.length + 1);
  return parseSessionToken(token);
}

export function hasAnyRole(session: AuthSession, allowed: AppRole[]): boolean {
  const roles = session.user.roles as AppRole[];
  return allowed.some((role) => roles.includes(role));
}

export function isBranchAllowed(session: AuthSession, branchCode: string): boolean {
  if (hasAnyRole(session, ["super_admin", "admin"])) return true;
  return session.user.station === branchCode;
}
