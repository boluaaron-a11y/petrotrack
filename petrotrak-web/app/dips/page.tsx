"use client";

import Link from "next/link";
import { useState } from "react";

const TANKS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function DipsPage() {
  const [date, setDate] = useState(todayDate());
  const [station, setStation] = useState("");
  const [dips, setDips] = useState<Record<number, string>>(
    Object.fromEntries(TANKS.map((t) => [t, "0"])),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ text: "", ok: true });

  const handleSubmit = async () => {
    if (!station.trim()) {
      setMessage({ text: "Please enter a station name.", ok: false });
      return;
    }

    setSaving(true);
    setMessage({ text: "", ok: true });

    try {
      const response = await fetch("/api/dips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          station: station.trim(),
          tanks: Object.fromEntries(TANKS.map((t) => [t, Number(dips[t]) || 0])),
        }),
      });

      const data = await response.json() as { ok: boolean; error?: string };

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to save");
      }

      setMessage({ text: "Dip readings saved successfully!", ok: true });
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Failed to save dip readings",
        ok: false,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto min-h-screen w-full max-w-md p-4 bg-[linear-gradient(180deg,#f5f7f4_0%,#eef2ec_100%)] text-slate-900">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white/85 p-4 shadow-sm backdrop-blur mb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">PetroTrack</p>
            <h1 className="text-xl font-bold tracking-tight">Tank Dip Readings</h1>
            <p className="text-xs text-slate-500">Tanks 1 – 8 · Daily Record</p>
          </div>
          <Link
            href="/"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            ← Shift Entry
          </Link>
        </div>
      </div>

      <div className="space-y-3">
        {/* Date & Station */}
        <section className="card">
          <h2 className="card-title">Entry Details</h2>
          <div className="grid grid-cols-2 gap-2">
            <label className="field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="input"
              />
            </label>
            <label className="field">
              <span>Station Name</span>
              <input
                value={station}
                onChange={(e) => setStation(e.target.value)}
                placeholder="e.g. Mokwa"
                className="input"
              />
            </label>
          </div>
        </section>

        {/* Tank Dips */}
        <section className="card">
          <h2 className="card-title">Tank Dip Levels (Litres)</h2>
          <p className="mb-3 text-[11px] text-slate-500">Enter the current dip measurement for each tank.</p>
          <div className="space-y-2">
            {TANKS.map((tank) => (
              <div
                key={tank}
                className="grid grid-cols-[auto,1fr] items-center gap-3 rounded-lg bg-slate-50 p-2"
              >
                <span className="inline-flex h-7 w-14 items-center justify-center rounded-full bg-emerald-700 text-xs font-bold text-white">
                  Tank {tank}
                </span>
                <input
                  value={dips[tank]}
                  onChange={(e) => setDips((prev) => ({ ...prev, [tank]: e.target.value }))}
                  inputMode="decimal"
                  className="input"
                  placeholder="0"
                />
              </div>
            ))}
          </div>
        </section>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="w-full rounded-full bg-emerald-700 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Submit Dip Readings"}
        </button>

        {message.text ? (
          <p
            className={`text-center text-sm font-medium ${
              message.ok ? "text-emerald-700" : "text-rose-600"
            }`}
          >
            {message.text}
          </p>
        ) : null}
      </div>
    </main>
  );
}
