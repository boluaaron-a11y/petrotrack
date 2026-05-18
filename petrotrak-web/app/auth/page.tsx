"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function AuthPage() {
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const sendOtp = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Failed to send passcode");
      }

      setOtpSent(true);
      setMessage("Passcode sent to your phone number");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to send passcode");
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      const data = await response.json();

      if (!response.ok || !data.ok) {
        throw new Error(data.error ?? "Passcode verification failed");
      }

      router.replace("/");
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Passcode verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center p-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">PetroTrack</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900">Phone Sign In</h1>
        <p className="mt-2 text-sm text-slate-500">Enter your phone number to receive a one-time passcode.</p>

        <form onSubmit={otpSent ? verifyOtp : sendOtp} className="mt-4 space-y-3">
          <label className="block text-sm font-medium text-slate-700">
            Phone Number
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+2348012345678"
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
              required
            />
          </label>

          {otpSent && (
            <label className="block text-sm font-medium text-slate-700">
              Passcode
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2"
                required
              />
            </label>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
          >
            {loading ? "Please wait..." : otpSent ? "Verify and Continue" : "Send Passcode"}
          </button>

          {otpSent && (
            <button
              type="button"
              onClick={() => setOtpSent(false)}
              className="w-full rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Change Number
            </button>
          )}
        </form>

        {message && <p className="mt-3 text-sm text-slate-600">{message}</p>}
      </div>
    </main>
  );
}
