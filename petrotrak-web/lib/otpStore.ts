type OtpRecord = {
  code: string;
  expiresAt: number;
};

const otpStore = new Map<string, OtpRecord>();

function normalizePhone(phone: string): string {
  return phone.replace(/\s+/g, "").trim();
}

export function createOtp(phone: string, ttlSeconds = 300): string {
  const normalized = normalizePhone(phone);
  const code = String(Math.floor(100000 + Math.random() * 900000));
  otpStore.set(normalized, {
    code,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
  return code;
}

export function setOtp(phone: string, code: string, ttlSeconds = 300): void {
  const normalized = normalizePhone(phone);
  otpStore.set(normalized, {
    code,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

export function verifyOtp(phone: string, code: string): boolean {
  const normalized = normalizePhone(phone);
  const record = otpStore.get(normalized);
  if (!record) return false;
  if (record.expiresAt < Date.now()) {
    otpStore.delete(normalized);
    return false;
  }
  const ok = record.code === code.trim();
  if (ok) otpStore.delete(normalized);
  return ok;
}
