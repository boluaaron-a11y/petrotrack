import { NextResponse } from "next/server";

import {
  AttendantRecord,
  BranchRecord,
  ManagementState,
  PumpProduct,
  PumpRecord,
  TankRecord,
  ShiftAssignment,
  seedManagementState,
  createId,
  slugifyBranch,
} from "@/lib/adminManagement";
import { getSessionFromRequest, hasAnyRole, isBranchAllowed } from "@/lib/auth";
import { ShiftType } from "@/lib/types";
import { hasXanoConfig, xanoRequest } from "@/lib/xano";

let managementState: ManagementState | null = null;

const MANAGEMENT_STATE_ENDPOINT = process.env.XANO_MANAGEMENT_STATE_ENDPOINT ?? "/management/state";
const MANAGEMENT_BRANCH_ENDPOINT = process.env.XANO_MANAGEMENT_BRANCH_ENDPOINT ?? "/management/branch";
const MANAGEMENT_ATTENDANT_ENDPOINT = process.env.XANO_MANAGEMENT_ATTENDANT_ENDPOINT ?? "/management/attendant";
const MANAGEMENT_PUMP_ENDPOINT = process.env.XANO_MANAGEMENT_PUMP_ENDPOINT ?? "/management/pump";
const MANAGEMENT_TANK_ENDPOINT = process.env.XANO_MANAGEMENT_TANK_ENDPOINT ?? "/management/tank";
const MANAGEMENT_ASSIGNMENT_ENDPOINT = process.env.XANO_MANAGEMENT_ASSIGNMENT_ENDPOINT ?? "/management/assignment";

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH";
  body?: unknown;
};

type MutationAction =
  | {
      type: "create_branch";
      name: string;
      region?: string;
    }
  | {
      type: "create_attendant";
      name: string;
      branchCode: string;
      shift: ShiftType;
      pumpId: number;
      roles?: string[];
    }
  | {
      type: "update_pump";
      branchCode: string;
      pumpId: number;
      product: PumpProduct;
      tankNumber?: number;
    }
  | {
      type: "update_tank";
      branchCode: string;
      tankId: number;
      product: PumpProduct;
    }
  | {
      type: "update_assignment";
      branchCode: string;
      assignmentId: string;
      field: "shift" | "pumpId" | "attendantId";
      value: string;
    };

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/[<>]/g, "").trim().slice(0, maxLength);
}

function isValidBranchCode(value: string): boolean {
  return /^[a-z0-9-]{2,40}$/.test(value);
}

function isAllowedRole(value: string): boolean {
  return value === "super_admin" || value === "admin" || value === "manager" || value === "attendant";
}

function getState(branchCode = "mokwa", managerName = "Branch Manager"): ManagementState {
  managementState ??= seedManagementState(branchCode, managerName);

  return managementState;
}

type XanoManagementState = {
  branches?: Array<Record<string, unknown>>;
  attendants?: Array<Record<string, unknown>>;
  pumps?: Array<Record<string, unknown>>;
  tanks?: Array<Record<string, unknown>>;
  assignments?: Array<Record<string, unknown>>;
};

function normalizeBranch(record: Record<string, unknown>): BranchRecord {
  return {
    id: typeof record.id === "number" ? record.id : undefined,
    code: typeof record.code === "string" ? record.code : "unknown",
    name: typeof record.name === "string" ? record.name : "Unnamed Branch",
    region: typeof record.region === "string" ? record.region : "Pending region",
    manager: typeof record.manager_name === "string" ? record.manager_name : "Unassigned",
  };
}

function normalizeAttendant(record: Record<string, unknown>): AttendantRecord {
  const id =
    typeof record.id === "number" || typeof record.id === "string"
      ? String(record.id)
      : createId("att");

  const roles = Array.isArray(record.roles)
    ? record.roles.filter((role): role is string => typeof role === "string" && role.length > 0)
    : [];

  return {
    id,
    name: typeof record.name === "string" ? record.name : "Unnamed User",
    branchCode: typeof record.branch_code === "string" ? record.branch_code : "mokwa",
    roles: roles.length > 0 ? roles : ["attendant"],
    shift: record.default_shift === "night" ? "night" : "morning",
    pumpId: typeof record.default_pump_number === "number" ? record.default_pump_number : 1,
    status: record.status === "off-duty" ? "off-duty" : "active",
  };
}

function normalizePump(record: Record<string, unknown>): PumpRecord {
  return {
    id: typeof record.id === "number" ? record.id : 0,
    branchCode: typeof record.branch_code === "string" ? record.branch_code : "mokwa",
    pumpNumber: typeof record.pump_number === "number" ? record.pump_number : undefined,
    product: record.product === "AGO" || record.product === "PMS" || record.product === "LPG" || record.product === "KERO"
      ? record.product
      : "PMS",
    status: record.status === "maintenance" ? "maintenance" : "active",
    tankNumber: typeof record.tank_number === "number" ? record.tank_number : undefined,
  };
}

function normalizeTank(record: Record<string, unknown>): TankRecord {
  return {
    id: typeof record.id === "number" ? record.id : 0,
    branchCode: typeof record.branch_code === "string" ? record.branch_code : "mokwa",
    tankNumber: typeof record.tank_number === "number" ? record.tank_number : 0,
    product: record.product === "AGO" || record.product === "PMS" || record.product === "LPG" || record.product === "KERO"
      ? record.product
      : "PMS",
    linkedTankNumber: typeof record.linked_tank_number === "number" ? record.linked_tank_number : undefined,
    notes: typeof record.notes === "string" ? record.notes : undefined,
  };
}

function normalizeAssignment(record: Record<string, unknown>): ShiftAssignment {
  const id =
    typeof record.id === "number" || typeof record.id === "string"
      ? String(record.id)
      : createId("asg");

  const attendantId =
    typeof record.attendant_id === "number" || typeof record.attendant_id === "string"
      ? String(record.attendant_id)
      : "";

  return {
    id,
    branchCode: typeof record.branch_code === "string" ? record.branch_code : "mokwa",
    shift: record.shift === "night" ? "night" : "morning",
    pumpId: typeof record.pump_id === "number" ? record.pump_id : 0,
    attendantId,
  };
}

function normalizeManagementState(payload: XanoManagementState): ManagementState {
  return {
    branches: Array.isArray(payload.branches) ? payload.branches.map(normalizeBranch) : [],
    attendants: Array.isArray(payload.attendants) ? payload.attendants.map(normalizeAttendant) : [],
    pumps: Array.isArray(payload.pumps) ? payload.pumps.map(normalizePump) : [],
    tanks: Array.isArray(payload.tanks) ? payload.tanks.map(normalizeTank) : [],
    assignments: Array.isArray(payload.assignments) ? payload.assignments.map(normalizeAssignment) : [],
  };
}

function serverError(message: string, status = 502) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function managementRequest<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  try {
    return await xanoRequest<T>(endpoint, options);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const baseUrl = process.env.XANO_BASE_URL;
    const notFoundError =
      message.includes("ERROR_CODE_NOT_FOUND") &&
      message.includes("Unable to locate request.");
    const staleSchemaInputError =
      endpoint.startsWith("/management/") &&
      message.includes("ERROR_CODE_INPUT_ERROR") &&
      message.includes("Missing param: field_value");
    const shouldFallback =
      Boolean(baseUrl) &&
      (notFoundError || staleSchemaInputError);

    if (!shouldFallback || !baseUrl) {
      throw error;
    }

    const fallbackBase = baseUrl.replace(/\/api:[^/]+/, "/api:shift_entries");
    if (fallbackBase === baseUrl) {
      throw error;
    }

    const response = await fetch(`${fallbackBase}${endpoint}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: options.body ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Xano request failed (${response.status}): ${text}`);
    }

    return (await response.json()) as T;
  }
}

async function fetchXanoState(branchCode?: string, managerName?: string): Promise<ManagementState> {
  const params = new URLSearchParams();
  if (branchCode) params.set("branchCode", branchCode);
  if (managerName) params.set("managerName", managerName);
  const qs = params.toString();
  const endpoint = qs ? `${MANAGEMENT_STATE_ENDPOINT}?${qs}` : MANAGEMENT_STATE_ENDPOINT;
  const state = await managementRequest<XanoManagementState>(endpoint);
  return normalizeManagementState(state);
}

function parseId(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function handleXanoPost(action: MutationAction) {
  if (action.type === "create_branch") {
    const cleanName = sanitizeText(action.name, 80);
    const code = slugifyBranch(cleanName);
    await managementRequest(MANAGEMENT_BRANCH_ENDPOINT, {
      method: "POST",
      body: {
        code,
        name: cleanName,
        region: sanitizeText(action.region ?? "Pending region", 80) || "Pending region",
        manager: "Unassigned",
      },
    });
    return fetchXanoState(code);
  }

  if (action.type === "create_attendant") {
    const sanitizedRoles = (action.roles ?? ["attendant"])
      .filter((role) => typeof role === "string" && isAllowedRole(role))
      .slice(0, 3);

    await managementRequest(MANAGEMENT_ATTENDANT_ENDPOINT, {
      method: "POST",
      body: {
        name: sanitizeText(action.name, 80),
        branchCode: action.branchCode,
        shift: action.shift,
        pumpId: action.pumpId,
        roles: sanitizedRoles.length ? sanitizedRoles : ["attendant"],
      },
    });
    return fetchXanoState(action.branchCode);
  }

  return null;
}

async function handleXanoPatch(action: MutationAction) {
  if (action.type === "update_pump") {
    await managementRequest(MANAGEMENT_PUMP_ENDPOINT, {
      method: "PATCH",
      body: {
        pumpId: action.pumpId,
        product: action.product,
        status: "active",
        tankNumber: action.tankNumber,
      },
    });
    return fetchXanoState(action.branchCode);
  }

  if (action.type === "update_tank") {
    await managementRequest(MANAGEMENT_TANK_ENDPOINT, {
      method: "PATCH",
      body: {
        tankId: action.tankId,
        product: action.product,
      },
    });
    return fetchXanoState(action.branchCode);
  }

  if (action.type === "update_assignment") {
    const snapshot = await fetchXanoState(action.branchCode);
    const current = snapshot.assignments.find((assignment) => assignment.id === action.assignmentId);
    const shiftCandidate = action.field === "shift" ? action.value : current?.shift ?? "morning";
    const nextShift = shiftCandidate === "night" ? "night" : "morning";
    const nextPumpId = action.field === "pumpId" ? parseId(action.value) : current?.pumpId ?? 0;
    const nextAttendantId = action.field === "attendantId" ? parseId(action.value) : parseId(current?.attendantId ?? "0");

    await managementRequest(MANAGEMENT_ASSIGNMENT_ENDPOINT, {
      method: "PATCH",
      body: {
        assignmentId: parseId(action.assignmentId),
        shift: nextShift,
        pumpId: nextPumpId,
        attendantId: nextAttendantId,
      },
    });
    return fetchXanoState(action.branchCode || current?.branchCode || "mokwa");
  }

  return null;
}

function handleSamplePost(action: MutationAction) {
  const state = getState();

  if (action.type === "create_branch") {
    const cleanName = sanitizeText(action.name, 80);
    if (!cleanName) {
      return NextResponse.json({ ok: false, error: "Branch name is required." }, { status: 400 });
    }

    const code = slugifyBranch(cleanName);
    if (state.branches.some((branch) => branch.code === code)) {
      return NextResponse.json({ ok: false, error: "Branch already exists." }, { status: 409 });
    }

    state.branches.push({
      code,
      name: cleanName,
      region: sanitizeText(action.region ?? "Pending region", 80) || "Pending region",
      manager: "Unassigned",
    });

    return NextResponse.json({ ok: true, state });
  }

  if (action.type === "create_attendant") {
    const cleanName = sanitizeText(action.name, 80);
    if (!cleanName) {
      return NextResponse.json({ ok: false, error: "Attendant name is required." }, { status: 400 });
    }

    const sanitizedRoles = (action.roles ?? ["attendant"])
      .filter((role) => typeof role === "string" && isAllowedRole(role))
      .slice(0, 3);

    const attendantId = createId("att");
    const nextAttendant: AttendantRecord = {
      id: attendantId,
      name: cleanName,
      branchCode: action.branchCode,
      roles: sanitizedRoles.length ? sanitizedRoles : ["attendant"],
      shift: action.shift,
      pumpId: action.pumpId,
      status: "active",
    };

    state.attendants.push(nextAttendant);
    state.assignments.push({
      id: createId("asg"),
      branchCode: action.branchCode,
      shift: action.shift,
      pumpId: action.pumpId,
      attendantId,
    });

    return NextResponse.json({ ok: true, state });
  }

  return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
}

function handleSamplePatch(action: MutationAction) {
  const state = getState();

  if (action.type === "update_pump") {
    state.pumps = state.pumps.map((pump) => (
      pump.branchCode === action.branchCode && pump.id === action.pumpId
        ? { ...pump, product: action.product, tankNumber: action.tankNumber ?? pump.tankNumber }
        : pump
    ));

    return NextResponse.json({ ok: true, state });
  }

  if (action.type === "update_tank") {
    state.tanks = state.tanks.map((tank) => (
      tank.branchCode === action.branchCode && tank.id === action.tankId
        ? { ...tank, product: action.product }
        : tank
    ));

    return NextResponse.json({ ok: true, state });
  }

  if (action.type === "update_assignment") {
    state.assignments = state.assignments.map((assignment) => {
      if (assignment.id !== action.assignmentId) {
        return assignment;
      }

      if (action.field === "pumpId") {
        return { ...assignment, pumpId: Number(action.value) };
      }

      if (action.field === "shift") {
        return { ...assignment, shift: action.value as ShiftType };
      }

      return { ...assignment, attendantId: action.value };
    });

    return NextResponse.json({ ok: true, state });
  }

  return NextResponse.json({ ok: false, error: "Unsupported action." }, { status: 400 });
}

export async function GET(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!hasAnyRole(session, ["super_admin", "admin", "manager"])) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const requestedBranchCode = searchParams.get("branchCode") ?? session.user.station;
  const branchCode = sanitizeText(requestedBranchCode.toLowerCase(), 40);
  if (!isValidBranchCode(branchCode)) {
    return NextResponse.json({ ok: false, error: "Invalid branchCode" }, { status: 400 });
  }
  if (!isBranchAllowed(session, branchCode)) {
    return NextResponse.json({ ok: false, error: "Forbidden for this branch" }, { status: 403 });
  }
  const managerName = searchParams.get("managerName") ?? "Branch Manager";

  if (hasXanoConfig()) {
    try {
      const state = await fetchXanoState(branchCode, managerName);

      return NextResponse.json({
        ok: true,
        state,
        source: "xano",
      });
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "Failed to load management state");
    }
  }

  return NextResponse.json({
    ok: true,
    state: getState(branchCode, managerName),
    source: "sample",
  });
}

export async function POST(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const action = (await request.json()) as MutationAction;

  if (action.type === "create_branch" && !hasAnyRole(session, ["super_admin", "admin"])) {
    return NextResponse.json({ ok: false, error: "Forbidden: only admins can create branches" }, { status: 403 });
  }

  if (action.type === "create_attendant") {
    if (!hasAnyRole(session, ["super_admin", "admin", "manager"])) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }

    if (!isValidBranchCode(action.branchCode)) {
      return NextResponse.json({ ok: false, error: "Invalid branchCode" }, { status: 400 });
    }

    if (!isBranchAllowed(session, action.branchCode)) {
      return NextResponse.json({ ok: false, error: "Forbidden for this branch" }, { status: 403 });
    }

    const requestedRoles = (action.roles ?? ["attendant"]).filter((role) => isAllowedRole(role));
    if (hasAnyRole(session, ["manager"]) && requestedRoles.some((role) => role !== "attendant")) {
      return NextResponse.json(
        { ok: false, error: "Forbidden: managers can only invite attendants" },
        { status: 403 },
      );
    }
  }

  if (hasXanoConfig()) {
    try {
      const state = await handleXanoPost(action);
      if (state) {
        return NextResponse.json({ ok: true, state, source: "xano" });
      }
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "Failed to update management state");
    }
  }
  return handleSamplePost(action);
}

export async function PATCH(request: Request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const action = (await request.json()) as MutationAction;

  if (!hasAnyRole(session, ["super_admin", "admin", "manager"])) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const branchScopedAction = action.type === "update_pump" || action.type === "update_tank" || action.type === "update_assignment";

  if (branchScopedAction && !isValidBranchCode(action.branchCode)) {
    return NextResponse.json({ ok: false, error: "Invalid branchCode" }, { status: 400 });
  }

  if (branchScopedAction && !isBranchAllowed(session, action.branchCode)) {
    return NextResponse.json({ ok: false, error: "Forbidden for this branch" }, { status: 403 });
  }

  if (hasXanoConfig()) {
    try {
      const state = await handleXanoPatch(action);
      if (state) {
        return NextResponse.json({ ok: true, state, source: "xano" });
      }
    } catch (error) {
      return serverError(error instanceof Error ? error.message : "Failed to update management state");
    }
  }

  return handleSamplePatch(action);
}