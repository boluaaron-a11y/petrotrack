import { ShiftType } from "@/lib/types";

export type PumpProduct = "AGO" | "PMS" | "LPG" | "KERO";

export type BranchRecord = {
  id?: number;
  code: string;
  name: string;
  region: string;
  manager: string;
};

export type AttendantRecord = {
  id: string;
  name: string;
  branchCode: string;
  roles: string[];
  shift: ShiftType;
  pumpId: number;
  status: "active" | "off-duty";
};

export type PumpRecord = {
  id: number;
  branchCode: string;
  pumpNumber?: number;
  product: PumpProduct;
  status: "active" | "maintenance";
  tankNumber?: number;
};

export type ShiftAssignment = {
  id: string;
  branchCode: string;
  shift: ShiftType;
  pumpId: number;
  attendantId: string;
};

export type TankRecord = {
  id: number;
  branchCode: string;
  tankNumber: number;
  product: PumpProduct;
  linkedTankNumber?: number;
  notes?: string;
};

export type ManagementState = {
  branches: BranchRecord[];
  attendants: AttendantRecord[];
  pumps: PumpRecord[];
  tanks: TankRecord[];
  assignments: ShiftAssignment[];
};

export function formatStationName(code: string): string {
  return `${code.charAt(0).toUpperCase()}${code.slice(1)} Station`;
}

export function slugifyBranch(name: string): string {
  return name.trim().toLowerCase().replaceAll(" ", "-");
}

export function defaultProductForIndex(index: number): PumpProduct {
  if (index < 4) return "PMS";
  if (index < 6) return "AGO";
  if (index === 6) return "KERO";
  return "LPG";
}

export function createId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export function seedManagementState(branchCode: string, managerName: string): ManagementState {
  return {
    branches: [
      { code: branchCode, name: formatStationName(branchCode), region: "Niger State", manager: managerName },
      { code: "okigwe", name: formatStationName("okigwe"), region: "Imo State", manager: "Regional Manager" },
    ],
    attendants: [
      {
        id: "att_1210",
        name: managerName,
        branchCode,
        roles: ["manager", "attendant"],
        shift: "morning",
        pumpId: 1,
        status: "active",
      },
      {
        id: "att_2210",
        name: "Ifeoma Nwosu",
        branchCode,
        roles: ["attendant"],
        shift: "morning",
        pumpId: 2,
        status: "active",
      },
      {
        id: "att_3310",
        name: "Uchechi Obi",
        branchCode,
        roles: ["attendant"],
        shift: "night",
        pumpId: 4,
        status: "active",
      },
      {
        id: "att_4410",
        name: "Amina Yusuf",
        branchCode,
        roles: ["attendant"],
        shift: "night",
        pumpId: 7,
        status: "off-duty",
      },
    ],
    pumps: Array.from({ length: 8 }, (_, index) => ({
      id: index + 1,
      pumpNumber: index + 1,
      branchCode,
      product: defaultProductForIndex(index),
      status: "active",
    })),
    tanks: [],
    assignments: [
      { id: createId("asg"), branchCode, shift: "morning", pumpId: 1, attendantId: "att_1210" },
      { id: createId("asg"), branchCode, shift: "morning", pumpId: 2, attendantId: "att_2210" },
      { id: createId("asg"), branchCode, shift: "night", pumpId: 4, attendantId: "att_3310" },
    ],
  };
}
