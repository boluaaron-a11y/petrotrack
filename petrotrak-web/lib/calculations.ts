import { CreditSaleInput } from "@/lib/types";

export const CASH_DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5] as const;

export function toNumber(value: string | number): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function computeQuantitySold(openingLiters: number, closingLiters: number): number {
  return Math.max(0, closingLiters - openingLiters);
}

export function computeExpectedIncome(quantitySold: number, pricePerLiter: number): number {
  return quantitySold * pricePerLiter;
}

export function computeCashTotal(cashCounts: Record<number, number>): number {
  return CASH_DENOMINATIONS.reduce((sum, denom) => {
    const qty = cashCounts[denom] ?? 0;
    return sum + qty * denom;
  }, 0);
}

export function computeCreditAmounts(creditSales: CreditSaleInput[]): number[] {
  return creditSales.map((entry) => Math.max(0, entry.amount ?? 0));
}
