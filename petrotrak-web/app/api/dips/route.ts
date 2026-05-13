import { NextResponse } from "next/server";

import { hasXanoConfig, xanoRequest } from "@/lib/xano";

function sanitizeDipValue(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    date?: unknown;
    station?: unknown;
    tanks?: Record<string, unknown>;
  };

  const date = String(body.date ?? "").slice(0, 10);
  const station = String(body.station ?? "").slice(0, 60).trim();

  if (!date || !station) {
    return NextResponse.json(
      { ok: false, error: "date and station are required" },
      { status: 400 },
    );
  }

  const tanks: Record<number, number> = {};
  for (let i = 1; i <= 8; i++) {
    tanks[i] = sanitizeDipValue(body.tanks?.[i] ?? body.tanks?.[String(i)]);
  }

  try {
    if (hasXanoConfig() && process.env.XANO_DIPS_ENDPOINT) {
      const saved = await xanoRequest(process.env.XANO_DIPS_ENDPOINT, {
        method: "POST",
        body: { date, station, tanks },
      });

      return NextResponse.json({ ok: true, source: "xano", record: saved });
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save dip readings",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    source: "sample",
    record: { date, station, tanks, saved_at: new Date().toISOString() },
  });
}
