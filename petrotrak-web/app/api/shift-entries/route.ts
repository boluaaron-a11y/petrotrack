import { NextResponse } from "next/server";

import { computeCashTotal, computeCreditAmounts, computeExpectedIncome, computeQuantitySold } from "@/lib/calculations";
import { getSessionFromRequest, hasAnyRole } from "@/lib/auth";
import { deleteLocalShiftEntry, getLocalShiftEntries, saveLocalShiftEntry } from "@/lib/shiftEntryStore";
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
    pumpNumber: payload.pumpNumber,
    shift: payload.shift,
    attendantId: payload.attendantId,
    attendantName: payload.attendantName,
    openingLiters: payload.openingLiters,
    closingLiters: payload.closingLiters,
    pricePerLiter: payload.pricePerLiter,
    tankDipLiters: payload.tankDipLiters,
    cashCounts: payload.cashCounts,
    posAmount: payload.posAmount,
    bankTransferAmount: payload.bankTransferAmount,
    creditSales: payload.creditSales,
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

function findDuplicateEntry(records: ShiftEntryRecord[], payload: ShiftEntryPayload): ShiftEntryRecord | undefined {
  return records.find((record) => (
    record.date === payload.date &&
    record.station === payload.station &&
    record.shift === payload.shift &&
    (
      record.pump_number === payload.pumpNumber ||
      record.attendant_id === payload.attendantId
    )
  ));
}

async function getExistingEntriesForPayload(payload: ShiftEntryPayload): Promise<ShiftEntryRecord[]> {
  if (hasXanoConfig()) {
    const params = new URLSearchParams({ date: payload.date, station: payload.station });
    const records = await xanoRequest<unknown>(`${SHIFT_ENTRIES_ENDPOINT}?${params.toString()}`);
    return normalizeXanoShiftEntries(records);
  }

  return getLocalShiftEntries({ date: payload.date, station: payload.station });
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
    const duplicate = findDuplicateEntry(await getExistingEntriesForPayload(sanitizedPayload), sanitizedPayload);
    if (duplicate) {
      const reason = duplicate.pump_number === sanitizedPayload.pumpNumber
        ? `Pump ${sanitizedPayload.pumpNumber}`
        : sanitizedPayload.attendantName || "This attendant";

      return NextResponse.json(
        {
          ok: false,
          code: "DUPLICATE_SHIFT_ENTRY",
          error: `${reason} already has an entry for this date and shift. Change the pump, shift, date, or ask an admin to delete the existing entry before resubmitting.`,
          duplicate,
        },
        { status: 409 },
      );
    }

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

export async function DELETE(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  if (!hasAnyRole(session, ["super_admin", "admin", "manager"])) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get("id"));
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ ok: false, error: "Valid entry id is required." }, { status: 400 });
  }

  try {
    if (hasXanoConfig()) {
      await xanoRequest(`${SHIFT_ENTRIES_ENDPOINT}/${id}`, { method: "DELETE" });
      return NextResponse.json({ ok: true });
    }
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error: "Delete is not available until the shift-entry delete endpoint is added to the backend.",
      },
      { status: 501 },
    );
  }

  const deleted = deleteLocalShiftEntry(id);
  if (!deleted) {
    return NextResponse.json({ ok: false, error: "Entry not found." }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
