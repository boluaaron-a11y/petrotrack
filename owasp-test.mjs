import http from "http";

const BASE = "http://localhost:3000";

function req(method, path, body, extraHeaders = {}) {
  return new Promise((resolve) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port || 3000,
      path: url.pathname + url.search,
      method,
      headers: { "Content-Type": "application/json", ...extraHeaders },
    };
    const r = http.request(opts, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () =>
        resolve({ status: res.statusCode, headers: res.headers, body: d })
      );
    });
    r.on("error", (e) => resolve({ status: "ERR", headers: {}, body: e.message }));
    if (body !== undefined && body !== null) r.write(JSON.stringify(body));
    r.end();
  });
}

const results = [];
function record(id, category, label, verdict, detail) {
  results.push({ id, category, label, verdict, detail });
  const sym = verdict === "FAIL" ? "❌ FAIL" : verdict === "PASS" ? "✅ PASS" : "⚠️  WARN";
  console.log(`[${id}] ${sym}  ${label}`);
  if (detail) console.log(`         → ${detail}`);
}

console.log("\n════════════════════════════════════════════");
console.log(" PETROTRACK OWASP TOP 10 SECURITY AUDIT");
console.log("════════════════════════════════════════════\n");

// ─────────────────────────────────────────────
// A01: BROKEN ACCESS CONTROL
// ─────────────────────────────────────────────
console.log("── A01: BROKEN ACCESS CONTROL ──────────────");

let r = await req("GET", "/api/admin/management?branchCode=mokwa");
record("A01-1", "A01", "GET /api/admin/management with no auth token",
  r.status === 200 ? "FAIL" : "PASS",
  `HTTP ${r.status}. Admin data returned to unauthenticated caller`);

r = await req("GET", "/admin");
record("A01-2", "A01", "GET /admin page with no session",
  r.status === 200 ? "FAIL" : "PASS",
  `HTTP ${r.status}. Admin UI accessible without authentication`);

r = await req("POST", "/api/admin/management", { type: "create_branch", name: "UNAUTH_BRANCH_TEST", region: "Pwned" });
record("A01-3", "A01", "POST create_branch mutation with no auth",
  r.status < 400 ? "FAIL" : "PASS",
  `HTTP ${r.status}. ${r.status < 400 ? "Mutation attempted without auth - Xano rejected with " + r.status : "Blocked"}`);

r = await req("POST", "/api/shift-entries", {
  attendantId: "VICTIM_999", date: "2026-01-01", station: "mokwa", pumpNumber: 1, shift: "morning",
  attendantName: "Impersonated", openingLiters: 100, closingLiters: 50, pricePerLiter: 700,
  tankDipLiters: 50, cashCounts: {}, posAmount: 0, bankTransferAmount: 0, creditSales: [], expenses: [],
  computed: { quantitySold: 50, expectedIncome: 35000, cashTotal: 0, totalReceived: 0, creditTotal: 0, totalOutstanding: 35000 }
});
record("A01-4", "A01", "POST shift entry as another user (IDOR - no ownership check)",
  r.status < 400 ? "FAIL" : "PASS",
  `HTTP ${r.status}. Can submit shift entry for any attendantId without ownership verification`);

r = await req("GET", "/api/shift-entries?date=2026-01-01&station=mokwa");
record("A01-5", "A01", "GET all shift entries with no auth",
  r.status === 200 ? "FAIL" : "PASS",
  `HTTP ${r.status}. All shift entry data exposed to unauthenticated caller`);

// ─────────────────────────────────────────────
// A02: CRYPTOGRAPHIC FAILURES
// ─────────────────────────────────────────────
console.log("\n── A02: CRYPTOGRAPHIC FAILURES ─────────────");

r = await req("GET", "/");
const hsts = r.headers["strict-transport-security"];
const csp = r.headers["content-security-policy"];
record("A02-1", "A02", "HSTS header present",
  hsts ? "PASS" : "FAIL",
  hsts || "Strict-Transport-Security header missing - page is not HTTPS-enforced");

record("A02-2", "A02", "Content-Security-Policy header present",
  csp ? "PASS" : "FAIL",
  csp || "CSP header missing - XSS payloads not restricted by browser policy");

// Check if API key exposed in response
r = await req("GET", "/api/admin/management?branchCode=mokwa");
const xanoKeyExposed = r.body.includes("XANO_API_KEY") || r.body.includes("x8ki-letl");
record("A02-3", "A02", "Xano base URL or API key not leaked in API response",
  xanoKeyExposed ? "FAIL" : "PASS",
  xanoKeyExposed ? "Xano config details exposed in response body" : "No Xano config leaked");

// ─────────────────────────────────────────────
// A03: INJECTION
// ─────────────────────────────────────────────
console.log("\n── A03: INJECTION ───────────────────────────");

r = await req("POST", "/api/admin/management", { type: "create_branch", name: "<script>alert(document.cookie)</script>", region: "Test" });
const xssStored = r.body.includes("<script>") || r.body.includes("alert(");
record("A03-1", "A03", "XSS payload in branch name rejected or sanitized",
  (r.status >= 400 || !xssStored) ? "PASS" : "FAIL",
  `HTTP ${r.status}. ${xssStored ? "Script tag stored in response: STORED XSS" : "XSS not reflected in this response (may be stored in DB)"}`);

r = await req("GET", "/api/admin/management?branchCode=mokwa'+OR+'1'='1");
record("A03-2", "A03", "SQL injection in branchCode param",
  r.status >= 400 ? "PASS" : "WARN",
  `HTTP ${r.status}. SQLi chars passed through to Xano - Xano handles SQL internally but no app-level sanitization`);

r = await req("GET", "/api/admin/management?branchCode=../../../etc/passwd");
record("A03-3", "A03", "Path traversal in branchCode",
  r.status >= 400 ? "PASS" : "WARN",
  `HTTP ${r.status}. Path traversal payload passed to Xano with no local sanitization`);

r = await req("POST", "/api/shift-entries", {
  attendantId: "x", date: "2026-01-01", station: "mokwa", pumpNumber: 1, shift: "morning",
  attendantName: "Test", openingLiters: -99999, closingLiters: -99999, pricePerLiter: 700,
  tankDipLiters: 0, cashCounts: {}, posAmount: 0, bankTransferAmount: 0, creditSales: [], expenses: [],
  computed: { quantitySold: 0, expectedIncome: 0, cashTotal: 0, totalReceived: 0, creditTotal: 0, totalOutstanding: 0 }
});
record("A03-4", "A03", "Negative liters rejected (business logic / data integrity)",
  r.status >= 400 ? "PASS" : "FAIL",
  `HTTP ${r.status}. Negative liters accepted without validation`);

r = await req("POST", "/api/shift-entries", {
  attendantId: "x", date: "2026-01-01", station: "mokwa", pumpNumber: 1, shift: "morning",
  attendantName: 'x"; DROP TABLE shift_entries; --', openingLiters: 0, closingLiters: 0, pricePerLiter: 700,
  tankDipLiters: 0, cashCounts: {}, posAmount: 0, bankTransferAmount: 0, creditSales: [], expenses: [],
  computed: { quantitySold: 0, expectedIncome: 0, cashTotal: 0, totalReceived: 0, creditTotal: 0, totalOutstanding: 0 }
});
record("A03-5", "A03", "SQL injection in attendantName field",
  r.status >= 400 ? "PASS" : "WARN",
  `HTTP ${r.status}. SQL payload passed to Xano in attendantName (Xano uses parameterized queries so likely safe, but no app-level check)`);

// ─────────────────────────────────────────────
// A04: INSECURE DESIGN
// ─────────────────────────────────────────────
console.log("\n── A04: INSECURE DESIGN ─────────────────────");

r = await req("POST", "/api/shift-entries", {
  attendantId: "att1", date: "2026-01-01", station: "mokwa", pumpNumber: 1, shift: "morning",
  attendantName: "Test", openingLiters: 9999999, closingLiters: 0, pricePerLiter: 700,
  tankDipLiters: 0, cashCounts: {}, posAmount: 0, bankTransferAmount: 0, creditSales: [], expenses: [],
  computed: { quantitySold: 9999999, expectedIncome: 6999999300, cashTotal: 0, totalReceived: 0, creditTotal: 0, totalOutstanding: 6999999300 }
});
record("A04-1", "A04", "Opening > closing liters rejected (physically impossible)",
  r.status >= 400 ? "PASS" : "FAIL",
  `HTTP ${r.status}. Opening 9,999,999L / Closing 0L accepted without business logic check`);

// Client-computes totals and server blindly trusts them
r = await req("POST", "/api/shift-entries", {
  attendantId: "x", date: "2026-01-01", station: "mokwa", pumpNumber: 1, shift: "morning",
  attendantName: "T", openingLiters: 100, closingLiters: 80, pricePerLiter: 700,
  tankDipLiters: 50, cashCounts: {}, posAmount: 0, bankTransferAmount: 0, creditSales: [], expenses: [],
  computed: { quantitySold: 20, expectedIncome: 99999999, cashTotal: 0, totalReceived: 99999999, creditTotal: 0, totalOutstanding: 0 }
});
record("A04-2", "A04", "Server recomputes computed fields (not trusted from client)",
  r.status >= 400 ? "PASS" : "FAIL",
  `HTTP ${r.status}. Client-provided 'computed.expectedIncome=99,999,999' (actual=14,000) accepted without server recomputation`);

const bigCredit = Array.from({ length: 5000 }, (_, i) => ({ clientName: "X".repeat(200), liters: i }));
r = await req("POST", "/api/shift-entries", {
  attendantId: "x", date: "2026-01-01", station: "mokwa", pumpNumber: 1, shift: "morning",
  attendantName: "T", openingLiters: 0, closingLiters: 0, pricePerLiter: 700,
  tankDipLiters: 0, cashCounts: {}, posAmount: 0, bankTransferAmount: 0, creditSales: bigCredit, expenses: [],
  computed: { quantitySold: 0, expectedIncome: 0, cashTotal: 0, totalReceived: 0, creditTotal: 0, totalOutstanding: 0 }
});
record("A04-3", "A04", "5,000-entry creditSales array (DoS payload) rejected",
  r.status >= 400 ? "PASS" : "FAIL",
  `HTTP ${r.status}. Unbounded array accepted - no size limit on creditSales`);

// ─────────────────────────────────────────────
// A05: SECURITY MISCONFIGURATION
// ─────────────────────────────────────────────
console.log("\n── A05: SECURITY MISCONFIGURATION ──────────");

r = await req("GET", "/");
const xfo = r.headers["x-frame-options"];
const xcto = r.headers["x-content-type-options"];
const rp = r.headers["referrer-policy"];
const pp = r.headers["permissions-policy"];
const xpb = r.headers["x-powered-by"];

record("A05-1", "A05", "X-Frame-Options header present (clickjacking protection)",
  xfo ? "PASS" : "FAIL",
  xfo || "X-Frame-Options missing - page can be iframed (clickjacking risk)");

record("A05-2", "A05", "X-Content-Type-Options header present (MIME sniffing)",
  xcto ? "PASS" : "FAIL",
  xcto || "X-Content-Type-Options missing - browsers may MIME-sniff responses");

record("A05-3", "A05", "Referrer-Policy header present",
  rp ? "PASS" : "FAIL",
  rp || "Referrer-Policy missing - full URL leaked to third parties in referrer header");

record("A05-4", "A05", "Permissions-Policy header present",
  pp ? "PASS" : "FAIL",
  pp || "Permissions-Policy missing - camera, microphone etc not explicitly controlled");

record("A05-5", "A05", "X-Powered-By header hidden (framework fingerprinting)",
  !xpb ? "PASS" : "FAIL",
  xpb ? `X-Powered-By: ${xpb} (reveals framework)` : "Not exposed");

// Unrecognized HTTP methods handled
r = await req("DELETE", "/api/admin/management");
record("A05-6", "A05", "DELETE /api/admin/management returns 405",
  r.status === 405 || r.status === 401 ? "PASS" : "FAIL",
  `HTTP ${r.status}. ${r.status === 401 ? "Protected by auth before method handling" : ""}`);

r = await req("PUT", "/api/admin/management", { type: "create_branch", name: "X" });
record("A05-7", "A05", "PUT /api/admin/management returns 405",
  r.status === 405 || r.status === 401 ? "PASS" : "FAIL",
  `HTTP ${r.status}. ${r.status === 401 ? "Protected by auth before method handling" : ""}`);

// ─────────────────────────────────────────────
// A06: VULNERABLE AND OUTDATED COMPONENTS
// ─────────────────────────────────────────────
console.log("\n── A06: VULNERABLE COMPONENTS ───────────────");
// Checked statically - report based on package.json read
record("A06-1", "A06", "next@16.1.6 - check for known CVEs",
  "WARN",
  "next@16.1.6 is among the latest; verify at https://nvd.nist.gov - no automated check run");
record("A06-2", "A06", "react@19.2.3 - check for known CVEs",
  "WARN",
  "react@19.2.3 is recent; manually verify no active CVEs");
record("A06-3", "A06", "npm audit not run in this test",
  "WARN",
  "Run: npm audit in petrotrak-web/ to check 0-day advisories");

// ─────────────────────────────────────────────
// A07: IDENTIFICATION AND AUTHENTICATION FAILURES
// ─────────────────────────────────────────────
console.log("\n── A07: AUTH / IDENTIFICATION FAILURES ──────");

r = await req("GET", "/api/bootstrap");
record("A07-1", "A07", "GET /api/bootstrap returns user data without auth",
  r.status === 200 ? "FAIL" : "PASS",
  `HTTP ${r.status}. ${r.body.slice(0, 150)}`);

r = await req("GET", "/api/bootstrap?userId=admin&roles=admin&station=mokwa");
const adminRoleInjected = r.body.includes("\"admin\"");
record("A07-2", "A07", "Cannot inject admin role via bootstrap query string",
  !adminRoleInjected ? "PASS" : "FAIL",
  `Roles in response: ${r.body.match(/"roles":\[.*?\]/) || "n/a"}`);

// No session tokens, cookies, or JWTs - check if any Set-Cookie
const cookies = r.headers["set-cookie"];
const authPage = await req("GET", "/auth");
const authStartProbe = await req("POST", "/api/auth/start", { phone: "bad" });
record("A07-3", "A07", "Phone login flow exists (/auth + OTP API)",
  authPage.status === 200 && authStartProbe.status !== 404 ? "PASS" : "FAIL",
  `Auth page HTTP ${authPage.status}, OTP API probe HTTP ${authStartProbe.status}`);

// ─────────────────────────────────────────────
// A08: SOFTWARE AND DATA INTEGRITY FAILURES
// ─────────────────────────────────────────────
console.log("\n── A08: SOFTWARE & DATA INTEGRITY ──────────");

// Mass assignment - send extra privilege fields
r = await req("POST", "/api/admin/management", {
  type: "create_attendant", name: "MassAssign Test", branchCode: "mokwa", shift: "morning", pumpId: 1,
  roles: ["admin", "superuser", "god_mode"],
  __admin: true, isRoot: true, permissions: "ALL"
});
record("A08-1", "A08", "Mass assignment: arbitrary roles=['admin','superuser'] accepted verbatim",
  r.status >= 400 ? "PASS" : "FAIL",
  `HTTP ${r.status}. roles=['admin','superuser','god_mode'] passed through to Xano without whitelist validation`);

// Client-controlled computed values - validate with authenticated session when dev OTP is available.
const testPhone = "+2348090001111";
const otpStart = await req("POST", "/api/auth/start", { phone: testPhone });
let a082Verdict = "WARN";
let a082Detail = `Unable to auto-verify OTP in this environment (HTTP ${otpStart.status}).`;

if (otpStart.status === 200) {
  try {
    const otpData = JSON.parse(otpStart.body);
    if (otpData.devOtp) {
      const otpVerify = await req("POST", "/api/auth/verify", { phone: testPhone, code: otpData.devOtp });
      const cookieHeader = Array.isArray(otpVerify.headers["set-cookie"]) ? otpVerify.headers["set-cookie"][0] : otpVerify.headers["set-cookie"];
      const sessionCookie = cookieHeader?.split(";")[0];
      const verifyData = JSON.parse(otpVerify.body || "{}");

      if (otpVerify.status === 200 && sessionCookie && verifyData.user?.id && verifyData.user?.station) {
        const tamperedPayload = {
          attendantId: verifyData.user.id,
          date: "2026-01-01",
          station: verifyData.user.station,
          pumpNumber: 1,
          shift: "morning",
          attendantName: verifyData.user.fullName ?? "Test",
          openingLiters: 100,
          closingLiters: 80,
          pricePerLiter: 700,
          tankDipLiters: 10,
          cashCounts: { 1000: 1 },
          posAmount: 0,
          bankTransferAmount: 0,
          creditSales: [],
          expenses: [],
          computed: {
            quantitySold: 20,
            expectedIncome: 99999999,
            cashTotal: 99999999,
            totalReceived: 99999999,
            creditTotal: 99999999,
            totalOutstanding: 99999999,
          },
        };

        const shiftSave = await req("POST", "/api/shift-entries", tamperedPayload, { Cookie: sessionCookie });
        if (shiftSave.status >= 400) {
          a082Verdict = "WARN";
          a082Detail = `Authenticated integrity test request rejected with HTTP ${shiftSave.status}; could not assert recomputation from response body.`;
        } else {
          const saved = JSON.parse(shiftSave.body || "{}");
          const expectedIncome = saved?.record?.computed?.expectedIncome;
          const cashTotal = saved?.record?.computed?.cashTotal;
          if (expectedIncome === 14000 && cashTotal === 1000) {
            a082Verdict = "PASS";
            a082Detail = "Server recomputed financial fields and ignored tampered client-computed values.";
          } else {
            a082Verdict = "FAIL";
            a082Detail = `Server appears to trust client computed values (expectedIncome=${expectedIncome}, cashTotal=${cashTotal}).`;
          }
        }
      } else {
        a082Verdict = "WARN";
        a082Detail = `OTP verify failed or session cookie missing (HTTP ${otpVerify.status}).`;
      }
    } else {
      a082Verdict = "WARN";
      a082Detail = "Termii production mode detected (no devOtp in response). Run this check manually with a real SMS OTP.";
    }
  } catch {
    a082Verdict = "WARN";
    a082Detail = "Could not parse OTP/auth response while running authenticated integrity check.";
  }
}

record("A08-2", "A08", "Server validates computed financial fields (not trusted from client)",
  a082Verdict,
  a082Detail);

// ─────────────────────────────────────────────
// A09: SECURITY LOGGING AND MONITORING FAILURES
// ─────────────────────────────────────────────
console.log("\n── A09: LOGGING & MONITORING ────────────────");

// Rate-limit behavior check: burst requests should eventually hit 429.
let got429 = false;
for (let i = 0; i < 140; i += 1) {
  const burst = await req("GET", "/api/auth/session");
  if (burst.status === 429) {
    got429 = true;
    break;
  }
}
record("A09-1", "A09", "API rate limiting active under burst traffic",
  got429 ? "PASS" : "FAIL",
  got429 ? "429 observed under burst traffic." : "No 429 observed after 140 requests in one window.");

r = await req("GET", "/api/admin/management?branchCode=AAAA".repeat(500));
record("A09-2", "A09", "Oversized URL does not crash server (DoS resilience)",
  r.status < 500 ? "PASS" : "FAIL",
  `HTTP ${r.status}`);

// ─────────────────────────────────────────────
// A10: SERVER-SIDE REQUEST FORGERY (SSRF)
// ─────────────────────────────────────────────
console.log("\n── A10: SSRF ────────────────────────────────");

// branchCode is appended as query param to Xano URL, not used as URL itself
r = await req("GET", "/api/admin/management?branchCode=http://169.254.169.254/latest/meta-data/");
record("A10-1", "A10", "branchCode=http://... does not trigger SSRF to cloud metadata",
  r.status >= 400 ? "PASS" : "WARN",
  `HTTP ${r.status}. branchCode is used as query param value to Xano, not a URL. Xano rejects unknown branchCode. Low direct SSRF risk via this param.`);

// The Xano fallback URL construction uses string replace - test if an attacker can influence it
// XANO_BASE_URL env is server-only, not injectable via request params
record("A10-2", "A10", "XANO_BASE_URL is server-only env var, not injectable via request",
  "PASS",
  "Base URL is from server env only. No request param is concatenated into the Xano host.");

// managementRequest fallback builds URL via string replace - could attacker inject via endpoint?
r = await req("GET", "/api/admin/management?branchCode=mokwa%0d%0a%0d%0a<html>smuggle</html>");
record("A10-3", "A10", "HTTP header injection via branchCode",
  r.status >= 400 ? "PASS" : "WARN",
  `HTTP ${r.status}. CRLF + HTML in branchCode passed to Xano as URL-encoded query param. Xano won't split headers, so low risk.`);

// ─────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────
console.log("\n════════════════════════════════════════════");
console.log(" SUMMARY");
console.log("════════════════════════════════════════════");
const fails = results.filter(x => x.verdict === "FAIL");
const warns = results.filter(x => x.verdict === "WARN");
const passes = results.filter(x => x.verdict === "PASS");
console.log(`Total: ${results.length} tests | FAIL: ${fails.length} | WARN: ${warns.length} | PASS: ${passes.length}\n`);
console.log("FAILURES:");
fails.forEach(f => console.log(`  [${f.id}] ${f.category} - ${f.label}`));
console.log("\nWARNINGS:");
warns.forEach(w => console.log(`  [${w.id}] ${w.category} - ${w.label}`));
