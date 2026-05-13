"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ManagementState,
  PumpProduct,
  formatStationName,
  seedManagementState,
} from "@/lib/adminManagement";
import { ShiftEntryRecord, ShiftType, UserProfile } from "@/lib/types";

type ActiveMenu = "pots" | "management" | "daily-sales";

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function formatCurrency(value: number): string {
  return `₦${value.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
}

function getUserViewLabel(user: UserProfile | null): string {
  if (user?.roles.includes("super_admin")) {
    return "Super Admin View";
  }

  if (user?.roles.includes("manager")) {
    return "Manager View";
  }

  return "Branch Admin View";
}

function SectionTable({
  label,
  entries,
}: {
  readonly label: string;
  readonly entries: ShiftEntryRecord[];
}) {
  const totals = entries.reduce(
    (acc, e) => ({
      expectedIncome: acc.expectedIncome + (e.computed?.expectedIncome ?? 0),
      cashTotal: acc.cashTotal + (e.computed?.cashTotal ?? 0),
      posAmount: acc.posAmount + (e.pos_amount ?? 0),
    }),
    { expectedIncome: 0, cashTotal: 0, posAmount: 0 },
  );

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 bg-emerald-50 px-4 py-3">
        <span className="text-sm font-bold text-emerald-800">{label}</span>
        <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700">
          {entries.length} active pump{entries.length === 1 ? "" : "s"}
        </span>
      </div>

      {entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-slate-400">No entries recorded for this section today.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3 text-left">Pump #</th>
                <th className="px-4 py-3 text-left">Attendant</th>
                <th className="px-4 py-3 text-left">Shift</th>
                <th className="px-4 py-3 text-right">Expected Income</th>
                <th className="px-4 py-3 text-right">Actual Cash</th>
                <th className="px-4 py-3 text-right">POS</th>
                <th className="px-4 py-3 text-right">Variance</th>
              </tr>
            </thead>
            <tbody>
              {entries
                .slice()
                .sort((a, b) => a.pump_number - b.pump_number)
                .map((entry) => {
                  const expected = entry.computed?.expectedIncome ?? 0;
                  const cash = entry.computed?.cashTotal ?? 0;
                  const pos = entry.pos_amount ?? 0;
                  const totalCollected = cash + pos;
                  const variance = totalCollected - expected;
                  const isPositive = variance >= 0;

                  return (
                    <tr key={entry.id} className="border-b border-slate-50 transition-colors hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-xs font-bold text-white">
                          {entry.pump_number}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {entry.attendant_name ?? "—"}
                        <span className="ml-2 text-[11px] text-slate-400">
                          {entry.shift === "morning" ? "☀ Morning" : "🌙 Night"}
                        </span>
                      </td>
                      <td className="px-4 py-3 capitalize text-slate-500">{entry.shift}</td>
                      <td className="px-4 py-3 text-right font-medium">{formatCurrency(expected)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(cash)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(pos)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${isPositive ? "text-emerald-600" : "text-rose-500"}`}>
                        {isPositive ? "+" : ""}
                        {formatCurrency(variance)}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-bold">
                <td colSpan={3} className="px-4 py-3 text-xs uppercase text-slate-500">Section Total</td>
                <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(totals.expectedIncome)}</td>
                <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(totals.cashTotal)}</td>
                <td className="px-4 py-3 text-right text-slate-800">{formatCurrency(totals.posAmount)}</td>
                <td className={`px-4 py-3 text-right ${totals.cashTotal + totals.posAmount >= totals.expectedIncome ? "text-emerald-600" : "text-rose-500"}`}>
                  {formatCurrency(totals.cashTotal + totals.posAmount - totals.expectedIncome)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const [activeMenu, setActiveMenu] = useState<ActiveMenu>("pots");
  const [date, setDate] = useState(todayDate());
  const [entries, setEntries] = useState<ShiftEntryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [user, setUser] = useState<UserProfile | null>(null);
  const [management, setManagement] = useState<ManagementState>(() => seedManagementState("mokwa", "Branch Manager"));
  const [managementLoading, setManagementLoading] = useState(false);
  const [managementError, setManagementError] = useState("");
  const [newBranchName, setNewBranchName] = useState("");
  const [newBranchRegion, setNewBranchRegion] = useState("");
  const [newAttendantName, setNewAttendantName] = useState("");
  const [newAttendantShift, setNewAttendantShift] = useState<ShiftType>("morning");
  const [newAttendantPump, setNewAttendantPump] = useState(1);
  const [selectedBranchCode, setSelectedBranchCode] = useState<string | null>(null);

  useEffect(() => {
    const loadUser = async () => {
      const response = await fetch("/api/bootstrap", { cache: "no-store" });
      if (response.status === 401) {
        router.replace("/auth");
        return;
      }
      const data = await response.json();
      const nextUser = data.user as UserProfile;
      if (!nextUser?.roles?.some((role) => role === "manager" || role === "admin" || role === "super_admin")) {
        router.replace("/");
        return;
      }
      setUser(nextUser);
    };

    void loadUser();
  }, [router]);

  const loadManagement = useCallback(async (branchCode: string, managerName: string) => {
    setManagementLoading(true);
    setManagementError("");

    try {
      const params = new URLSearchParams({ branchCode, managerName });
      const response = await fetch(`/api/admin/management?${params.toString()}`, { cache: "no-store" });
      const data = (await response.json()) as { ok: boolean; error?: string; state?: ManagementState };

      if (!response.ok || !data.ok || !data.state) {
        throw new Error(data.error ?? "Failed to load management data");
      }

      setManagement(data.state);
    } catch (loadError) {
      setManagement(seedManagementState(branchCode, managerName));
      setManagementError(loadError instanceof Error ? loadError.message : "Failed to load management data");
    } finally {
      setManagementLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    void loadManagement(user.station, user.fullName);
  }, [loadManagement, user]);

  const canSwitchBranch = user?.roles?.some((r) => r === "super_admin" || r === "admin") ?? false;
  const currentBranchCode = (canSwitchBranch ? selectedBranchCode : null) ?? user?.station ?? "mokwa";

  const switchBranch = useCallback((code: string) => {
    setSelectedBranchCode(code);
    void loadManagement(code, user?.fullName ?? "Branch Manager");
  }, [loadManagement, user?.fullName]);

  const fetchEntries = useCallback(async (forDate: string) => {
    const station = currentBranchCode;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ date: forDate, station });
      const res = await fetch(`/api/shift-entries?${params.toString()}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Failed to load entries");
      setEntries(data.records as ShiftEntryRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error loading data");
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [currentBranchCode]);

  useEffect(() => {
    void fetchEntries(date);
  }, [date, fetchEntries, currentBranchCode]);

  const currentBranchName = formatStationName(currentBranchCode);
  const currentBranch = useMemo(
    () => management.branches.find((branch) => branch.code === currentBranchCode) ?? {
      code: currentBranchCode,
      name: currentBranchName,
      region: "Not set",
      manager: user?.fullName ?? "Manager",
    },
    [currentBranchCode, currentBranchName, management.branches, user?.fullName],
  );
  const userViewLabel = getUserViewLabel(user);
  const isOwnBranch = !canSwitchBranch || currentBranchCode === (user?.station ?? "mokwa");

  const section1 = entries.filter((e) => e.shift === "morning");
  const section2 = entries.filter((e) => e.shift === "night");

  const summarizeEntries = (records: ShiftEntryRecord[]) => {
    const totals = records.reduce(
      (acc, e) => ({
        expectedIncome: acc.expectedIncome + (e.computed?.expectedIncome ?? 0),
        collected: acc.collected + (e.computed?.cashTotal ?? 0) + (e.pos_amount ?? 0),
      }),
      { expectedIncome: 0, collected: 0 },
    );

    return {
      pumps: records.length,
      expectedIncome: totals.expectedIncome,
      collected: totals.collected,
      variance: totals.collected - totals.expectedIncome,
    };
  };

  const morningSummary = summarizeEntries(section1);
  const nightSummary = summarizeEntries(section2);

  const grandTotals = entries.reduce(
    (acc, e) => ({
      expectedIncome: acc.expectedIncome + (e.computed?.expectedIncome ?? 0),
      cashTotal: acc.cashTotal + (e.computed?.cashTotal ?? 0),
      posAmount: acc.posAmount + (e.pos_amount ?? 0),
    }),
    { expectedIncome: 0, cashTotal: 0, posAmount: 0 },
  );
  const grandCollected = grandTotals.cashTotal + grandTotals.posAmount;
  const grandVariance = grandCollected - grandTotals.expectedIncome;

  const paymentMix = entries.reduce(
    (acc, e) => ({
      cash: acc.cash + (e.computed?.cashTotal ?? 0),
      pos: acc.pos + (e.pos_amount ?? 0),
      bank: acc.bank + (e.bank_transfer_amount ?? 0),
      credit: acc.credit + (e.computed?.creditTotal ?? 0),
    }),
    { cash: 0, pos: 0, bank: 0, credit: 0 },
  );

  const mixTotal = paymentMix.cash + paymentMix.pos + paymentMix.bank + paymentMix.credit;
  const mixSegments = [
    { key: "Cash", value: paymentMix.cash, color: "#059669" },
    { key: "POS", value: paymentMix.pos, color: "#0ea5e9" },
    { key: "Bank", value: paymentMix.bank, color: "#6366f1" },
    { key: "Credit", value: paymentMix.credit, color: "#f43f5e" },
  ];

  let runningAngle = 0;
  const donutGradient =
    mixTotal > 0
      ? `conic-gradient(${mixSegments
          .map((segment) => {
            const angle = (segment.value / mixTotal) * 360;
            const start = runningAngle;
            const end = runningAngle + angle;
            runningAngle = end;
            return `${segment.color} ${start}deg ${end}deg`;
          })
          .join(", ")})`
      : "conic-gradient(#e2e8f0 0deg 360deg)";

  const shiftSeries = [
    { label: "Morning", expected: morningSummary.expectedIncome, collected: morningSummary.collected },
    { label: "Night", expected: nightSummary.expectedIncome, collected: nightSummary.collected },
  ];
  const shiftScaleMax = Math.max(
    morningSummary.expectedIncome,
    morningSummary.collected,
    nightSummary.expectedIncome,
    nightSummary.collected,
    1,
  );

  const branchAttendants = management.attendants.filter((attendant) => attendant.branchCode === currentBranchCode);
  const branchPumps = management.pumps.filter((pump) => pump.branchCode === currentBranchCode);
  const branchAssignments = management.assignments.filter((assignment) => assignment.branchCode === currentBranchCode);

  const branchTanks = management.tanks.filter((tank) => tank.branchCode === currentBranchCode);

  const persistManagement = useCallback(async (method: "POST" | "PATCH", body: object) => {
    setManagementLoading(true);
    setManagementError("");

    try {
      const response = await fetch("/api/admin/management", {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      const data = (await response.json()) as { ok: boolean; error?: string; state?: ManagementState };

      if (!response.ok || !data.ok || !data.state) {
        throw new Error(data.error ?? "Failed to update management data");
      }

      setManagement(data.state);
      return true;
    } catch (updateError) {
      setManagementError(updateError instanceof Error ? updateError.message : "Failed to update management data");
      return false;
    } finally {
      setManagementLoading(false);
    }
  }, []);

  const exportEntries = useCallback(() => {
    const headers = ["Date", "Branch", "Pump", "Shift", "Attendant", "Expected Income", "Cash", "POS", "Bank", "Credit", "Variance"];
    const rows = entries.map((entry) => {
      const expected = entry.computed?.expectedIncome ?? 0;
      const cash = entry.computed?.cashTotal ?? 0;
      const pos = entry.pos_amount ?? 0;
      const bank = entry.bank_transfer_amount ?? 0;
      const credit = entry.computed?.creditTotal ?? 0;
      const variance = cash + pos - expected;
      return [
        entry.date,
        entry.station,
        entry.pump_number,
        entry.shift,
        entry.attendant_name,
        expected,
        cash,
        pos,
        bank,
        credit,
        variance,
      ].join(",");
    });

    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${currentBranchCode}-${date}-pots-export.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [currentBranchCode, date, entries]);

  const addBranch = async () => {
    if (!newBranchName.trim()) return;
    const didSave = await persistManagement("POST", {
      type: "create_branch",
      name: newBranchName.trim(),
      region: newBranchRegion.trim(),
    });
    if (!didSave) return;
    setNewBranchName("");
    setNewBranchRegion("");
  };

  const addAttendant = async () => {
    if (!newAttendantName.trim()) return;
    const didSave = await persistManagement("POST", {
      type: "create_attendant",
      name: newAttendantName.trim(),
      branchCode: currentBranchCode,
      shift: newAttendantShift,
      pumpId: newAttendantPump,
      roles: ["attendant"],
    });
    if (!didSave) return;
    setNewAttendantName("");
  };

  const updateTankProduct = async (tankId: number, product: PumpProduct) => {
    await persistManagement("PATCH", {
      type: "update_tank",
      branchCode: currentBranchCode,
      tankId,
      product,
    });
  };

  const updatePumpProduct = async (pumpId: number, product: PumpProduct) => {
    await persistManagement("PATCH", {
      type: "update_pump",
      branchCode: currentBranchCode,
      pumpId,
      product,
    });
  };

  const updateAssignment = async (assignmentId: string, field: "shift" | "pumpId" | "attendantId", value: string) => {
    await persistManagement("PATCH", {
      type: "update_assignment",
      branchCode: currentBranchCode,
      assignmentId,
      field,
      value,
    });
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f5f7f4_0%,#eef2ec_100%)]">
      <header className="border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-emerald-700">PetroTrack</p>
            <h1 className="text-lg font-bold text-slate-900">Admin Dashboard</h1>
            {canSwitchBranch ? (
              <div className="mt-1.5 flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-500">Viewing branch:</span>
                <div className="flex gap-1">
                  {management.branches.map((branch) => (
                    <button
                      key={branch.code}
                      onClick={() => switchBranch(branch.code)}
                      className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
                        currentBranchCode === branch.code
                          ? "bg-emerald-700 text-white"
                          : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                      }`}
                    >
                      {branch.name}
                    </button>
                  ))}
                </div>
                {isOwnBranch ? null : (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-600 ring-1 ring-amber-200">
                    Other branch
                  </span>
                )}
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">{currentBranch.name}</p>
            )}
          </div>
          <div className="text-right">
            <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
              {userViewLabel}
            </span>
            <p className="mt-2 text-xs text-slate-500">{user?.fullName ?? "Loading user..."}</p>
          </div>
        </div>

        <nav className="mx-auto flex max-w-6xl gap-1 px-6 pb-0">
          <button
            onClick={() => setActiveMenu("pots")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeMenu === "pots"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            POTS
          </button>
          <button
            onClick={() => setActiveMenu("management")}
            className={`border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeMenu === "management"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-500 hover:text-slate-700"
            }`}
          >
            Branch Setup
          </button>
          <button
            onClick={() => setActiveMenu("daily-sales")}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              activeMenu === "daily-sales"
                ? "border-emerald-600 text-emerald-700"
                : "border-transparent text-slate-400"
            }`}
          >
            <span>Daily Sales Analysis</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-slate-400">
              Soon
            </span>
          </button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {activeMenu === "pots" && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{currentBranch.name} Operations Dashboard</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Live branch activity for {currentBranch.region} · attendant records, pumps, shifts, and financial performance
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="admin-date" className="text-xs font-semibold text-slate-500">Date</label>
                <input
                  id="admin-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={() => void fetchEntries(date)}
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"
                >
                  Refresh
                </button>
                <button
                  onClick={exportEntries}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Export CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Active Pumps</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{entries.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Expected</p>
                <p className="mt-1 text-2xl font-bold text-slate-900">{formatCurrency(grandTotals.expectedIncome)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Collected</p>
                <p className="mt-1 text-2xl font-bold text-emerald-700">{formatCurrency(grandCollected)}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Variance</p>
                <p className={`mt-1 text-2xl font-bold ${grandVariance >= 0 ? "text-emerald-600" : "text-rose-500"}`}>
                  {grandVariance >= 0 ? "+" : ""}
                  {formatCurrency(grandVariance)}
                </p>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-600">Morning Shift</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">
                    {morningSummary.pumps} pump{morningSummary.pumps === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">Expected {formatCurrency(morningSummary.expectedIncome)} · Collected {formatCurrency(morningSummary.collected)}</p>
                <p className={`mt-1 text-sm font-semibold ${morningSummary.variance >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  Variance {morningSummary.variance >= 0 ? "+" : ""}{formatCurrency(morningSummary.variance)}
                </p>
              </div>

              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wide text-indigo-700">Night Shift</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-indigo-700 ring-1 ring-indigo-200">
                    {nightSummary.pumps} pump{nightSummary.pumps === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">Expected {formatCurrency(nightSummary.expectedIncome)} · Collected {formatCurrency(nightSummary.collected)}</p>
                <p className={`mt-1 text-sm font-semibold ${nightSummary.variance >= 0 ? "text-emerald-700" : "text-rose-600"}`}>
                  Variance {nightSummary.variance >= 0 ? "+" : ""}{formatCurrency(nightSummary.variance)}
                </p>
              </div>
            </div>

            {loading && <div className="py-12 text-center text-sm text-slate-500">Loading pump entries…</div>}
            {!loading && error && (
              <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                {error}
              </div>
            )}

            {!loading && !error && (
              <div className="space-y-4">
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">Shift Performance</h3>
                      <span className="text-xs font-medium text-slate-400">Expected vs Collected</span>
                    </div>

                    <div className="space-y-4">
                      {shiftSeries.map((series) => (
                        <div key={series.label}>
                          <div className="mb-1 flex items-center justify-between text-xs">
                            <span className="font-semibold text-slate-700">{series.label}</span>
                            <span className="text-slate-500">{formatCurrency(series.collected)} / {formatCurrency(series.expected)}</span>
                          </div>
                          <div className="space-y-1.5">
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-slate-300" style={{ width: `${Math.max((series.expected / shiftScaleMax) * 100, 2)}%` }} />
                            </div>
                            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.max((series.collected / shiftScaleMax) * 100, 2)}%` }} />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="mt-3 flex items-center gap-4 text-[11px] text-slate-500">
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-slate-300" />Expected</span>
                      <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" />Collected</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-900">Payment Mix</h3>
                      <span className="text-xs font-medium text-slate-400">Today</span>
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="relative h-32 w-32 shrink-0 rounded-full" style={{ background: donutGradient }}>
                        <div className="absolute inset-[18%] rounded-full bg-white" />
                        <div className="absolute inset-0 flex items-center justify-center text-center">
                          <div>
                            <p className="text-[10px] uppercase tracking-wide text-slate-400">Total</p>
                            <p className="text-xs font-bold text-slate-900">{formatCurrency(mixTotal)}</p>
                          </div>
                        </div>
                      </div>

                      <div className="min-w-0 flex-1 space-y-2">
                        {mixSegments.map((segment) => {
                          const pct = mixTotal > 0 ? (segment.value / mixTotal) * 100 : 0;
                          return (
                            <div key={segment.key} className="flex items-center justify-between gap-2 text-xs">
                              <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                                <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
                                {segment.key}
                              </span>
                              <span className="text-slate-500">{formatCurrency(segment.value)} ({pct.toFixed(0)}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>

                <SectionTable label="Section 1 — Morning Shift (Pumps 1–8)" entries={section1} />
                <SectionTable label="Section 2 — Night Shift (Pumps 1–8)" entries={section2} />
              </div>
            )}
          </div>
        )}

        {activeMenu === "management" && (
          <div className="space-y-6">
            {managementError && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {managementError}
              </div>
            )}

            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">{currentBranch.name} Branch Setup</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  Manage attendants, pumps, products, and shift allocations for this branch.
                </p>
              </div>
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
                {managementLoading ? "Syncing changes..." : `Branch scoped to ${currentBranch.code}`}
              </span>
            </div>

            <div className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <h3 className="text-sm font-bold text-slate-900">Branch Profile</h3>
                <div className="mt-3 space-y-2 text-sm text-slate-600">
                  <p><span className="font-semibold text-slate-900">Branch:</span> {currentBranch.name}</p>
                  <p><span className="font-semibold text-slate-900">Region:</span> {currentBranch.region}</p>
                  <p><span className="font-semibold text-slate-900">Manager:</span> {currentBranch.manager}</p>
                  <p><span className="font-semibold text-slate-900">Attendants:</span> {branchAttendants.length}</p>
                  <p><span className="font-semibold text-slate-900">Configured Pumps:</span> {branchPumps.length}</p>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Super Admin Branch Creation</h3>
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 ring-1 ring-amber-200">Scaffolded</span>
                </div>
                <div className="mt-3 grid gap-3 md:grid-cols-[1.3fr_1fr_auto]">
                  <input
                    value={newBranchName}
                    onChange={(e) => setNewBranchName(e.target.value)}
                    placeholder="New branch name"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <input
                    value={newBranchRegion}
                    onChange={(e) => setNewBranchRegion(e.target.value)}
                    placeholder="Region / State"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <button onClick={addBranch} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                    Create Branch
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {management.branches.map((branch) => (
                    <span key={branch.code} className="rounded-full bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200">
                      {branch.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Attendant Management</h3>
                  <span className="text-xs text-slate-400">{currentBranch.name}</span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-[1.4fr_auto_auto_auto]">
                  <input
                    value={newAttendantName}
                    onChange={(e) => setNewAttendantName(e.target.value)}
                    placeholder="Add attendant name"
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  />
                  <select
                    value={newAttendantShift}
                    onChange={(e) => setNewAttendantShift(e.target.value as ShiftType)}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    <option value="morning">Morning</option>
                    <option value="night">Night</option>
                  </select>
                  <select
                    value={newAttendantPump}
                    onChange={(e) => setNewAttendantPump(Number(e.target.value))}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  >
                    {branchPumps.map((pump) => (
                      <option key={pump.id} value={pump.id}>Pump {pump.id}</option>
                    ))}
                  </select>
                  <button onClick={addAttendant} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
                    Add
                  </button>
                </div>

                <div className="mt-4 space-y-2">
                  {branchAttendants.map((attendant) => (
                    <div key={attendant.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                      <div>
                        <p className="font-semibold text-slate-900">{attendant.name}</p>
                        <p className="text-xs text-slate-500">Pump {attendant.pumpId} · {attendant.shift} · {attendant.roles.join(", ")}</p>
                      </div>
                      <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${attendant.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}>
                        {attendant.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Pump Setup</h3>
                  <span className="text-xs text-slate-400">Products by pump</span>
                </div>
                <div className="mt-3 space-y-2">
                  {branchPumps.map((pump) => (
                    <div key={pump.id} className="grid items-center gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 md:grid-cols-[auto_1fr_auto_auto]">
                      <span className="text-sm font-semibold text-slate-900">Pump {pump.pumpNumber ?? pump.id}</span>
                      <select
                        value={pump.product}
                        onChange={(e) => updatePumpProduct(pump.id, e.target.value as PumpProduct)}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="PMS">PMS</option>
                        <option value="AGO">AGO</option>
                        <option value="LPG">LPG</option>
                        <option value="KERO">KERO</option>
                      </select>
                      {pump.tankNumber != null && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700 ring-1 ring-blue-200">
                          Tank {pump.tankNumber}
                        </span>
                      )}
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500 ring-1 ring-slate-200">
                        {pump.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {branchTanks.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-slate-900">Tank Configuration</h3>
                  <span className="text-xs text-slate-400">{currentBranch.name}</span>
                </div>
                <div className="mt-3 space-y-2">
                  {branchTanks
                    .slice()
                    .sort((a, b) => a.tankNumber - b.tankNumber)
                    .map((tank) => (
                      <div key={tank.id} className="grid items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 md:grid-cols-[auto_1fr_auto]">
                        <div className="flex flex-col gap-1">
                          <span className="text-sm font-semibold text-slate-900">Tank {tank.tankNumber}</span>
                          {tank.linkedTankNumber != null && (
                            <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700 ring-1 ring-amber-200 w-fit">
                              Linked ↔ Tank {tank.linkedTankNumber}
                            </span>
                          )}
                        </div>
                        <div className="space-y-1">
                          <select
                            value={tank.product}
                            onChange={(e) => updateTankProduct(tank.id, e.target.value as PumpProduct)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="PMS">PMS</option>
                            <option value="AGO">AGO</option>
                            <option value="LPG">LPG</option>
                            <option value="KERO">KERO</option>
                          </select>
                          {tank.notes && (
                            <p className="text-[11px] text-slate-400">{tank.notes}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-semibold text-slate-500">
                            {branchPumps.filter((p) => p.tankNumber === tank.tankNumber).map((p) => `P${p.pumpNumber ?? p.id}`).join(", ") || "No pumps"}
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
                <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700 ring-1 ring-amber-200">
                  ⚠ Tanks marked <strong>Linked ↔</strong> are mutually exclusive — only one may be open at a time. Ensure the correct tank valve is opened before recording dips.
                </p>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Shift Allocation</h3>
                <span className="text-xs text-slate-400">Assign attendant + shift + pump</span>
              </div>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-400">
                      <th className="px-2 py-2">Shift</th>
                      <th className="px-2 py-2">Pump</th>
                      <th className="px-2 py-2">Attendant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchAssignments.map((assignment) => (
                      <tr key={assignment.id} className="border-b border-slate-50">
                        <td className="px-2 py-2">
                          <select
                            value={assignment.shift}
                            onChange={(e) => updateAssignment(assignment.id, "shift", e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            <option value="morning">Morning</option>
                            <option value="night">Night</option>
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={assignment.pumpId}
                            onChange={(e) => updateAssignment(assignment.id, "pumpId", e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            {branchPumps.map((pump) => (
                              <option key={pump.id} value={pump.id}>Pump {pump.id} · {pump.product}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <select
                            value={assignment.attendantId}
                            onChange={(e) => updateAssignment(assignment.id, "attendantId", e.target.value)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                          >
                            {branchAttendants.map((attendant) => (
                              <option key={attendant.id} value={attendant.id}>{attendant.name}</option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {activeMenu === "daily-sales" && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
              <svg className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-slate-700">Daily Sales Analysis</h3>
            <p className="mt-1 max-w-sm text-sm text-slate-400">
              This section is under construction. Sales charts, trends, and per-pump performance reports will appear here soon.
            </p>
            <span className="mt-4 rounded-full bg-amber-50 px-4 py-1.5 text-xs font-bold uppercase tracking-wide text-amber-600 ring-1 ring-amber-200">
              Coming Soon
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
