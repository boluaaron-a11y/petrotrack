const base = process.env.STRESS_BASE_URL || "http://localhost:3000/api/admin/management";
const iterations = Number(process.env.STRESS_ITERATIONS || 6);
const requestDelayMs = Number(process.env.STRESS_REQUEST_DELAY_MS || 2200);
const max429Retries = Number(process.env.STRESS_MAX_429_RETRIES || 2);
const retrySleepMs = Number(process.env.STRESS_RETRY_SLEEP_MS || 21000);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(path = "", options = {}, retryCount = 0) {
  const url = `${base}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail = typeof data === "string" ? data : JSON.stringify(data);
    const rateLimited = detail.includes("ERROR_CODE_TOO_MANY_REQUESTS") || res.status === 429;
    if (rateLimited && retryCount < max429Retries) {
      await sleep(retrySleepMs);
      return request(path, options, retryCount + 1);
    }

    throw new Error(`HTTP ${res.status} :: ${detail}`);
  }

  if (requestDelayMs > 0) {
    await sleep(requestDelayMs);
  }

  return data;
}

function branchCodeFromName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

const results = [];

for (let i = 1; i <= iterations; i += 1) {
  const run = {
    iteration: i,
    ok: false,
    step: "init",
    error: "",
    branchCode: "",
    attendantId: "",
    assignmentId: "",
    pumpProduct: "",
    assignmentShift: "",
  };

  try {
    const stamp = Date.now();
    const branchName = `Stress ${i} ${stamp}`;
    const branchCode = branchCodeFromName(branchName);
    run.branchCode = branchCode;

    run.step = "create_branch";
    await request("", {
      method: "POST",
      body: JSON.stringify({ type: "create_branch", name: branchName, region: "Stress Region" }),
    });

    run.step = "state_after_branch";
    const stateAfterBranch = await request(`?branchCode=${encodeURIComponent(branchCode)}`);
    const pump = (stateAfterBranch.state?.pumps || []).find((p) => p.branchCode === branchCode);
    if (!pump) {
      throw new Error(`No pump found for branch ${branchCode}`);
    }

    run.step = "create_attendant";
    await request("", {
      method: "POST",
      body: JSON.stringify({
        type: "create_attendant",
        name: `Stress Att ${i}`,
        branchCode,
        shift: "morning",
        pumpId: Number(pump.id),
        roles: ["attendant", "night_attendant"],
      }),
    });

    run.step = "state_after_attendant";
    const stateAfterAttendant = await request(`?branchCode=${encodeURIComponent(branchCode)}`);
    const attendants = stateAfterAttendant.state?.attendants || [];
    const assignments = stateAfterAttendant.state?.assignments || [];
    const att = attendants.find((a) => a.branchCode === branchCode);
    const asg = assignments.find((a) => a.branchCode === branchCode);

    if (!att) {
      throw new Error(`No attendant found for branch ${branchCode}`);
    }
    if (!asg) {
      throw new Error(`No assignment found for branch ${branchCode}`);
    }

    run.attendantId = String(att.id);
    run.assignmentId = String(asg.id);

    run.step = "update_pump";
    const targetProduct = i % 2 === 0 ? "AGO" : "LPG";
    await request("", {
      method: "PATCH",
      body: JSON.stringify({
        type: "update_pump",
        branchCode,
        pumpId: Number(pump.id),
        product: targetProduct,
      }),
    });

    run.step = "update_assignment";
    await request("", {
      method: "PATCH",
      body: JSON.stringify({
        type: "update_assignment",
        branchCode,
        assignmentId: String(asg.id),
        field: "shift",
        value: "night",
      }),
    });

    run.step = "final_verify";
    const finalState = await request(`?branchCode=${encodeURIComponent(branchCode)}`);
    const finalPumps = finalState.state?.pumps || [];
    const finalAssignments = finalState.state?.assignments || [];
    const finalAttendants = finalState.state?.attendants || [];

    const finalPump = finalPumps.find((p) => Number(p.id) === Number(pump.id));
    const finalAsg = finalAssignments.find((a) => String(a.id) === String(asg.id));
    const finalAtt = finalAttendants.find((a) => String(a.id) === String(att.id));

    if (!finalPump) {
      throw new Error("Final pump not found");
    }
    if (!finalAsg) {
      throw new Error("Final assignment not found");
    }
    if (!finalAtt) {
      throw new Error("Final attendant not found");
    }
    if (finalPump.product !== targetProduct) {
      throw new Error(`Pump product mismatch: expected ${targetProduct} got ${finalPump.product}`);
    }
    if (finalAsg.shift !== "night") {
      throw new Error(`Assignment shift mismatch: expected night got ${finalAsg.shift}`);
    }

    run.ok = true;
    run.step = "done";
    run.pumpProduct = finalPump.product;
    run.assignmentShift = finalAsg.shift;
  } catch (error) {
    run.error = error instanceof Error ? error.message : String(error);
  }

  results.push(run);
}

const passed = results.filter((r) => r.ok).length;
const failed = iterations - passed;
const sampleFailures = results.filter((r) => !r.ok).slice(0, 5).map((f) => ({
  iteration: f.iteration,
  step: f.step,
  error: f.error,
  branchCode: f.branchCode,
}));

const summary = {
  iterations,
  requestDelayMs,
  max429Retries,
  passed,
  failed,
  failureRate: iterations > 0 ? Number(((failed * 100) / iterations).toFixed(2)) : 0,
  sampleFailures,
};

console.log(JSON.stringify(summary, null, 2));
