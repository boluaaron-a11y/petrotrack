export type ShiftType = "morning" | "night";

export type UserProfile = {
  id: string;
  fullName: string;
  station: string;
  roles: string[];
};

export type CreditSaleInput = {
  clientName: string;
  amount: number;   // primary: the naira amount charged
  liters: number;   // derived: amount ÷ pricePerLiter
};

export type ExpenseInput = {
  name: string;
  amount: number;
};

export type ShiftEntryRecord = {
  id: number;
  created_at: number;
  date: string;
  station: string;
  pump_number: number;
  shift: ShiftType;
  attendant_id: string;
  attendant_name: string;
  opening_liters: number;
  closing_liters: number;
  price_per_liter: number;
  tank_dip_liters: number;
  cash_counts: Record<number, number>;
  pos_amount: number;
  bank_transfer_amount: number;
  credit_sales: CreditSaleInput[];
  expenses: ExpenseInput[];
  computed: {
    quantitySold: number;
    expectedIncome: number;
    cashTotal: number;
    totalReceived: number;
    creditTotal: number;
    totalOutstanding: number;
  };
};
export type ShiftEntryPayload = {
  date: string;
  station: string;
  pumpNumber: number;
  shift: ShiftType;
  attendantId: string;
  attendantName: string;
  openingLiters: number;
  closingLiters: number;
  pricePerLiter: number;
  tankDipLiters: number;
  cashCounts: Record<number, number>;
  posAmount: number;
  bankTransferAmount: number;
  creditSales: CreditSaleInput[];
  expenses: ExpenseInput[];
  computed: {
    quantitySold: number;
    expectedIncome: number;
    cashTotal: number;
    totalReceived: number;
    creditTotal: number;
    totalOutstanding: number;
  };
};
