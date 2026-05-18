import { NextResponse } from "next/server";

import { computeCashTotal, computeCreditAmounts, computeExpectedIncome, computeQuantitySold } from "@/lib/calculations";
import { getSessionFromRequest, hasAnyRole } from "@/lib/auth";
import { getLocalShiftEntries, saveLocalShiftEntry } from "@/lib/shiftEntryStore";
import { ShiftEntryPayload, ShiftEntryRecord } from "@/lib/types";
import { hasXanoConfig, xanoRequest } from "@/lib/xano";

const SHIFT_ENTRIES_ENDPOINT = process.env.XANO_SHIFT_ENTRIES_ENDPOINT ?? "/shift_entries";

type XanoShiftEntryRecord = Record<string, unknown>;

function toNonNegativeNumber(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function toStringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toShiftType(value: unknown): ShiftEntryRecord["shift"] {
  return value === "night" ? "night" : "morning";
}

function toNumberValue(value: unknown, fallback = 0): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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

function toXanoShiftEntry(payload: ShiftEntryPayload) {
  return {
    date: payload.date,
    station: payload.station,
    pump_number: payload.pumpNumber,
    shift: payload.shift,
    attendant_id: payload.attendantId,
    attendant_name: payload.attendantName,
    opening_liters: payload.openingLiters,
    closing_liters: payload.closingLiters,
    price_per_liter: payload.pricePerLiter,
    tank_dip_liters: payload.tankDipLiters,
    cash_counts: payload.cashCounts,
    pos_amount: payload.posAmount,
    bank_transfer_amount: payload.bankTransferAmount,
    credit_sales: payload.creditSales,
    expenses: payload.expenses,
    computed: payload.computed,
  };
}

function normalizeXanoShiftEntry(record: XanoShiftEntryRecord): ShiftEntryRecord {
  const computed = typeof record.computed === "object" && record.computed !== null
    ? record.computed as ShiftEntryRecord["computed"]
    : {
        quantitySold: toNumberValue(record.quantity_sold),
        expectedIncome: toNumberValue(record.expected_income),
        cashTotal: toNumberValue(record.cash_total),
        electronicCashTotal: toNumberValue(record.electronic_cash_total),
        totalReceived: toNumberValue(record.total_received),
        expensesTotal: toNumberValue(record.expenses_total),
        creditTotal: toNumberValue(record.credit_total),
        totalDeductions: toNumberValue(record.total_deductions),
        totalOutstanding: toNumberValue(record.total_outstanding),
        reconciliationDifference: toNumberValue(record.reconciliation_difference),
      };

  return {
    id: toNumberValue(record.id, Date.now()),
    created_at: toNumberValue(record.created_at, Date.now()),
    date: toStringValue(record.date),
    station: toStringValue(record.station),
    pump_number: toNumberValue(record.pump_number),
    shift: toShiftType(record.shift),
    attendant_id: toStringValue(record.attendant_id),
    attendant_name: toStringValue(record.attendant_name, "Unknown Attendant"),
    opening_liters: toNumberValue(record.opening_liters),
    closing_liters: toNumberValue(record.closing_liters),
    price_per_liter: toNumberValue(record.price_per_liter),
    tank_dip_liters: toNumberValue(record.tank_dip_liters),
    cash_counts: typeof record.cash_counts === "object" && record.cash_counts !== null
      ? record.cash_counts as Record<number, number>
      : {},
    pos_amount: toNumberValue(record.pos_amount),
    bank_transfer_amount: toNumberValue(record.bank_transfer_amount),
    credit_sales: Array.isArray(record.credit_sales) ? record.credit_sales as ShiftEntryRecord["credit_sales"] : [],
    expenses: Array.isArray(record.expenses) ? record.expenses as ShiftEntryRecord["expenses"] : [],
    computed,
  };
}

function normalizeXanoShiftEntries(payload: unknown): ShiftEntryRecord[] {
  const records = Array.isArray(payload)
    ? payload
    : typeof payload === "object" && payload !== null && Array.isArray((payload as { records?: unknown }).records)
      ? (payload as { records: unknown[] }).records
      : [];

  return records.map((record) => normalizeXanoShiftEntry(record as XanoShiftEntryRecord));
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
    if (hasXanoConfig()) {
      const params = new URLSearchParams();
      if (date) params.set("date", date);
      if (station) params.set("station", station);
      const qs = params.toString() ? `?${params.toString()}` : "";

      const records = await xanoRequest<unknown>(
        `${SHIFT_ENTRIES_ENDPOINT}${qs}`,
      );
      return NextResponse.json({ ok: true, source: "xano", records: normalizeXanoShiftEntries(records) });
    }
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Failed to fetch entries" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    source: "sample",
    records: getLocalShiftEntries({ date, station }),
  });
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
    if (hasXanoConfig()) {
      const saved = await xanoRequest<unknown>(SHIFT_ENTRIES_ENDPOINT, {
        method: "POST",
        body: toXanoShiftEntry(sanitizedPayload),
      });

      return NextResponse.json({
        ok: true,
        source: "xano",
        record: normalizeXanoShiftEntry(saved as XanoShiftEntryRecord),
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
    record: saveLocalShiftEntry(sanitizedPayload),
  });
}
