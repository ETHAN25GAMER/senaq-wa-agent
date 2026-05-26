import { supabase } from "../supabase/client.js";
import { log } from "../utils/logger.js";
import type { ToolResult } from "../types.js";

export interface CheckAvailabilityInput {
  date: string; // YYYY-MM-DD
  service_type: "cockroach" | "bed_bugs" | "general" | "amc_visit";
}

interface SlotWindow {
  id: "morning" | "afternoon" | "evening";
  fromHour: number; // inclusive (UTC hour)
  toHour: number; // exclusive
  capacity: number;
}

// Capacity per slot window — derived from current technician headcount.
// Adjust here when ops scales up.
const WINDOWS: SlotWindow[] = [
  { id: "morning", fromHour: 7, toHour: 12, capacity: 4 },
  { id: "afternoon", fromHour: 13, toHour: 17, capacity: 4 },
  { id: "evening", fromHour: 17, toHour: 21, capacity: 3 },
];

export async function handler(
  input: CheckAvailabilityInput,
): Promise<ToolResult> {
  // Validate date format defensively — caller controls it but we don't want
  // to feed garbage into Postgres.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "invalid date (expected YYYY-MM-DD)" };
  }
  try {
    const start = new Date(`${input.date}T00:00:00.000Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);

    const { data, error } = await supabase
      .from("jobs")
      .select("slot_iso, status, service_type")
      .gte("slot_iso", start.toISOString())
      .lt("slot_iso", end.toISOString())
      .neq("status", "cancelled");
    if (error) throw error;

    const slots = WINDOWS.map((w) => {
      const taken = (data ?? []).filter((j) => {
        const h = new Date(j.slot_iso).getUTCHours();
        return h >= w.fromHour && h < w.toHour;
      }).length;
      return {
        id: w.id,
        taken,
        capacity: w.capacity,
        free: Math.max(0, w.capacity - taken),
      };
    });

    log.info("check_availability_ok", {
      date: input.date,
      service: input.service_type,
      slots,
    });
    return {
      ok: true,
      data: { date: input.date, service_type: input.service_type, slots },
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.error("check_availability_failed", { msg, date: input.date });
    return { ok: false, error: msg };
  }
}
