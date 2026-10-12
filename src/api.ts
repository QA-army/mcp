import type { ApiAccessTokenProvider } from "./cli-auth/agent-access-token.js";
import { evidenceMetadata } from "./evidence-metadata.js";
export interface RunReceipt {
  readonly id: string;
  readonly status: RunStatus;
  readonly workspace_id: string;
  readonly project_id: string;
  readonly test_group_id: string | null;
  readonly test_id: string;
  readonly context_schema_version: 1 | 2 | 3 | 4 | 5;
  readonly saved_steps?: Readonly<Record<string, unknown>> | null;
  readonly journey?: Readonly<Record<string, unknown>>;
  readonly context_hash: string;
  readonly resolved_at: string;
  readonly cancellation_requested_at: string | null;
  readonly completed_at: string | null;
  readonly outcome_summary: string | null;
}
type RunStatus = "READY" | "QUEUED" | "PROVISIONING" | "RUNNING" | "PASSED" | "FAILED" | "ERROR" | "CANCELLED";

export class VenkatApi {
  constructor(
    private readonly baseUrl: string,
    private readonly accessToken: string | ApiAccessTokenProvider,
    private readonly request: typeof fetch = fetch,
  ) {}
  create(testId: string) { return this.call("/v1/runs", "POST", { test_id: testId }) as Promise<RunReceipt>; }
  get(runId: string) { return this.call(`/v1/runs/${encodeURIComponent(runId)}`, "GET") as Promise<RunReceipt>; }
  start(runId: string) { return this.call(`/v1/runs/${encodeURIComponent(runId)}/start`, "POST") as Promise<RunReceipt>; }
  watch(runId: string, after = 0) { return this.call(`/v1/runs/${encodeURIComponent(runId)}/events?after=${after}`, "GET") as Promise<Record<string, unknown>>; }
  cancel(runId: string) { return this.call(`/v1/runs/${encodeURIComponent(runId)}/cancel`, "POST") as Promise<RunReceipt>; }
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
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const init: RequestInit = {
      method, redirect: "error",
      headers: {
        accept: "application/json",
        ...(body ? { "content-type": "application/json" } : {}),
        ...((idempotencyKey || method === "POST") ? { "idempotency-key": idempotencyKey ?? globalThis.crypto.randomUUID() } : {}),
        ...(version ? { "if-match": String(version) } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    };
    const token = typeof this.accessToken === 'string' ? this.accessToken : await this.accessToken.accessToken();
    let response = await this.request(url,{...init,headers:{...init.headers,authorization:`Bearer ${token}`}});
    if (response.status === 401 && typeof this.accessToken !== 'string') {
      await response.body?.cancel().catch(() => undefined);
      const replacement = await this.accessToken.reexchangeAfterUnauthorized(token);
      response = await this.request(url,{...init,headers:{...init.headers,authorization:`Bearer ${replacement}`}});
    }
    if (!response.ok) {
      let code: string | undefined;
      if (response.status === 403) {
        try { const body = record(await response.json()); if (typeof body.code === 'string' && /^[a-z][a-z0-9_]{1,63}$/.test(body.code)) code = body.code; } catch { /* Fixed safe error below. */ }
      } else await response.body?.cancel().catch(() => undefined);
      throw new ApiError(response.status,code);
    }
    if (response.status === 204) return undefined;
    const payload = record(await response.json());
    return /^\/v1\/runs\/run_[a-f0-9]{32}\/evidence$/.test(path) ? evidenceMetadata(payload,path.split("/")[3]!) : path.includes("/events?") ? payload
      : path === "/v1/runs" || path.startsWith("/v1/runs/") ? parseRun(payload.run) : payload;
  }
}

function parseRun(value: unknown): RunReceipt {
  const run = record(value); const hash = string(run.context_hash);
  if (!isStatus(run.status) || (run.context_schema_version !== 1 && run.context_schema_version !== 2 && run.context_schema_version !== 3 && run.context_schema_version !== 4 && run.context_schema_version !== 5) || !/^sha256:[a-f0-9]{64}$/.test(hash)) {
    throw new Error("QA.army returned an invalid Run receipt");
  }
  return {
    id: string(run.id), status: run.status, workspace_id: string(run.workspace_id),
    project_id: string(run.project_id), test_group_id: run.test_group_id === null ? null : string(run.test_group_id),
    test_id: string(run.test_id), context_schema_version: run.context_schema_version, context_hash: hash,
    ...(run.saved_steps !== undefined ? {saved_steps: savedStepsIdentity(run.saved_steps)} : {}),
    ...(run.journey ? {journey:record(run.journey)} : {}),
    resolved_at: string(run.resolved_at),
    cancellation_requested_at: nullableString(run.cancellation_requested_at),
    completed_at: nullableString(run.completed_at), outcome_summary: nullableString(run.outcome_summary),
  };
}
function isStatus(value: unknown): value is RunStatus { return typeof value === "string" && ["READY", "QUEUED", "PROVISIONING", "RUNNING", "PASSED", "FAILED", "ERROR", "CANCELLED"].includes(value); }
function nullableString(value: unknown): string | null { return value === null || value === undefined ? null : string(value); }
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("QA.army returned an invalid Run receipt"); return value as Record<string, unknown>; }
function string(value: unknown): string { if (typeof value !== "string") throw new Error("QA.army returned an invalid Run receipt"); return value; }

function savedStepsIdentity(value: unknown): Record<string, unknown> | null {
  if (value === null) return null;
  const saved = record(value);
  if (saved.schema_version !== 'run-saved-steps.v1' || saved.source !== 'IMMUTABLE_RUN_CONTEXT'
    || !/^tst_[a-f0-9]{32}$/.test(String(saved.test_id)) || !Number.isSafeInteger(saved.test_version) || Number(saved.test_version) < 1
    || !/^sha256:[a-f0-9]{64}$/.test(String(saved.context_hash))) throw new Error('QA.army returned an invalid immutable Test identity');
  return {schema_version:saved.schema_version,source:saved.source,test_id:saved.test_id,test_version:saved.test_version,context_hash:saved.context_hash};
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code?: string) {
    super(`QA.army API request failed (${status}${code ? `, ${code}` : ''})${code === 'agent_capability_denied' ? ': this operation is outside the claimed agent capability; inspect the supported operation contract' : ''}`);
  }
}
