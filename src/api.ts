import { normalizeApiBaseUrl } from "./config.js";

export interface RunReceipt {
  readonly id: string;
  readonly status: RunStatus;
  readonly workspace_id: string;
  readonly project_id: string;
  readonly test_group_id: string | null;
  readonly test_id: string;
  readonly run_url: string;
  readonly trigger: "manual" | "deploy";
  readonly triggered_by: string;
  readonly context_schema_version: 1 | 2 | 3 | 4 | 5;
  readonly journey?: Readonly<Record<string, unknown>>;
  readonly context_hash: string;
  readonly resolved_at: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly cancellation_requested_at: string | null;
  readonly completed_at: string | null;
  readonly outcome_summary: string | null;
}
type RunStatus = "READY" | "QUEUED" | "PROVISIONING" | "RUNNING" | "PASSED" | "FAILED" | "ERROR" | "CANCELLED";

export interface ApiProblem {
  readonly status: number;
  readonly code: string;
  readonly title: string;
}

export class QaArmyApiError extends Error {
  constructor(readonly problem: ApiProblem) {
    super(problem.title);
    this.name = "QaArmyApiError";
  }
}

export class QaArmyApi {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly accessToken: string,
    private readonly request: typeof fetch = fetch,
  ) {
    this.baseUrl = normalizeApiBaseUrl(baseUrl);
  }
  create(testId: string, requestKey: string) { return this.call("/v1/runs", "POST", { test_id: testId }, undefined, requestKey) as Promise<RunReceipt>; }
  get(runId: string) { return this.call(`/v1/runs/${encodeURIComponent(runId)}`, "GET") as Promise<RunReceipt>; }
  start(runId: string, requestKey: string) { return this.call(`/v1/runs/${encodeURIComponent(runId)}/start`, "POST", undefined, undefined, requestKey) as Promise<RunReceipt>; }
  watch(runId: string, after = 0) { return this.call(`/v1/runs/${encodeURIComponent(runId)}/events?after=${after}`, "GET") as Promise<Record<string, unknown>>; }
  cancel(runId: string, requestKey: string) { return this.call(`/v1/runs/${encodeURIComponent(runId)}/cancel`, "POST", undefined, undefined, requestKey) as Promise<RunReceipt>; }
  async operation(
    path: string,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE" = "GET",
    body?: unknown,
    version?: number,
    idempotencyKey?: string,
  ): Promise<Record<string, unknown>> {
    const value = await this.call(path, method, body, version, idempotencyKey);
    return value === undefined ? { archived: true } : record(value);
  }
  private async call(
    path: string,
    method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE",
    body?: unknown,
    version?: number,
    idempotencyKey?: string,
  ): Promise<RunReceipt | Record<string, unknown> | undefined> {
    const response = await this.request(`${this.baseUrl.replace(/\/$/, "")}${path}`, {
      method,
      headers: {
        accept: "application/json", authorization: `Bearer ${this.accessToken}`,
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
        ...(version ? { "if-match": String(version) } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw await apiError(response);
    if (response.status === 204) return undefined;
    const payload = record(await response.json());
    return path.includes("/events?") ? payload
      : path === "/v1/runs" || path.startsWith("/v1/runs/") ? parseRun(payload.run) : payload;
  }
}

function parseRun(value: unknown): RunReceipt {
  const run = record(value); const hash = string(run.context_hash);
  if (!isStatus(run.status) || !isContextVersion(run.context_schema_version) || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
    throw new Error("QA.army returned an invalid Run receipt");
  }
  const id = matchingString(run.id, /^run_[a-f0-9]{32}$/);
  const projectId = matchingString(run.project_id, /^prj_[a-f0-9]{32}$/);
  const testId = matchingString(run.test_id, /^tst_[a-f0-9]{32}$/);
  const runUrl = matchingString(run.run_url, /^https:\/\/app\.qa\.army\/dashboard\/[^/]+\/projects\/prj_[a-f0-9]{32}\/tests\/tst_[a-f0-9]{32}\/runs\/run_[a-f0-9]{32}$/);
  if (run.trigger !== "manual" && run.trigger !== "deploy") throw new Error("QA.army returned an invalid Run receipt");
  return {
    id, status: run.status, workspace_id: matchingString(run.workspace_id, /^wsp_[a-f0-9]{32}$/),
    project_id: projectId, test_group_id: run.test_group_id === null ? null : matchingString(run.test_group_id, /^tgr_[a-f0-9]{32}$/),
    test_id: testId, run_url: runUrl, trigger: run.trigger,
    triggered_by: matchingString(run.triggered_by, /^usr_[a-f0-9]{32}$/),
    context_schema_version: run.context_schema_version, context_hash: hash,
    ...(run.journey === undefined ? {} : {journey:record(run.journey)}),
    resolved_at: dateTime(run.resolved_at), created_at: dateTime(run.created_at), updated_at: dateTime(run.updated_at),
    cancellation_requested_at: nullableDateTime(run.cancellation_requested_at),
    completed_at: nullableDateTime(run.completed_at), outcome_summary: nullableOutcome(run.outcome_summary),
  };
}
function isStatus(value: unknown): value is RunStatus { return typeof value === "string" && ["READY", "QUEUED", "PROVISIONING", "RUNNING", "PASSED", "FAILED", "ERROR", "CANCELLED"].includes(value); }
function isContextVersion(value: unknown): value is 1 | 2 | 3 | 4 | 5 { return value === 1 || value === 2 || value === 3 || value === 4 || value === 5; }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("QA.army returned an invalid Run receipt"); return value as Record<string, unknown>; }
function string(value: unknown): string { if (typeof value !== "string") throw new Error("QA.army returned an invalid Run receipt"); return value; }
function matchingString(value: unknown, pattern: RegExp): string { const result = string(value); if (!pattern.test(result)) throw new Error("QA.army returned an invalid Run receipt"); return result; }
function dateTime(value: unknown): string { const result = string(value); if (!Number.isFinite(Date.parse(result))) throw new Error("QA.army returned an invalid Run receipt"); return result; }
function nullableDateTime(value: unknown): string | null { return value === null ? null : dateTime(value); }
function nullableOutcome(value: unknown): string | null { const result = value === null ? null : string(value); if (result && result.length > 500) throw new Error("QA.army returned an invalid Run receipt"); return result; }

async function apiError(response: Response): Promise<QaArmyApiError> {
  let value: unknown;
  try { value = JSON.parse(await response.text()); } catch { value = undefined; }
  const problem = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return new QaArmyApiError({
    status: response.status,
    code: typeof problem.code === "string" ? problem.code : "API_REQUEST_FAILED",
    title: typeof problem.title === "string" ? problem.title : "QA.army API request failed",
  });
}

/** @deprecated Use QaArmyApi. */
export { QaArmyApi as VenkatApi };
