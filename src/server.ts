import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { VenkatApi } from "./api.js";

const workspaceId = z.string().regex(/^wsp_[a-f0-9]{32}$/);
const projectId = z.string().regex(/^prj_[a-f0-9]{32}$/);
const groupId = z.string().regex(/^tgr_[a-f0-9]{32}$/);
const testId = z.string().regex(/^tst_[a-f0-9]{32}$/).describe("Server-owned Test identifier");
const runId = z.string().regex(/^run_[a-f0-9]{32}$/).describe("Server-owned Run identifier");
const version = z.number().int().positive();
const genericOutput = z.looseObject({});
const receipt = z.object({
  id: z.string(), status: z.enum(["READY", "QUEUED", "PROVISIONING", "RUNNING", "PASSED", "ERROR", "CANCELLED"]), workspace_id: z.string(), project_id: z.string(),
  test_group_id: z.string().nullable(), test_id: z.string(), context_schema_version: z.union([z.literal(1), z.literal(2)]),
  context_hash: z.string(), resolved_at: z.string(), cancellation_requested_at: z.string().nullable(),
  completed_at: z.string().nullable(), outcome_summary: z.string().nullable(),
});
const workspaceCreate = z.object({
  display_name: z.string().min(1).max(80), name: z.string().min(1).max(80),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), avatar_url: z.url().nullable().optional(),
});
const workspaceUpdate = z.object({
  workspace_id: workspaceId, name: z.string().min(1).max(80).optional(),
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(), avatar_url: z.url().nullable().optional(),
}).refine(({ name, slug, avatar_url }) => name !== undefined || slug !== undefined || avatar_url !== undefined, "One update field is required");
const projectCreate = z.discriminatedUnion("type", [
  z.object({ workspace_id: workspaceId, name: z.string().min(1).max(100), description: z.string().max(1000).nullable().optional(), type: z.literal("web"), target: z.object({ url: z.url() }) }),
  z.object({ workspace_id: workspaceId, name: z.string().min(1).max(100), description: z.string().max(1000).nullable().optional(), type: z.literal("mobile"), target: z.object({ app_name: z.string().min(1).max(100), binary_filename: z.string().max(255).nullable().optional() }) }),
]);
const groupFields = z.object({ name: z.string().min(1).max(100), description: z.string().max(1000).nullable() });
const step = z.object({
  type: z.enum(["act", "assert", "login", "files", "screenshot", "javascript", "microphone"]),
  instruction: z.string().min(1).max(10_000), enabled: z.boolean(),
});
const testFields = z.object({
  name: z.string().min(1).max(100), description: z.string().max(1000).nullable(),
  group_id: groupId.nullable(), enabled: z.boolean(), allow_web_search: z.boolean(),
  deep_thinking: z.boolean(), location_override: z.string().max(100).nullable(),
  viewport: z.object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(320).max(2160) }).nullable(),
  device_name: z.string().max(100).nullable(), steps: z.array(step).min(1).max(50),
});

export interface VenkatMcpOptions {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly request?: typeof fetch;
}

export function createVenkatMcpServer(options: VenkatMcpOptions) {
  const api = new VenkatApi(options.baseUrl, options.accessToken, options.request);
  const server = new McpServer(
    { name: "venkat", version: "0.1.0" },
    { instructions: "Manage QA.army through server-authorized REST operations. Never infer or submit Workspace scope." },
  );
  server.registerTool("workspaces.list", {
    description: "List every Workspace authorized for the current QA.army account.",
    inputSchema: z.object({}), outputSchema: genericOutput,
    annotations: readOnly,
  }, async () => result(() => api.operation("/v1/workspaces")));
  server.registerTool("workspaces.create", {
    description: "Create a Workspace and OWNER membership for the current account.",
    inputSchema: workspaceCreate, outputSchema: genericOutput,
    annotations: mutate,
  }, async (input) => result(() => api.operation("/v1/workspaces", "POST", input)));
  server.registerTool("workspaces.get", {
    description: "Get one authorized Workspace dashboard.",
    inputSchema: z.object({ workspace_id: workspaceId }), outputSchema: genericOutput,
    annotations: readOnly,
  }, async ({ workspace_id }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}`)));
  server.registerTool("workspaces.update", {
    description: "Update one authorized Workspace.", inputSchema: workspaceUpdate,
    outputSchema: genericOutput, annotations: mutate,
  }, async ({ workspace_id, ...body }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}`, "PATCH", body)));
  server.registerTool("projects.list", {
    description: "List Projects in one authorized Workspace.",
    inputSchema: z.object({ workspace_id: workspaceId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ workspace_id }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}/projects`)));
  server.registerTool("projects.create", {
    description: "Create a Web or Mobile Project in one authorized Workspace.",
    inputSchema: projectCreate, outputSchema: genericOutput, annotations: mutate,
  }, async ({ workspace_id, ...body }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}/projects`, "POST", body)));
  server.registerTool("members.list", {
    description: "List active members in one authorized Workspace.",
    inputSchema: z.object({ workspace_id: workspaceId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ workspace_id }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}/members`)));
  server.registerTool("invitations.create", {
    description: "Persist pending member invitations in one authorized Workspace. Delivery remains DOGFOOD-PENDING.",
    inputSchema: z.object({ workspace_id: workspaceId, emails: z.array(z.email()).min(1).max(20) }),
    outputSchema: genericOutput, annotations: mutate,
  }, async ({ workspace_id, emails }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}/invitations`, "POST", { emails })));
  server.registerTool("groups.list", {
    description: "List Test Groups for one authorized Project.",
    inputSchema: z.object({ project_id: projectId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ project_id }) => result(() => api.operation(`/v1/projects/${encodeURIComponent(project_id)}/test-groups`)));
  server.registerTool("groups.create", {
    description: "Create a Test Group under one authorized Project.",
    inputSchema: groupFields.extend({ project_id: projectId }), outputSchema: genericOutput, annotations: mutate,
  }, async ({ project_id, ...body }) => result(() => api.operation(`/v1/projects/${encodeURIComponent(project_id)}/test-groups`, "POST", body)));
  server.registerTool("groups.get", {
    description: "Get one authorized Test Group.",
    inputSchema: z.object({ group_id: groupId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ group_id }) => result(() => api.operation(`/v1/test-groups/${encodeURIComponent(group_id)}`)));
  server.registerTool("groups.update", {
    description: "Update one Test Group with optimistic version checking.",
    inputSchema: groupFields.extend({ group_id: groupId, version }), outputSchema: genericOutput, annotations: mutate,
  }, async ({ group_id, version: current, ...body }) => result(() => api.operation(`/v1/test-groups/${encodeURIComponent(group_id)}`, "PATCH", body, current)));
  server.registerTool("tests.list", {
    description: "List active Tests for one authorized Project.",
    inputSchema: z.object({ project_id: projectId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ project_id }) => result(() => api.operation(`/v1/projects/${encodeURIComponent(project_id)}/tests`)));
  server.registerTool("tests.create", {
    description: "Create a durable Test and ordered steps in one authorized Project.",
    inputSchema: testFields.extend({ project_id: projectId }), outputSchema: genericOutput, annotations: mutate,
  }, async ({ project_id, ...body }) => result(() => api.operation(`/v1/projects/${encodeURIComponent(project_id)}/tests`, "POST", body)));
  server.registerTool("tests.get", {
    description: "Get one authorized Test with ordered steps.",
    inputSchema: z.object({ test_id: testId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ test_id }) => result(() => api.operation(`/v1/tests/${encodeURIComponent(test_id)}`)));
  server.registerTool("tests.update", {
    description: "Replace one Test specification with optimistic version checking.",
    inputSchema: testFields.extend({ test_id: testId, version }), outputSchema: genericOutput, annotations: mutate,
  }, async ({ test_id, version: current, ...body }) => result(() => api.operation(`/v1/tests/${encodeURIComponent(test_id)}`, "PUT", body, current)));
  server.registerTool("tests.archive", {
    description: "Archive one Test with optimistic version checking.",
    inputSchema: z.object({ test_id: testId, version }), outputSchema: genericOutput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, async ({ test_id, version: current }) => result(() => api.operation(`/v1/tests/${encodeURIComponent(test_id)}`, "DELETE", undefined, current)));
  server.registerTool(
    "runs.create",
    {
      description: "Create a READY QA.army Run by Test ID. Workspace, Project, Test Group, policy, and credentials are resolved server-side.",
      inputSchema: z.object({ test_id: testId }),
      outputSchema: receipt,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ test_id }) => result(() => api.create(test_id)),
  );
  server.registerTool(
    "runs.get",
    {
      description: "Get the safe status and immutable-context receipt for one authorized QA.army Run.",
      inputSchema: z.object({ run_id: runId }),
      outputSchema: receipt,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
    },
    async ({ run_id }) => result(() => api.get(run_id)),
  );
  server.registerTool("runs.start", {
    description: "Start one READY Run with server-bound isolated execution settings.",
    inputSchema: z.object({ run_id: runId }), outputSchema: receipt,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ run_id }) => result(() => api.start(run_id)));
  server.registerTool("runs.watch", {
    description: "Read normalized lifecycle events for one authorized Run after a cursor.",
    inputSchema: z.object({ run_id: runId, after_sequence: z.number().int().min(0).max(10000).optional() }),
    outputSchema: genericOutput, annotations: readOnly,
  }, async ({ run_id, after_sequence }) => result(() => api.watch(run_id, after_sequence)));
  server.registerTool("runs.cancel", {
    description: "Cancel one active Run and stop its isolated execution session.",
    inputSchema: z.object({ run_id: runId }), outputSchema: receipt,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, async ({ run_id }) => result(() => api.cancel(run_id)));
  return server;
}

async function result(work: () => Promise<unknown>) {
  try {
    const run = await work();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(run) }],
      structuredContent: run as Record<string, unknown>,
    };
  } catch {
    return { content: [{ type: "text" as const, text: "QA.army could not complete the Run request." }], isError: true };
  }
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const mutate = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
