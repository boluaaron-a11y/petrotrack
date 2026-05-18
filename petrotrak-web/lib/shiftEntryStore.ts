import { ShiftEntryPayload, ShiftEntryRecord } from "@/lib/types";

type ShiftEntryFilters = {
  date?: string | null;
  station?: string | null;
};

const globalStore = globalThis as typeof globalThis & {
  __petrotrakShiftEntries?: ShiftEntryRecord[];
};

const shiftEntries = globalStore.__petrotrakShiftEntries ?? [];
globalStore.__petrotrakShiftEntries = shiftEntries;

function createRecord(payload: ShiftEntryPayload): ShiftEntryRecord {
  return {
    id: Date.now(),
    created_at: Date.now(),
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

export function saveLocalShiftEntry(payload: ShiftEntryPayload): ShiftEntryRecord {
  const record = createRecord(payload);
  shiftEntries.unshift(record);
  return record;
}

export function getLocalShiftEntries(filters: ShiftEntryFilters = {}): ShiftEntryRecord[] {
  return shiftEntries.filter((entry) => {
    if (filters.date && entry.date !== filters.date) return false;
    if (filters.station && entry.station !== filters.station) return false;
    return true;
  });
}
