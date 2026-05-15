import { NextResponse } from "next/server";

import { computeCashTotal, computeCreditAmounts, computeExpectedIncome, computeQuantitySold } from "@/lib/calculations";
import { getSessionFromRequest, hasAnyRole } from "@/lib/auth";
import { ShiftEntryPayload, ShiftEntryRecord } from "@/lib/types";
import { hasXanoConfig, xanoRequest } from "@/lib/xano";

function toNonNegativeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function sanitizePayload(input: ShiftEntryPayload): ShiftEntryPayload {
  const openingLiters = toNonNegativeNumber(input.openingLiters);
  const closingLiters = toNonNegativeNumber(input.closingLiters);
  const pricePerLiter = toNonNegativeNumber(input.pricePerLiter);

  const normalizedCashCounts = Object.fromEntries(
    Object.entries(input.cashCounts ?? {}).map(([denom, qty]) => [Number(denom), toNonNegativeNumber(qty)]),
  ) as Record<number, number>;

  const creditSales = (input.creditSales ?? []).slice(0, 200).map((entry) => ({
    clientName: String(entry.clientName ?? "").slice(0, 80),
    amount: toNonNegativeNumber(entry.amount),
    liters: toNonNegativeNumber(entry.liters),
  }));

  const expenses = (input.expenses ?? []).slice(0, 200).map((entry) => ({
    name: String(entry.name ?? "").slice(0, 80),
    amount: toNonNegativeNumber(entry.amount),
  }));

  const quantitySold = computeQuantitySold(openingLiters, closingLiters);
  const expectedIncome = computeExpectedIncome(quantitySold, pricePerLiter);
  const cashTotal = computeCashTotal(normalizedCashCounts);
  const creditTotal = computeCreditAmounts(creditSales).reduce((sum, amount) => sum + amount, 0);
  const expensesTotal = expenses.reduce((sum, entry) => sum + entry.amount, 0);
  const electronicCashTotal = toNonNegativeNumber(input.posAmount) + toNonNegativeNumber(input.bankTransferAmount);
  const totalReceived = cashTotal + electronicCashTotal;
  const totalDeductions = expensesTotal + creditTotal;
  const totalOutstanding = expectedIncome - totalReceived;
  const reconciliationDifference = totalReceived + totalDeductions - expectedIncome;

  return {
    ...input,
    openingLiters,
    closingLiters,
    pricePerLiter,
    tankDipLiters: toNonNegativeNumber(input.tankDipLiters),
    cashCounts: normalizedCashCounts,
    posAmount: toNonNegativeNumber(input.posAmount),
    bankTransferAmount: toNonNegativeNumber(input.bankTransferAmount),
    creditSales,
    expenses,
    computed: {
      quantitySold,
      expectedIncome,
      cashTotal,
      electronicCashTotal,
      totalReceived,
      expensesTotal,
      creditTotal,
      totalDeductions,
      totalOutstanding,
      reconciliationDifference,
    },
  };
}

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const requestedStation = searchParams.get("station") ?? session.user.station;
  const station = hasAnyRole(session, ["admin", "super_admin"])
    ? requestedStation
    : session.user.station;

  try {
    if (hasXanoConfig() && process.env.XANO_SHIFT_ENTRIES_ENDPOINT) {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (station) params.set("station", station);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const records = await xanoRequest<ShiftEntryRecord[]>(
        `${process.env.XANO_SHIFT_ENTRIES_ENDPOINT}${qs}`,
      );
      return NextResponse.json({ ok: true, source: "xano", records });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch entries" },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, source: "sample", records: [] });
}

export async function POST(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as ShiftEntryPayload;

  if (!payload.attendantId || !payload.date) {
    return NextResponse.json(
      { error: "Missing required shift entry fields." },
      { status: 400 },
    );
  }

  const userIsAdmin = hasAnyRole(session, ["admin", "super_admin", "manager"]);
  if (!userIsAdmin && payload.attendantId !== session.user.id) {
    return NextResponse.json({ ok: false, error: "Forbidden: attendant can only submit own entries" }, { status: 403 });
  }

  if (payload.station !== session.user.station && !hasAnyRole(session, ["admin", "super_admin"])) {
    return NextResponse.json({ ok: false, error: "Forbidden: cross-branch entry is not allowed" }, { status: 403 });
  }

  const sanitizedPayload = sanitizePayload(payload);

  try {
    if (hasXanoConfig() && process.env.XANO_SHIFT_ENTRIES_ENDPOINT) {
      const saved = await xanoRequest(process.env.XANO_SHIFT_ENTRIES_ENDPOINT, {
        method: "POST",
        body: sanitizedPayload,
      });

      return NextResponse.json({
        ok: true,
        source: "xano",
        record: saved,
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to save shift entry",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    source: "sample",
    record: {
      id: `sample_${Date.now()}`,
      ...sanitizedPayload,
    },
  });
}
