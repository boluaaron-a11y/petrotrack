import { UserProfile } from "@/lib/types";

const SAMPLE_NAMES = [
  "Amina Yusuf",
  "Chinedu Okafor",
  "Ifeoma Nwosu",
  "Suleiman Bello",
  "Uchechi Obi",
];

export function generateSampleUser(): UserProfile {
  const selected = SAMPLE_NAMES[Math.floor(Math.random() * SAMPLE_NAMES.length)];

  return {
    id: `att_${Math.floor(1000 + Math.random() * 9000)}`,
    fullName: selected,
    station: "mokwa",
    roles: ["attendant"],
  };
}
