import { NextResponse } from "next/server";

import { createOtp, setOtp } from "@/lib/otpStore";

const TEST_PHONES = new Set([
  "+2340000000001",
  "+2340000000002",
  "+2340000000003",
  "+2340000000004",
  "+2340000000005",
]);
const TEST_OTP = "000000";
const allowTestOtp = process.env.NODE_ENV !== "production";

function isValidPhone(phone: string): boolean {
  return /^\+?[1-9]\d{7,14}$/.test(phone.trim());
}

export async function POST(request: Request) {
  const body = (await request.json()) as { phone?: string };
  const phone = body.phone?.trim() ?? "";

  if (!isValidPhone(phone)) {
    return NextResponse.json({ ok: false, error: "Invalid phone number format" }, { status: 400 });
  }

  if (allowTestOtp && TEST_PHONES.has(phone)) {
    setOtp(phone, TEST_OTP, 300);
    return NextResponse.json({ ok: true, sent: false });
  }

  const code = createOtp(phone, 300);

  const termiiApiKey = process.env.TERMII_API_KEY;
  const termiiSender = process.env.TERMII_SENDER_ID ?? "PetroTrack";

  if (termiiApiKey) {
    const termiiUrl = process.env.TERMII_BASE_URL ?? "https://api.ng.termii.com/api/sms/send";
    const message = `Your PetroTrack passcode is ${code}. It expires in 5 minutes.`;

    const smsResponse = await fetch(termiiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: termiiApiKey,
        to: phone,
        from: termiiSender,
        sms: message,
        type: "plain",
        channel: "generic",
      }),
      cache: "no-store",
    });

    if (!smsResponse.ok) {
      return NextResponse.json({ ok: false, error: "Failed to send passcode" }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sent: true });
  }

  return NextResponse.json({
    ok: true,
    sent: false,
  });
}
