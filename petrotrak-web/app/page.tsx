"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  CASH_DENOMINATIONS,
  computeCashTotal,
  computeExpectedIncome,
  computeQuantitySold,
  toNumber,
} from "@/lib/calculations";
import { CreditSaleInput, ExpenseInput, ShiftEntryPayload, UserProfile } from "@/lib/types";

const PUMPS = [1, 2, 3, 4, 5, 6, 7];
const SHIFTS = ["morning", "night"] as const;

type CreditSaleRow = { id: string; clientName: string; amountStr: string };
type ExpenseRow = { id: string; name: string; amountStr: string };

function createRowId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

function formatCurrency(value: number): string {
  return `N${value.toLocaleString("en-NG", { maximumFractionDigits: 2 })}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function Home() {
  const router = useRouter();
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [attendantName, setAttendantName] = useState("");
  const [date, setDate] = useState(todayDate());
  const [pumpNumber, setPumpNumber] = useState(1);
  const [shift, setShift] = useState<(typeof SHIFTS)[number]>("morning");

  const [openingLiters, setOpeningLiters] = useState("0");
  const [closingLiters, setClosingLiters] = useState("0");
  const [pricePerLiter, setPricePerLiter] = useState("950");
  const [tankDipLiters, setTankDipLiters] = useState("0");

  const [cashCounts, setCashCounts] = useState<Record<number, string>>({
    1000: "0",
    500: "0",
    200: "0",
    100: "0",
    50: "0",
    20: "0",
    10: "0",
    5: "0",
  });

  const [posAmount, setPosAmount] = useState("0");
  const [bankTransferAmount, setBankTransferAmount] = useState("0");

  const [creditSales, setCreditSales] = useState<CreditSaleRow[]>([
    { id: createRowId("credit"), clientName: "", amountStr: "0" },
  ]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([
    { id: createRowId("expense"), name: "", amountStr: "0" },
  ]);

  const [saveMessage, setSaveMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successSource, setSuccessSource] = useState("");

  useEffect(() => {
    const loadUser = async () => {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      const data = await response.json();
      if (response.status === 401 || !data.user) {
        router.replace("/auth");
        return;
      }
      const profile = data.user as UserProfile;
      setUser(profile);
      setAttendantName(profile.fullName);
    };

    void loadUser();
  }, [router]);

  useEffect(() => {
    if (!showSuccessModal) return;

    const timer = setTimeout(() => {
      setShowSuccessModal(false);
    }, 2600);

    return () => clearTimeout(timer);
  }, [showSuccessModal]);

  const numericOpening = toNumber(openingLiters);
  const numericClosing = toNumber(closingLiters);
  const numericPrice = toNumber(pricePerLiter);

  const quantitySold = useMemo(
    () => computeQuantitySold(numericOpening, numericClosing),
    [numericOpening, numericClosing],
  );

  const expectedIncome = useMemo(
    () => computeExpectedIncome(quantitySold, numericPrice),
    [quantitySold, numericPrice],
  );

  const normalizedCashCounts = useMemo(() => {
    return Object.fromEntries(
      Object.entries(cashCounts).map(([denom, qty]) => [Number(denom), toNumber(qty)]),
    ) as Record<number, number>;
  }, [cashCounts]);

  const cashTotal = useMemo(() => computeCashTotal(normalizedCashCounts), [normalizedCashCounts]);

  const creditTotal = useMemo(
    () => creditSales.reduce((sum, row) => sum + toNumber(row.amountStr), 0),
    [creditSales],
  );

  const creditLiters = useMemo(
    () => creditSales.map((row) => (numericPrice > 0 ? toNumber(row.amountStr) / numericPrice : 0)),
    [creditSales, numericPrice],
  );

  const expensesTotal = useMemo(
    () => expenses.reduce((sum, row) => sum + toNumber(row.amountStr), 0),
    [expenses],
  );

  const electronicCashTotal = toNumber(posAmount) + toNumber(bankTransferAmount);
  const totalReceived = cashTotal + electronicCashTotal;
  const totalOutstanding = creditTotal;
  const totalDeductions = expensesTotal + creditTotal;

  const addCreditSale = () => {
    setCreditSales((prev) => [...prev, { id: createRowId("credit"), clientName: "", amountStr: "0" }]);
  };

  const addExpense = () => {
    setExpenses((prev) => [...prev, { id: createRowId("expense"), name: "", amountStr: "0" }]);
  };

  const submitEntry = async () => {
    if (!user) return;

    const payload: ShiftEntryPayload = {
      date,
      station: user.station,
      pumpNumber,
      shift,
      attendantId: user.id,
      attendantName: attendantName || user.fullName,
      openingLiters: numericOpening,
      closingLiters: numericClosing,
      pricePerLiter: numericPrice,
      tankDipLiters: toNumber(tankDipLiters),
      cashCounts: normalizedCashCounts,
      posAmount: toNumber(posAmount),
      bankTransferAmount: toNumber(bankTransferAmount),
      creditSales: creditSales.map(
        (row): CreditSaleInput => ({
          clientName: row.clientName,
          amount: toNumber(row.amountStr),
          liters: numericPrice > 0 ? toNumber(row.amountStr) / numericPrice : 0,
        }),
      ),
      expenses: expenses.map((row): ExpenseInput => ({ name: row.name, amount: toNumber(row.amountStr) })),
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
      },
    };

    try {
      setIsSaving(true);
      setSaveMessage("");

      const response = await fetch("/api/shift-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save shift entry");
      }

      setSuccessSource(String(data.source ?? "server"));
      setShowSuccessModal(true);
      setSaveMessage("");
    } catch (error) {
      setSaveMessage(error instanceof Error ? error.message : "Unable to save entry");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <main
      className={`mx-auto min-h-screen w-full max-w-md p-4 ${
        isDarkMode
          ? "theme-dark bg-[linear-gradient(180deg,#0f172a_0%,#111827_100%)]"
          : "bg-[linear-gradient(180deg,#f5f7f4_0%,#eef2ec_100%)] text-slate-900"
      }`}
    >
      <div className="header-card rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur">
        <div className="mb-3 flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">PetroTrack</p>
            <h1 className="text-xl font-bold tracking-tight">Mokwa Station</h1>
            <p className="text-xs text-slate-600">7 Pumps · Industrial Zone</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsDarkMode((prev) => !prev)}
              className="header-action-btn rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
            >
              {isDarkMode ? "Light" : "Dark"}
            </button>
            <button className="header-action-btn rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium">
              Alerts
            </button>
            <a
              href="/dips"
              className="header-action-btn rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium"
            >
              Dips
            </a>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="field">
            <span>Select Pump</span>
            <select
              value={pumpNumber}
              onChange={(e) => setPumpNumber(Number(e.target.value))}
              className="input"
            >
              {PUMPS.map((pump) => (
                <option key={pump} value={pump}>
                  Pump {pump}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Select Shift</span>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value as "morning" | "night")}
              className="input"
            >
              {SHIFTS.map((item) => (
                <option key={item} value={item}>
                  {item[0].toUpperCase() + item.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 space-y-3">
        <section className="card">
          <h2 className="card-title">PMS (Premium Motor Spirit)</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span>Attendant Name</span>
              <input
                value={attendantName || (user ? "" : "Loading...")}
                onChange={(e) => setAttendantName(e.target.value)}
                className="input"
                placeholder="Enter attendant name"
              />
              {user && attendantName !== user.fullName && attendantName !== "" && (
                <span className="text-[11px] text-amber-600">⚠ Name changed from original</span>
              )}
            </label>
            <label className="field">
              <span>Date</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input" />
            </label>
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Meter Readings</h3>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <label className="field">
                <span>Opening (L)</span>
                <input
                  value={openingLiters}
                  onChange={(e) => setOpeningLiters(e.target.value)}
                  inputMode="decimal"
                  className="input"
                />
              </label>
              <label className="field">
                <span>Closing (L)</span>
                <input
                  value={closingLiters}
                  onChange={(e) => setClosingLiters(e.target.value)}
                  inputMode="decimal"
                  className="input"
                />
              </label>
            </div>

            <div className="rounded-lg bg-sky-50 p-3">
              <p className="text-[11px] text-slate-500">Quantity Sold</p>
              <p className="text-lg font-bold">{quantitySold.toLocaleString("en-NG")} L</p>
              <p className="mt-0.5 text-[11px] text-slate-400">
                Selling price: {formatCurrency(numericPrice)} / L
              </p>
            </div>

            <div className="rounded-lg bg-emerald-50 p-3">
              <p className="text-[11px] text-slate-500">
                Expected Income &mdash; {quantitySold.toLocaleString("en-NG")} L &times; {formatCurrency(numericPrice)}/L
              </p>
              <p className="text-lg font-bold">{formatCurrency(expectedIncome)}</p>
            </div>
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Tank Inventory & Price</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span>Tank Dip (L)</span>
              <input
                value={tankDipLiters}
                onChange={(e) => setTankDipLiters(e.target.value)}
                inputMode="decimal"
                className="input"
              />
            </label>
            <label className="field">
              <span>Price / L</span>
              <input
                value={pricePerLiter}
                onChange={(e) => setPricePerLiter(e.target.value)}
                inputMode="decimal"
                className="input"
              />
            </label>
          </div>
        </section>

        <section className="card">
          <h3 className="card-title">Cash Denominations</h3>
          <p className="text-[11px] text-slate-500">Enter quantity for each denomination.</p>
          <div className="space-y-2">
            {CASH_DENOMINATIONS.map((denom) => (
              <div key={denom} className="grid grid-cols-[1fr,1fr,1fr] items-center gap-2 rounded-lg bg-slate-50 p-2">
                <span className="text-sm font-medium">N{denom}</span>
                <input
                  className="input"
                  value={cashCounts[denom] ?? "0"}
                  onChange={(e) => setCashCounts((prev) => ({ ...prev, [denom]: e.target.value }))}
                  inputMode="numeric"
                />
                <span className="text-right text-sm font-medium">
                  {formatCurrency(toNumber(cashCounts[denom]) * denom)}
                </span>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-slate-100 p-2 text-sm font-semibold">Total Cash: {formatCurrency(cashTotal)}</div>
        </section>

        <section className="card">
          <h3 className="card-title">Electronic Payments</h3>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span>POS Transactions</span>
              <input value={posAmount} onChange={(e) => setPosAmount(e.target.value)} className="input" inputMode="numeric" />
            </label>
            <label className="field">
              <span>Bank Transfer</span>
              <input
                value={bankTransferAmount}
                onChange={(e) => setBankTransferAmount(e.target.value)}
                className="input"
                inputMode="numeric"
              />
            </label>
          </div>
        </section>

        <section className="card">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="card-title m-0">Credit Sales</h3>
            <button onClick={addCreditSale} className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
              + Add New Credit Sale
            </button>
          </div>
          {creditSales.map((item, index) => (
            <div key={item.id} className="space-y-2 rounded-lg bg-slate-50 p-2">
              <label className="field">
                <span>Client Name</span>
                <input
                  value={item.clientName}
                  onChange={(e) => {
                    const next = [...creditSales];
                    next[index] = { ...next[index], clientName: e.target.value };
                    setCreditSales(next);
                  }}
                  className="input"
                />
              </label>
              <label className="field">
                <span>Amount (&#8358;)</span>
                <input
                  value={item.amountStr}
                  onChange={(e) => {
                    const next = [...creditSales];
                    next[index] = { ...next[index], amountStr: e.target.value };
                    setCreditSales(next);
                  }}
                  className="input"
                  inputMode="decimal"
                />
              </label>
              <p className="text-sm text-slate-500">
                Liters: {(creditLiters[index] ?? 0).toLocaleString("en-NG", { maximumFractionDigits: 2 })} L (auto)
              </p>
            </div>
          ))}
          <p className="text-sm font-semibold">Credit Total: {formatCurrency(creditTotal)}</p>
        </section>

        <section className="card">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="card-title m-0">Expenses & Others</h3>
            <button onClick={addExpense} className="rounded-lg bg-indigo-50 px-2 py-1 text-xs font-semibold text-indigo-700">
              + Add Expense / Other
            </button>
          </div>
          {expenses.map((item, index) => (
            <div key={item.id} className="grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2">
              <label className="field">
                <span>Expense Name</span>
                <input
                  value={item.name}
                  onChange={(e) => {
                    const next = [...expenses];
                    next[index] = { ...next[index], name: e.target.value };
                    setExpenses(next);
                  }}
                  className="input"
                />
              </label>
              <label className="field">
                <span>Amount Spent</span>
                <input
                  value={item.amountStr}
                  onChange={(e) => {
                    const next = [...expenses];
                    next[index] = { ...next[index], amountStr: e.target.value };
                    setExpenses(next);
                  }}
                  className="input"
                  inputMode="decimal"
                />
              </label>
            </div>
          ))}
          <div className="rounded-lg bg-slate-100 p-2 text-sm font-semibold">
            Expenses Total: {formatCurrency(expensesTotal)}
          </div>
        </section>

        <section className="rounded-2xl bg-slate-900 p-4 text-slate-50">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Shift Summary</p>
          <div className="mb-3 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/10 p-2 text-center">
              <p className="text-[11px] text-slate-400">Sales Made</p>
              <p className="text-sm font-bold">{formatCurrency(expectedIncome)}</p>
            </div>
            <div className="rounded-lg bg-white/10 p-2 text-center">
              <p className="text-[11px] text-slate-400">Cash Remitted</p>
              <p className="text-sm font-bold">{formatCurrency(cashTotal)}</p>
            </div>
            <div className="rounded-lg bg-white/10 p-2 text-center">
              <p className="text-[11px] text-slate-400">Electronic Cash</p>
              <p className="text-sm font-bold">{formatCurrency(electronicCashTotal)}</p>
            </div>
            <div className="rounded-lg bg-white/10 p-2 text-center">
              <p className="text-[11px] text-slate-400">Deductions</p>
              <p className="text-sm font-bold text-amber-200">{formatCurrency(totalDeductions)}</p>
            </div>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-[11px] text-slate-400">Credit</p>
              <p className="text-lg font-bold text-rose-200">{formatCurrency(creditTotal)}</p>
            </div>
            <div className="rounded-lg bg-white/10 p-3">
              <p className="text-[11px] text-slate-400">Expenses</p>
              <p className="text-lg font-bold text-rose-200">{formatCurrency(expensesTotal)}</p>
            </div>
          </div>
          <p className="text-xs text-slate-300">Total Received</p>
          <p className="mb-2 text-2xl font-bold">{formatCurrency(totalReceived)}</p>
          <p className="text-xs text-slate-300">Total Outstanding</p>
          <p className="mb-3 text-2xl font-bold text-rose-300">{formatCurrency(totalOutstanding)}</p>
          <button
            disabled={isSaving || !user}
            onClick={submitEntry}
            className="group w-full rounded-full bg-emerald-700 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60"
          >
            {isSaving ? (
              "Saving..."
            ) : (
              <span className="inline-flex items-center justify-center gap-2">
                <span>Send Data to Manager</span>
                <span className="inline-flex h-4 w-4 items-center justify-center">
                  <svg
                    className="h-4 w-4 group-hover:hidden"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m13 6 6 6-6 6" />
                  </svg>
                  <svg
                    className="hidden h-4 w-4 group-hover:block"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="m11 6-6 6 6 6" />
                  </svg>
                </span>
              </span>
            )}
          </button>
          {saveMessage ? <p className="mt-2 text-center text-xs text-slate-300">{saveMessage}</p> : null}
        </section>
      </div>

      {showSuccessModal ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4">
          <div className="relative w-full max-w-sm overflow-hidden rounded-2xl bg-white p-5 text-slate-900 shadow-xl animate-[modal-pop_240ms_ease-out]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
              <span className="absolute left-[10%] top-1 h-2 w-2 rounded-full bg-amber-300 animate-[confetti-drop_900ms_ease-out]" />
              <span className="absolute left-[26%] top-1 h-1.5 w-1.5 rounded-full bg-emerald-300 animate-[confetti-drop_820ms_ease-out_60ms]" />
              <span className="absolute left-[44%] top-1 h-2 w-2 rounded-full bg-indigo-300 animate-[confetti-drop_980ms_ease-out_40ms]" />
              <span className="absolute left-[61%] top-1 h-1.5 w-1.5 rounded-full bg-rose-300 animate-[confetti-drop_870ms_ease-out_90ms]" />
              <span className="absolute left-[79%] top-1 h-2 w-2 rounded-full bg-sky-300 animate-[confetti-drop_920ms_ease-out_70ms]" />
            </div>
            <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5 animate-[check-pop_420ms_ease-out]" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold">Successf. Data has been sent to Admin</h3>
            <p className="mt-1 text-sm text-slate-600">
              Submission channel: {successSource}.
            </p>
            <button
              type="button"
              onClick={() => setShowSuccessModal(false)}
              className="mt-4 w-full rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-600"
            >
              Close Now
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-400">Auto closing...</p>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @keyframes modal-pop {
          0% { opacity: 0; transform: translateY(10px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes confetti-drop {
          0% { opacity: 0; transform: translateY(-12px) rotate(0deg) scale(0.8); }
          25% { opacity: 1; }
          100% { opacity: 0; transform: translateY(72px) rotate(200deg) scale(1); }
        }

        @keyframes check-pop {
          0% { transform: scale(0.6); opacity: 0; }
          70% { transform: scale(1.12); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </main>
  );
}
