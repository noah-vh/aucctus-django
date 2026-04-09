import { Type } from "@sinclair/typebox";
import type { AgentTool } from "@mariozechner/pi-agent-core";

// ---------------------------------------------------------------------------
// HTTP helper (mirrors the pattern in brain.ts)
// ---------------------------------------------------------------------------

async function convexCall(
  type: "query" | "mutation",
  path: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const baseUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!baseUrl) {
    throw new Error("NEXT_PUBLIC_CONVEX_URL is not set");
  }

  const url = `${baseUrl}/api/${type}`;
  console.info(`[scheduling] convex ${type} ${path}`, { args });

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, args }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    console.error(`[scheduling] convex ${type} ${path} failed`, {
      status: res.status,
      body: text,
    });
    throw new Error(`Convex ${type} "${path}" failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  console.info(`[scheduling] convex ${type} ${path} ok`);
  return "value" in json ? json.value : json;
}

// ---------------------------------------------------------------------------
// setMonitoringSchedule
// ---------------------------------------------------------------------------

const SetMonitoringScheduleSchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
  job_type: Type.Union(
    [
      Type.Literal("funding_pulse"),
      Type.Literal("news_monitor"),
      Type.Literal("full_rescan"),
      Type.Literal("hiring_velocity"),
    ],
    { description: "Which monitor to configure" }
  ),
  cadence: Type.Union(
    [
      Type.Literal("daily"),
      Type.Literal("weekly"),
      Type.Literal("monthly"),
      Type.Literal("off"),
    ],
    { description: "How often the monitor should run for this idea" }
  ),
  reason: Type.String({ description: "Brief explanation for this schedule change" }),
});

export const setMonitoringSchedule: AgentTool<typeof SetMonitoringScheduleSchema> = {
  name: "set_monitoring_schedule",
  label: "Set Monitoring Schedule",
  description:
    "Override the monitoring cadence for a specific idea and job type. " +
    "Use 'off' to disable a monitor for an idea. " +
    "Use 'daily' when signals show rapidly changing conditions (funding spike, new entrants). " +
    "Use 'weekly' or 'monthly' for stable spaces to save resources.",
  parameters: SetMonitoringScheduleSchema,
  execute: async (_toolCallId, params) => {
    const { idea_id, job_type, cadence, reason } = params;
    const enabled = cadence !== "off";

    console.info("[set_monitoring_schedule] Setting schedule", { idea_id, job_type, cadence, enabled, reason });

    const id = await convexCall("mutation", "schedule_management:setSchedule", {
      idea_id,
      job_type,
      cadence: enabled ? cadence : "off",
      enabled,
    });

    const text = enabled
      ? `Schedule set: ${job_type} for idea ${idea_id} will now run ${cadence}. Reason: ${reason}`
      : `Monitor disabled: ${job_type} for idea ${idea_id} has been turned off. Reason: ${reason}`;

    console.info("[set_monitoring_schedule] Done", { id, idea_id, job_type, cadence });

    return {
      content: [{ type: "text" as const, text }],
      details: { id, idea_id, job_type, cadence, enabled },
    };
  },
};

// ---------------------------------------------------------------------------
// getMonitoringSchedule
// ---------------------------------------------------------------------------

const GetMonitoringScheduleSchema = Type.Object({
  idea_id: Type.String({ description: "Convex ideas document ID" }),
});

export const getMonitoringSchedule: AgentTool<typeof GetMonitoringScheduleSchema> = {
  name: "get_monitoring_schedule",
  label: "Get Monitoring Schedule",
  description:
    "Retrieve the current schedule overrides for an idea. " +
    "Returns which monitors have non-default cadences set. " +
    "If no overrides exist the idea uses the system defaults (active: daily funding/news, weekly hiring/rescan).",
  parameters: GetMonitoringScheduleSchema,
  execute: async (_toolCallId, params) => {
    const { idea_id } = params;

    console.info("[get_monitoring_schedule] Fetching schedules", { idea_id });

    const overrides = await convexCall("query", "schedule_management:getSchedulesForIdea", { idea_id });

    const rows = Array.isArray(overrides) ? overrides : [];

    let text: string;
    if (rows.length === 0) {
      text =
        `No schedule overrides for idea ${idea_id}. ` +
        `Using system defaults: funding_pulse=daily, news_monitor=daily, hiring_velocity=weekly, full_rescan=weekly.`;
    } else {
      const lines = rows.map(
        (r: any) =>
          `  - ${r.job_type}: ${r.cadence} (enabled=${r.enabled})`
      );
      text = `Schedule overrides for idea ${idea_id}:\n${lines.join("\n")}`;
    }

    console.info("[get_monitoring_schedule] Done", { idea_id, override_count: rows.length });

    return {
      content: [{ type: "text" as const, text }],
      details: rows,
    };
  },
};
