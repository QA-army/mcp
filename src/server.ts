import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { journeyComposition } from "./journey.js";
import { QaArmyApi, QaArmyApiError } from "./api.js";

const workspaceId = z.string().regex(/^wsp_[a-f0-9]{32}$/);
const projectId = z.string().regex(/^prj_[a-f0-9]{32}$/);
const groupId = z.string().regex(/^tgr_[a-f0-9]{32}$/);
const testId = z.string().regex(/^tst_[a-f0-9]{32}$/).describe("Server-owned Test identifier");
const runId = z.string().regex(/^run_[a-f0-9]{32}$/).describe("Server-owned Run identifier");
const version = z.number().int().positive();
const genericOutput = z.looseObject({});
const dateTime = z.iso.datetime();
const receipt = z.object({
  id: runId, status: z.enum(["READY", "QUEUED", "PROVISIONING", "RUNNING", "PASSED", "FAILED", "ERROR", "CANCELLED"]), workspace_id: workspaceId, project_id: projectId,
  test_group_id: groupId.nullable(), test_id: testId, context_schema_version: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  run_url: z.url().regex(/^https:\/\/app\.qa\.army\/dashboard\/[^/]+\/projects\/prj_[a-f0-9]{32}\/tests\/tst_[a-f0-9]{32}\/runs\/run_[a-f0-9]{32}$/),
  trigger: z.enum(["manual", "deploy"]), triggered_by: z.string().regex(/^usr_[a-f0-9]{32}$/),
  journey: journeyComposition.optional(),
  context_hash: z.string().regex(/^sha256:[a-f0-9]{64}$/), resolved_at: dateTime, cancellation_requested_at: dateTime.nullable(),
  completed_at: dateTime.nullable(), outcome_summary: z.string().max(500).nullable(), created_at: dateTime, updated_at: dateTime,
});
const slug = z.string().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
const workspaceCreate = z.object({
  display_name: z.string().min(1).max(80), name: z.string().min(1).max(80),
  slug, avatar_url: z.url().nullable().optional(),
});
const workspaceUpdate = z.object({
  workspace_id: workspaceId, name: z.string().min(1).max(80).optional(),
  slug: slug.optional(), avatar_url: z.url().nullable().optional(),
}).refine(({ name, slug, avatar_url }) => name !== undefined || slug !== undefined || avatar_url !== undefined, "One update field is required");
const projectCreate = z.discriminatedUnion("type", [
  z.object({ workspace_id: workspaceId, name: z.string().min(1).max(100), description: z.string().max(1000).nullable().optional(), type: z.literal("web"), target: z.object({ url: z.url() }) }),
  z.object({ workspace_id: workspaceId, name: z.string().min(1).max(100), description: z.string().max(1000).nullable().optional(), type: z.literal("mobile"), target: z.object({ app_name: z.string().min(1).max(100), binary_filename: z.string().max(255).regex(/^.+(?:\.apk|\.app\.zip)$/).nullable().optional() }) }),
]);
const groupFields = z.object({ name: z.string().min(1).max(100), description: z.string().max(1000).nullable() });
const actVerification = z.strictObject({
  expectation: z.string().trim().min(1).max(1000),
  timeout_ms: z.number().int().min(1000).max(120000).optional(),
  checks: z.array(z.strictObject({ query: z.string().trim().min(1).max(500), equals: z.union([z.string().max(500), z.number(), z.boolean()]) })).max(8).optional(),
}).describe("ACT's expected product outcome. Omit to infer and freeze it before execution. Dispatch alone cannot pass ACT.");
const step = z.strictObject({
  type: z.enum(["act", "assert", "login", "files", "screenshot", "javascript", "microphone"]),
  instruction: z.string().min(1).max(10_000), enabled: z.boolean(),
  verification: actVerification.optional(),
  account_id: z.string().regex(/^tac_[a-f0-9]{32}$/).nullable().optional(),
}).superRefine((value, context) => {
  if (value.verification && value.type !== "act") context.addIssue({ code: "custom", message: "Only ACT accepts verification; explicit Verify and Screenshot remain separate steps" });
  if (value.type === "login" && value.enabled && !value.account_id) context.addIssue({ code: "custom", path: ["account_id"], message: "An enabled login step requires account_id" });
  if (value.type !== "login" && value.account_id !== undefined && value.account_id !== null) context.addIssue({ code: "custom", path: ["account_id"], message: "Only login steps accept account_id" });
});
const testFields = {
  name: z.string().min(1).max(100), description: z.string().max(1000).nullable().optional(),
  group_id: groupId.nullable().optional(), enabled: z.boolean(), allow_web_search: z.boolean(),
  deep_thinking: z.boolean(), location_override: z.string().max(100).nullable().optional(),
  viewport: z.object({ width: z.number().int().min(320).max(3840), height: z.number().int().min(320).max(2160) }).nullable().optional(),
  device_name: z.string().max(100).nullable().optional(), steps: z.array(step).min(1).max(50),
  journey: journeyComposition.nullable().optional(),
} as const;
function testInput<T extends z.ZodRawShape>(extra: T) {
  return z.strictObject({ ...testFields, ...extra }).superRefine((value, context) => {
    if (value.steps.filter(item => item.type === "login" && item.enabled).length > 1) {
      context.addIssue({ code: "custom", path: ["steps"], message: "At most one enabled login step is allowed" });
    }
  });
}

export interface QaArmyMcpOptions {
  readonly baseUrl: string;
  readonly accessToken: string;
  readonly request?: typeof fetch;
}

export function createQaArmyMcpServer(options: QaArmyMcpOptions) {
  const api = new QaArmyApi(options.baseUrl, options.accessToken, options.request);
  const server = new McpServer(
    { name: "qa-army", version: "0.1.2" },
    { instructions: "Manage QA.army through server-authorized REST operations. Never infer or submit Workspace scope." },
  );
  const verificationId=z.string().regex(/^prv_[a-f0-9]{32}$/),integrationId=z.string().regex(/^int_[a-f0-9]{32}$/);
  const requestKey=z.string().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/).describe("Use a new key for a deliberate mutation; reuse it only when retrying the same request after an uncertain response.");
  server.registerTool("prs.list",{description:"List Project dynamic PR verifications. Assisted pilot; no missing execution is a pass.",inputSchema:z.object({project_id:projectId}),outputSchema:genericOutput,annotations:readOnly},async({project_id})=>result(()=>api.operation(`/v1/projects/${project_id}/pr-verifications`)));
  server.registerTool("prs.get",{description:"Read the frozen plan, coverage limitations and canonical Run references.",inputSchema:z.object({verification_id:verificationId}),outputSchema:genericOutput,annotations:readOnly},async({verification_id})=>result(()=>api.operation(`/v1/pr-verifications/${verification_id}`)));
  server.registerTool("prs.usage",{description:"Read shared Workspace pilot allowance, reservations and completed usage.",inputSchema:z.object({workspace_id:workspaceId}),outputSchema:genericOutput,annotations:readOnly},async({workspace_id})=>result(()=>api.operation(`/v1/workspaces/${workspace_id}/pr-usage`)));
  server.registerTool("prs.settings",{description:"Read dynamic PR settings on the connected GitHub integration.",inputSchema:z.object({integration_id:integrationId}),outputSchema:genericOutput,annotations:readOnly},async({integration_id})=>result(()=>api.operation(`/v1/integrations/${integration_id}/dynamic-tests`)));
  server.registerTool("prs.configure",{description:"Owner-only pilot configuration. Enabling automatically executes up to max_tests per matching PR preview. Each completed Test consumes one shared Workspace Run. Requires sandbox confirmation.",inputSchema:z.strictObject({integration_id:integrationId,request_key:requestKey,enabled:z.boolean(),max_tests:z.number().int().min(1).max(3),test_account_ids:z.array(z.string().regex(/^tac_[a-f0-9]{32}$/)).max(3),sandbox_confirmed:z.boolean()}),outputSchema:genericOutput,annotations:mutate},async({integration_id,request_key,...body})=>result(()=>api.operation(`/v1/integrations/${integration_id}/dynamic-tests`,'PUT',body,undefined,request_key)));
  for(const operation of ['cancel','rerun'] as const)server.registerTool(`prs.${operation}`,{description:operation==='rerun'?"Explicitly create a new verification attempt. May consume up to three new Runs; show this cost before requesting a rerun. Never automatically rerun an ambiguous mutation.":"Cancel a verification and request cleanup of its active Runs; keep evidence.",inputSchema:z.object({verification_id:verificationId,request_key:requestKey}),outputSchema:genericOutput,annotations:mutate},async({verification_id,request_key})=>result(()=>api.operation(`/v1/pr-verifications/${verification_id}/${operation}`,'POST',{},undefined,request_key)));
  server.registerTool("prs.promote",{description:"Create an editable regression copy of a generated Test. Original PR evidence remains immutable.",inputSchema:z.object({verification_id:verificationId,test_id:testId,group_id:groupId,request_key:requestKey}),outputSchema:genericOutput,annotations:mutate},async({verification_id,request_key,...body})=>result(()=>api.operation(`/v1/pr-verifications/${verification_id}/promote`,'POST',body,undefined,request_key)));
  server.registerTool("builds.list", {
    description: "List the latest 100 Workspace-authorized native build registrations for a Mobile Project.",
    inputSchema: z.object({ project_id: projectId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ project_id }) => result(() => api.operation(`/v1/projects/${project_id}/builds`)));
  server.registerTool("builds.reserve", {
    description: "Reserve immutable original native build bytes. Use a profile API key or user token; agent setup credentials are denied. PUT the file to the returned short-lived URL using only its supplied headers, then complete registration. A registered file does not prove native execution.",
    inputSchema: z.object({ project_id: projectId, request_key: requestKey,
      filename: z.string().min(1).max(255), platform: z.enum(["ios", "android"]), size: z.number().int().min(1).max(536870912),
      sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict(), outputSchema: genericOutput, annotations: mutate,
  }, async ({ project_id, request_key, ...body }) => result(() => api.operation(`/v1/projects/${project_id}/builds`, "POST", body, undefined, request_key)));
  server.registerTool("builds.complete", {
    description: "Idempotently verify uploaded bytes and freeze their checksum, size and storage version. Provider build IDs and storage keys are not accepted.",
    inputSchema: z.object({ build_id: z.string().regex(/^nbd_[a-f0-9]{32}$/) }).strict(), outputSchema: genericOutput, annotations: mutate,
  }, async ({ build_id }) => result(() => api.operation(`/v1/builds/${build_id}/complete`, "POST", {})));
  const memoryFields=z.object({title:z.string().min(1).max(150),content:z.string().min(1).max(10000),category:z.enum(['PRODUCT_BEHAVIOR','NAVIGATION','TEST_INSIGHT','PROJECT_GUIDANCE']).optional(),kind:z.enum(['REQUIREMENT','OBSERVATION','INFERENCE','GUIDANCE']).optional(),importance:z.enum(['HIGH','MEDIUM','LOW']).optional(),scope:z.enum(['WORKSPACE','PROJECT','TEST_GROUP']).optional(),test_group_id:groupId.nullable().optional(),target_origin:z.url().nullable().optional()});
  server.registerTool('memories.questions',{description:'Read or initialize a stable UTC daily set of three context-grounded Project questions. No questions are repeated to fill an exhausted set.',inputSchema:z.strictObject({project_id:projectId,day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()}),outputSchema:genericOutput,annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true}},async({project_id,day})=>result(()=>api.operation(`/v1/projects/${project_id}/memory/clarifications${day?'/'+day:''}`)));
  server.registerTool('memories.answer',{description:'Answer, skip or correct a daily question with the expected answer revision (initially zero). Every answer becomes declared-intent knowledge requiring owner review, never observed evidence.',inputSchema:z.strictObject({project_id:projectId,day:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),question_id:z.string().regex(/^mq_[a-f0-9]{32}$/),revision:z.number().int().nonnegative(),choice:z.number().int().min(0).max(2).nullable(),skipped:z.boolean(),elaboration:z.string().max(2000).optional()}).refine(v=>v.skipped?v.choice===null:v.choice!==null,'Choose one of three answers or skip'),outputSchema:genericOutput,annotations:mutate},async({project_id,...body})=>result(()=>api.operation(`/v1/projects/${project_id}/memory/clarifications`,'POST',body)));
  const memoryId=z.string().regex(/^mem_[a-f0-9]{32}$/);
  for(const operation of ['list','graph','summary'] as const)server.registerTool(`memories.${operation}`,{description:`Read Project memory ${operation}.`,inputSchema:z.object({project_id:projectId}),outputSchema:genericOutput,annotations:readOnly},async({project_id})=>result(()=>api.operation(`/v1/projects/${project_id}/memory${operation==='list'?'':'/'+operation}`)));
  server.registerTool('memories.create',{description:'Add product context; members create proposals and owners approve publication.',inputSchema:memoryFields.extend({project_id:projectId,request_key:requestKey}),outputSchema:genericOutput,annotations:mutate},async({project_id,request_key,...body})=>result(()=>api.operation(`/v1/projects/${project_id}/memory`,'POST',body,undefined,request_key)));
  server.registerTool('memories.update',{description:'Correct memory with revision checking. Owner only.',inputSchema:memoryFields.extend({project_id:projectId,memory_id:memoryId,revision:version}),outputSchema:genericOutput,annotations:mutate},async({project_id,memory_id,...body})=>result(()=>api.operation(`/v1/projects/${project_id}/memory/${memory_id}`,'PATCH',body)));
  server.registerTool('memories.decide',{description:'Approve, reject or archive memory. Owner only.',inputSchema:z.object({project_id:projectId,memory_id:memoryId,revision:version,decision:z.enum(['APPROVED','REJECTED','ARCHIVED'])}),outputSchema:genericOutput,annotations:mutate},async({project_id,memory_id,...body})=>result(()=>api.operation(`/v1/projects/${project_id}/memory/${memory_id}`,'POST',body)));
  server.registerTool('memories.settings',{description:'Set automatic publication of verified observations. Inferences and conflicts require review. Owner only.',inputSchema:z.object({project_id:projectId,auto_learn:z.boolean()}),outputSchema:genericOutput,annotations:mutate},async({project_id,...body})=>result(()=>api.operation(`/v1/projects/${project_id}/memory/settings`,'PATCH',body)));
  server.registerTool('memories.import',{description:'Extract review-required proposals from pasted specifications.',inputSchema:z.object({project_id:projectId,request_key:requestKey,title:z.string().min(1).max(150),text:z.string().min(1).max(100000)}),outputSchema:genericOutput,annotations:mutate},async({project_id,request_key,...body})=>result(()=>api.operation(`/v1/projects/${project_id}/memory/imports`,'POST',body,undefined,request_key)));
  server.registerTool('memories.history',{description:'Queue review-required proposals from recent historical Runs.',inputSchema:z.object({project_id:projectId,request_key:requestKey}),outputSchema:genericOutput,annotations:mutate},async({project_id,request_key})=>result(()=>api.operation(`/v1/projects/${project_id}/memory/history`,'POST',{},undefined,request_key)));
  server.registerTool('memories.clear',{description:'Archive this Project memory and disable automatic updates. Historical Run snapshots remain.',inputSchema:z.object({project_id:projectId}),outputSchema:genericOutput,annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:true}},async({project_id})=>result(()=>api.operation(`/v1/projects/${project_id}/memory`,'DELETE')));
  server.registerTool("workspaces.list", {
    description: "List every Workspace authorized for the current QA.army account.",
    inputSchema: z.object({}), outputSchema: genericOutput,
    annotations: readOnly,
  }, async () => result(() => api.operation("/v1/workspaces")));
  server.registerTool("workspaces.create", {
    description: "Create a Workspace and OWNER membership for the current account.",
    inputSchema: workspaceCreate.extend({ request_key: requestKey }), outputSchema: genericOutput,
    annotations: mutate,
  }, async ({ request_key, ...body }) => result(() => api.operation("/v1/workspaces", "POST", body, undefined, request_key)));
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
    inputSchema: z.intersection(projectCreate, z.object({ request_key: requestKey })), outputSchema: genericOutput, annotations: mutate,
  }, async ({ workspace_id, request_key, ...body }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}/projects`, "POST", body, undefined, request_key)));
  server.registerTool("members.list", {
    description: "List active members in one authorized Workspace.",
    inputSchema: z.object({ workspace_id: workspaceId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ workspace_id }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}/members`)));
  server.registerTool("invitations.create", {
    description: "Persist pending member invitations in one authorized Workspace. Delivery remains DOGFOOD-PENDING.",
    inputSchema: z.object({ workspace_id: workspaceId, request_key: requestKey, emails: z.array(z.email()).min(1).max(20) }),
    outputSchema: genericOutput, annotations: mutate,
  }, async ({ workspace_id, request_key, emails }) => result(() => api.operation(`/v1/workspaces/${encodeURIComponent(workspace_id)}/invitations`, "POST", { emails }, undefined, request_key)));
  server.registerTool("groups.list", {
    description: "List Test Groups for one authorized Project.",
    inputSchema: z.object({ project_id: projectId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ project_id }) => result(() => api.operation(`/v1/projects/${encodeURIComponent(project_id)}/test-groups`)));
  server.registerTool("groups.create", {
    description: "Create a Test Group under one authorized Project.",
    inputSchema: groupFields.extend({ project_id: projectId, request_key: requestKey }), outputSchema: genericOutput, annotations: mutate,
  }, async ({ project_id, request_key, ...body }) => result(() => api.operation(`/v1/projects/${encodeURIComponent(project_id)}/test-groups`, "POST", body, undefined, request_key)));
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
    inputSchema: testInput({ project_id: projectId, request_key: requestKey }), outputSchema: genericOutput, annotations: mutate,
  }, async ({ project_id, request_key, ...body }) => result(() => api.operation(`/v1/projects/${encodeURIComponent(project_id)}/tests`, "POST", body, undefined, request_key)));
  server.registerTool("tests.get", {
    description: "Get one authorized Test with ordered steps.",
    inputSchema: z.object({ test_id: testId }), outputSchema: genericOutput, annotations: readOnly,
  }, async ({ test_id }) => result(() => api.operation(`/v1/tests/${encodeURIComponent(test_id)}`)));
  server.registerTool("tests.update", {
    description: "Replace one Test specification with optimistic version checking.",
    inputSchema: testInput({ test_id: testId, version }), outputSchema: genericOutput, annotations: mutate,
  }, async ({ test_id, version: current, ...body }) => result(() => api.operation(`/v1/tests/${encodeURIComponent(test_id)}`, "PUT", body, current)));
  server.registerTool("tests.archive", {
    description: "Archive one Test with optimistic version checking.",
    inputSchema: z.object({ test_id: testId, version }), outputSchema: genericOutput,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, async ({ test_id, version: current }) => result(() => api.operation(`/v1/tests/${encodeURIComponent(test_id)}`, "DELETE", undefined, current)));
  server.registerTool("runs.list", {
    description: "List authorized Runs for one Test. Pass next_before back as before to page through evidence.",
    inputSchema: z.strictObject({
      test_id: testId,
      before: z.string().min(1).max(256).regex(/^[A-Za-z0-9_-]+$/).optional(),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    outputSchema: genericOutput,
    annotations: readOnly,
  }, async ({ test_id, before, limit }) => result(async () => {
    const search = new URLSearchParams({ test_id, limit: String(limit) });
    if (before !== undefined) search.set("before", before);
    return api.operation(`/v1/runs?${search.toString()}`);
  }));
  server.registerTool(
    "runs.create",
    {
      description: "Create a READY QA.army Run by Test ID. Workspace, Project, Test Group, policy, and credentials are resolved server-side.",
      inputSchema: z.object({ test_id: testId, request_key: requestKey }),
      outputSchema: receipt,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
    },
    async ({ test_id, request_key }) => result(() => api.create(test_id, request_key)),
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
    inputSchema: z.object({ run_id: runId, request_key: requestKey }), outputSchema: receipt,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
  }, async ({ run_id, request_key }) => result(() => api.start(run_id, request_key)));
  server.registerTool("runs.watch", {
    description: "Read normalized lifecycle events for one authorized Run after a cursor.",
    inputSchema: z.object({ run_id: runId, after_sequence: z.number().int().min(0).max(10000).optional() }),
    outputSchema: genericOutput, annotations: readOnly,
  }, async ({ run_id, after_sequence }) => result(() => api.watch(run_id, after_sequence)));
  server.registerTool("runs.cancel", {
    description: "Cancel one active Run and stop its isolated execution session.",
    inputSchema: z.object({ run_id: runId, request_key: requestKey }), outputSchema: receipt,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
  }, async ({ run_id, request_key }) => result(() => api.cancel(run_id, request_key)));
  return server;
}

async function result(work: () => Promise<unknown>) {
  try {
    const run = await work();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(run) }],
      structuredContent: run as Record<string, unknown>,
    };
  } catch (error) {
    const problem = error instanceof QaArmyApiError
      ? error.problem
      : { status: 500, code: "MCP_OPERATION_FAILED", title: "QA.army operation failed" };
    return {
      content: [{ type: "text" as const, text: `${problem.title} (${problem.code}, ${problem.status})` }],
      structuredContent: { error: problem },
      isError: true,
    };
  }
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true } as const;
const mutate = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;

/** @deprecated Use QaArmyMcpOptions. */
export type VenkatMcpOptions = QaArmyMcpOptions;
/** @deprecated Use createQaArmyMcpServer. */
export const createVenkatMcpServer = createQaArmyMcpServer;
