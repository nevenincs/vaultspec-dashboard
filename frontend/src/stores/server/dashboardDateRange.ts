import type { DashboardDateRange } from "./engine";

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDashboardDateEndpoint(value: unknown): string | undefined {
  const endpoint = typeof value === "string" ? value.trim() : "";
  const date = endpoint.slice(0, 10);
  return ISO_DATE_RE.test(date) ? date : undefined;
}

export function normalizeDashboardDateRange(
  range: DashboardDateRange | unknown,
): DashboardDateRange {
  if (!range || typeof range !== "object") return {};
  const source = range as Partial<DashboardDateRange>;
  const from = normalizeDashboardDateEndpoint(source.from);
  const to = normalizeDashboardDateEndpoint(source.to);
  if (from && to) {
    return from <= to ? { from, to } : { from: to, to: from };
  }
  return {
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  };
}

export function hasDashboardDateRange(range: DashboardDateRange | undefined): boolean {
  const normalized = normalizeDashboardDateRange(range);
  return Boolean(normalized.from || normalized.to);
}
