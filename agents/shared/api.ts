/**
 * Django REST API client for agent tools.
 *
 * Replaces the old Convex HTTP shim. Each Convex-style path (e.g. "brain:upsertCompany")
 * is mapped to a Django REST endpoint and transformed to the shape the caller expects.
 *
 * The old `convexCall(type, path, args)` signature is preserved as an alias so the
 * tool files can be updated with a one-line change (import { convexCall } from "../shared/api").
 */

const DJANGO_URL = process.env.DJANGO_URL || "http://localhost:8001";
const API_BASE = `${DJANGO_URL}/api/v1`;

type Method = "GET" | "POST";

interface Route {
  method: Method;
  url: (args: Record<string, any>) => string;
  body?: (args: Record<string, any>) => any;
  transform?: (resp: any, args: Record<string, any>) => any;
}

function unwrapList(resp: any): any[] {
  // DRF LimitOffsetPagination returns { count, next, previous, results }.
  // Non-paginated actions may return an array directly.
  if (resp && typeof resp === "object" && Array.isArray(resp.results)) return resp.results;
  if (Array.isArray(resp)) return resp;
  if (resp === null || resp === undefined) return [];
  return [resp];
}

/** Map Django `id` to Convex-style `_id` so the agent code that reads `_id` still works. */
function withConvexId(row: any): any {
  if (row && typeof row === "object" && row.id !== undefined && row._id === undefined) {
    return { ...row, _id: row.id };
  }
  return row;
}

const mapList = (resp: any) => unwrapList(resp).map(withConvexId);

const extractId = (resp: any) => (resp && typeof resp === "object" ? resp.id ?? null : null);

const ROUTES: Record<string, Route> = {
  // --- reads ---
  "brain:getCompaniesByIdea": {
    method: "GET",
    url: (a) => `${API_BASE}/ideas/companies/?idea_id=${encodeURIComponent(a.idea_id)}&limit=100`,
    transform: mapList,
  },
  "brain:getFundingByIdea": {
    method: "GET",
    url: (a) => `${API_BASE}/ideas/funding-events/?idea_id=${encodeURIComponent(a.idea_id)}&limit=100`,
    transform: mapList,
  },
  "brain:getSignalsByIdea": {
    method: "GET",
    url: (a) => `${API_BASE}/ideas/market-signals/?idea_id=${encodeURIComponent(a.idea_id)}&limit=100`,
    transform: mapList,
  },
  "brain:getLatestVerdict": {
    method: "GET",
    url: (a) => `${API_BASE}/ideas/verdicts/latest/?idea_id=${encodeURIComponent(a.idea_id)}`,
    transform: (resp) => (resp && resp.detail ? null : withConvexId(resp)),
  },
  "brain:getIdeas": {
    method: "GET",
    url: () => `${API_BASE}/ideas/ideas/?limit=100`,
    transform: mapList,
  },

  // --- writes ---
  "brain:createIdea": {
    method: "POST",
    url: () => `${API_BASE}/ideas/ideas/`,
    body: (a) => ({ description: a.description, tags: a.tags || [] }),
    transform: extractId,
  },
  "brain:upsertCompany": {
    method: "POST",
    url: () => `${API_BASE}/ideas/companies/upsert/`,
    body: (a) => a,
    transform: extractId,
  },
  "brain:insertFunding": {
    method: "POST",
    url: () => `${API_BASE}/ideas/funding-events/`,
    body: (a) => a,
    transform: (resp) => {
      // Django returns 200 with {detail: "Duplicate..."} on dedup.
      if (resp && resp.detail) return null;
      return extractId(resp);
    },
  },
  "brain:insertSignal": {
    method: "POST",
    url: () => `${API_BASE}/ideas/market-signals/`,
    // MarketSignalSerializer expects the FK field name `idea`, not `idea_id`.
    body: (a) => {
      const { idea_id, ...rest } = a;
      return { ...rest, idea: idea_id };
    },
    transform: extractId,
  },
  "investors:upsert": {
    method: "POST",
    url: () => `${API_BASE}/ideas/investors/upsert/`,
    body: (a) => a,
    transform: extractId,
  },
};

/**
 * Endpoints Django doesn't expose yet. Instead of throwing and poisoning the agent run,
 * we log a warning and return a stub so the agent can continue. These are low-priority
 * tools — missing scheduled monitors or metric history does not block a research verdict.
 */
const STUBBED_PATHS = new Set([
  "company_metrics:insert",
  "company_investors:link",
  "schedule_management:setSchedule",
  "schedule_management:getSchedulesForIdea",
]);

export async function djangoCall(
  _type: "query" | "mutation",
  path: string,
  args: Record<string, any>
): Promise<any> {
  if (STUBBED_PATHS.has(path)) {
    console.warn(`[api] stubbed path "${path}" — returning null`, { args });
    return path.endsWith("getSchedulesForIdea") ? [] : null;
  }

  const route = ROUTES[path];
  if (!route) {
    throw new Error(`[api] no route for "${path}"`);
  }

  const url = route.url(args);
  const init: RequestInit = {
    method: route.method,
    headers: { "Content-Type": "application/json" },
  };
  if (route.method !== "GET") {
    init.body = JSON.stringify(route.body ? route.body(args) : args);
  }

  console.info(`[api] ${route.method} ${path}`, { args });

  const res = await fetch(url, init);

  // GET 404 is an expected "not found" — return null instead of throwing so callers
  // like `brain:getLatestVerdict` can treat it as "no prior verdict".
  if (res.status === 404 && route.method === "GET") {
    console.info(`[api] ${path} 404 (returning null)`);
    return route.transform ? route.transform(null, args) : null;
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    console.error(`[api] ${path} failed`, { status: res.status, body: text });
    throw new Error(`Django ${path} failed (${res.status}): ${text}`);
  }

  const json = await res.json().catch(() => null);
  console.info(`[api] ${path} ok`);
  return route.transform ? route.transform(json, args) : json;
}

// Back-compat alias so existing tool files can just swap the import.
export const convexCall = djangoCall;
