import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig, normalizeApiBaseUrl } from "../src/config.js";
import { createVenkatMcpServer } from "../src/server.js";

const open: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { await Promise.all(open.splice(0).map((item) => item.close())); });

describe("QA.army MCP Run parity", () => {
  it("exposes daily questions and validates explicit answer choices without tenant authority",async()=>{
    const request=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({questions:[],answers:[]})));
    const server=createVenkatMcpServer({baseUrl:'https://api.qa.army',accessToken:'fixture',request});
    const client=new Client({name:'memory-daily',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);open.push(client,server);
    const project_id='prj_'+'a'.repeat(32);
    expect((await client.callTool({name:'memories.questions',arguments:{project_id}})).isError).not.toBe(true);
    const args={project_id,day:'2026-10-06',question_id:'mq_'+'b'.repeat(32),revision:0,choice:1,skipped:false};
    expect((await client.callTool({name:'memories.answer',arguments:args})).isError).not.toBe(true);
    expect(JSON.parse(String(request.mock.calls[1]![1]?.body))).toEqual({...args,project_id:undefined});
    for(const change of [{choice:3},{workspace_id:'foreign'},{skipped:true}])expect((await client.callTool({name:'memories.answer',arguments:{...args,...change}})).isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(2);
  });

  it.each([1, 2, 3, 4, 5])("reads RunContext v%i receipts", async context_schema_version => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ run: { ...runObject("READY"), context_schema_version } })));
    const server = createVenkatMcpServer({ baseUrl: "https://api.qa.army", accessToken: "token", request });
    const client = new Client({ name: "compatibility", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a); open.push(client, server);
    const result = await client.callTool({ name: "runs.create", arguments: { test_id: `tst_${"4".repeat(32)}`, request_key: "context-version" } });
    expect(result.isError).not.toBe(true); expect(result.structuredContent).toMatchObject({ context_schema_version });
  });
  it("preserves ACT contracts and rejects contracts on capture and explicit Verify", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ test: { id: "saved" } })));
    const server = createVenkatMcpServer({ baseUrl: "https://api.qa.army", accessToken: "token", request });
    const client = new Client({ name: "authoring", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a); open.push(client, server);
    const verification = { expectation: "Yearly is selected", timeout_ms: 30000, checks: [{ query: "Selected billing period", equals: "Yearly" }] };
    const journey={schema_version:'journey-composition.v1',goal:'Test billing',sources:[{fragment_id:'frg_'+'a'.repeat(32),test_id:'tst_'+'b'.repeat(32),test_version:1,step_id:'stp_'+'c'.repeat(32),primitive:'ACT',content_sha256:'a'.repeat(64)}],steps:[{position:0,source_fragment_ids:['frg_'+'a'.repeat(32)],inferred_connection:null},{position:1,source_fragment_ids:[],inferred_connection:'Capture result'}],bindings:[],binding_checks:[],unresolved_prerequisites:[]};
    const args = { journey, project_id: `prj_${"a".repeat(32)}`, request_key: "save-billing", name: "Billing", description: null, group_id: null, enabled: true, allow_web_search: false,
      deep_thinking: false, location_override: null, viewport: null, device_name: null,
      steps: [{ type: "act", instruction: "Click Yearly", enabled: true, verification }, { type: "screenshot", instruction: "Capture", enabled: true }] };
    expect((await client.callTool({ name: "tests.create", arguments: args })).isError).not.toBe(true);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).steps).toEqual(args.steps);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body)).journey).toEqual(journey);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).not.toHaveProperty("request_key");
    for (const type of ["assert", "screenshot"]) expect((await client.callTool({ name: "tests.create", arguments: { ...args, steps: [{ ...args.steps[0], type }] } })).isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("maps PR settings with stable PUT idempotency and rejects invented authority",async()=>{
    const request=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({enabled:false}),{status:200}));
    const server=createVenkatMcpServer({baseUrl:'https://api.qa.army',accessToken:'private-token',request});
    const client=new Client({name:'pr-test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);open.push(client,server);
    const args={integration_id:'int_'+'a'.repeat(32),request_key:'stable-pr-key',enabled:false,max_tests:3,test_account_ids:[],sandbox_confirmed:false};
    expect((await client.callTool({name:'prs.configure',arguments:args})).isError).not.toBe(true);
    expect(request.mock.calls[0]?.[1]).toMatchObject({method:'PUT',headers:{'idempotency-key':'stable-pr-key'}});
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({enabled:false,max_tests:3,test_account_ids:[],sandbox_confirmed:false});
    expect((await client.callTool({name:'prs.configure',arguments:{...args,workspace_id:'foreign'}})).isError).toBe(true);
    expect((await client.callTool({name:'prs.configure',arguments:{...args,max_tests:4}})).isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
  it("preserves registration idempotency and refuses provider IDs", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ build: { id: "registered" } }), { status: 201 }));
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "private-token", request });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "test", version: "1" });
    await Promise.all([server.connect(a), client.connect(b)]);
    const args = { project_id: "prj_" + "a".repeat(32), request_key: "stable-key", filename: "Example.apk", platform: "android", size: 100, sha256: "b".repeat(64) };
    const receipt = await client.callTool({ name: "builds.reserve", arguments: args });
    expect(receipt.isError).not.toBe(true);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": "stable-key" });
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).not.toHaveProperty("request_key");
    const invalid = await client.callTool({ name: "builds.reserve", arguments: { ...args, provider_build_id: "other" } });
    expect(invalid.isError).toBe(true); expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(receipt)).not.toContain("private-token");
    await client.close(); await server.close();
  });
  it("lists Run evidence with only canonical query parameters", async () => {
    const page = { runs: [runObject("PASSED")], next_before: "next-page" };
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(page), { status: 200 }));
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "private-token", request });
    const client = new Client({ name: "run-history-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a); open.push(client, server);
    const testId = `tst_${"4".repeat(32)}`;
    const args = { test_id: testId, before: "opaque_-9", limit: 1 };
    const result = await client.callTool({ name: "runs.list", arguments: args });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toEqual(page);
    const url = new URL(String(request.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/v1/runs");
    expect(Object.fromEntries(url.searchParams)).toEqual({ test_id: testId, limit: "1", before: "opaque_-9" });
    expect(request.mock.calls[0]?.[1]?.method).toBe("GET");
  });

  it("rejects unsupported Run filters, scope, and invalid pagination before REST", async () => {
    const request = vi.fn<typeof fetch>();
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "private-token", request });
    const client = new Client({ name: "run-history-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a); open.push(client, server);
    for (const invalid of [{ trigger: "manual" }, { workspace_id: "foreign" }, { test_id: "foreign" },
      { limit: 0 }, { limit: 51 }, { limit: 1.5 }, { before: "" }, { before: "opaque+/=" }, { before: "a".repeat(257) }]) {
      expect((await client.callTool({ name: "runs.list", arguments: { test_id: `tst_${"4".repeat(32)}`, ...invalid } })).isError).toBe(true);
    }
    expect(request).not.toHaveBeenCalled();
  });

  it("keeps forbidden Run history as an error without an empty success", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response("{}", { status: 403 }));
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "private-token", request });
    const client = new Client({ name: "run-history-test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(b); await client.connect(a); open.push(client, server);
    const result = await client.callTool({ name: "runs.list", arguments: { test_id: `tst_${"4".repeat(32)}` } });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: {
      status: 403, code: "API_REQUEST_FAILED", title: "QA.army API request failed",
    } });
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain("private-token");
  });

  it("discovers and calls runs.create through the MCP protocol using only test_id", async () => {
    const request = vi.fn<typeof fetch>(async () => response());
    const server = createVenkatMcpServer({
      baseUrl: "https://app.example.test", accessToken: "never-print-this", request,
    });
    const client = new Client({ name: "venkat-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    open.push(client, server);

    const listed = await client.listTools();
    expect(listed.tools.map(({ name }) => name)).toEqual([
      "prs.list", "prs.get", "prs.usage", "prs.settings", "prs.configure", "prs.cancel", "prs.rerun", "prs.promote",
      "builds.list", "builds.reserve", "builds.complete",
      "memories.questions", "memories.answer", "memories.list", "memories.graph", "memories.summary", "memories.create", "memories.update", "memories.decide", "memories.settings", "memories.import", "memories.history", "memories.clear",
      "workspaces.list", "workspaces.create", "workspaces.get", "workspaces.update",
      "projects.list", "projects.create", "members.list", "invitations.create",
      "groups.list", "groups.create", "groups.get", "groups.update",
      "tests.list", "tests.create", "tests.get", "tests.update", "tests.archive",
      "runs.list", "runs.create", "runs.get", "runs.start", "runs.watch", "runs.cancel",
    ]);
    const result = await client.callTool({
      name: "runs.create", arguments: { test_id: `tst_${"4".repeat(32)}`, request_key: "create-run" },
    });
    expect(result.structuredContent).toMatchObject({ status: "READY", context_schema_version: 2 });
    const [, init] = request.mock.calls[0]!;
    expect(init?.body).toBe(JSON.stringify({ test_id: `tst_${"4".repeat(32)}` }));
    expect(init?.headers).toMatchObject({ "idempotency-key": "create-run" });
    expect(JSON.stringify(result)).not.toContain("never-print-this");
  });

  it('maps governed memory decisions and validates project scope before REST',async()=>{
    const request=vi.fn<typeof fetch>(async()=>new Response(JSON.stringify({updated:true}),{status:200}));
    const server=createVenkatMcpServer({baseUrl:'https://app.example.test',accessToken:'private-token',request});
    const client=new Client({name:'memory-test',version:'1'});const [a,b]=InMemoryTransport.createLinkedPair();await server.connect(b);await client.connect(a);open.push(client,server);
    const project='prj_'+'a'.repeat(32),memory='mem_'+'b'.repeat(32);
    const result=await client.callTool({name:'memories.decide',arguments:{project_id:project,memory_id:memory,revision:3,decision:'APPROVED'}});
    expect(result.isError).not.toBe(true);expect(request.mock.calls[0]![0]).toBe(`https://app.example.test/v1/projects/${project}/memory/${memory}`);expect(JSON.parse(String(request.mock.calls[0]![1]!.body))).toEqual({revision:3,decision:'APPROVED'});
    const invalid=await client.callTool({name:'memories.settings',arguments:{project_id:'bad',auto_learn:true}});expect(invalid.isError).toBe(true);expect(request).toHaveBeenCalledTimes(1);expect(JSON.stringify(result)).not.toContain('private-token');
  });

  it("maps start, watch, and cancel to the same safe REST Run surface", async () => {
    const runId = `run_${"1".repeat(32)}`;
    const request = vi.fn<typeof fetch>(async (input) => String(input).includes("/events?")
      ? new Response(JSON.stringify({
          run: runObject("RUNNING"),
          events: [{ sequence: 5, state: "RUNNING", occurred_at: "2026-08-19T12:00:01.000Z" }],
          next_after: 5,
          terminal: false,
        }), { status: 200, headers: { "content-type": "application/json" } })
      : response(String(input).endsWith("/cancel") ? "CANCELLED" : "QUEUED", 202));
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "token", request });
    const client = new Client({ name: "venkat-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    open.push(client, server);

    expect((await client.callTool({ name: "runs.start", arguments: { run_id: runId, request_key: "start-run" } })).structuredContent)
      .toMatchObject({ id: runId, status: "QUEUED" });
    expect((await client.callTool({ name: "runs.watch", arguments: { run_id: runId, after_sequence: 4 } })).structuredContent)
      .toMatchObject({ next_after: 5, terminal: false });
    expect((await client.callTool({ name: "runs.cancel", arguments: { run_id: runId, request_key: "cancel-run" } })).structuredContent)
      .toMatchObject({ id: runId, status: "CANCELLED" });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      `https://app.example.test/v1/runs/${runId}/start`,
      `https://app.example.test/v1/runs/${runId}/events?after=4`,
      `https://app.example.test/v1/runs/${runId}/cancel`,
    ]);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": "start-run" });
    expect(request.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": "cancel-run" });
  });

  it("maps a Phase 0 project mutation to REST without sending Workspace authority in the body", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ project: { id: "project" } }), {
      status: 201, headers: { "content-type": "application/json" },
    }));
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "token", request });
    const client = new Client({ name: "venkat-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    open.push(client, server);
    const workspace = `wsp_${"1".repeat(32)}`;
    const result = await client.callTool({ name: "projects.create", arguments: {
      workspace_id: workspace, request_key: "create-project", name: "Store", type: "web", target: { url: "https://shop.example.test" },
    } });
    expect(result.isError).not.toBe(true);
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe(`https://app.example.test/v1/workspaces/${workspace}/projects`);
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Store", type: "web", target: { url: "https://shop.example.test" },
    });
    expect(init?.headers).toMatchObject({ "idempotency-key": "create-project" });
  });

  it("fails input validation before calling REST", async () => {
    const request = vi.fn<typeof fetch>();
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "token", request });
    const client = new Client({ name: "venkat-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    open.push(client, server);
    const result = await client.callTool({ name: "runs.create", arguments: { test_id: "foreign", request_key: "invalid-run" } });
    expect(result.isError).toBe(true); expect(request).not.toHaveBeenCalled();
  });

  it("accepts canonical minimal Test create and update payloads", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ test: { id: "saved" } })));
    const server = createVenkatMcpServer({ baseUrl: "https://api.qa.army", accessToken: "token", request });
    const client = new Client({ name: "minimal-tests", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a); open.push(client, server);
    const fields = { name: "Minimal", enabled: true, allow_web_search: false, deep_thinking: false,
      steps: [{ type: "assert", instruction: "Homepage is visible", enabled: true }] };
    const project_id = `prj_${"a".repeat(32)}`;
    const test_id = `tst_${"b".repeat(32)}`;
    expect((await client.callTool({ name: "tests.create", arguments: { ...fields, project_id, request_key: "minimal-create" } })).isError).not.toBe(true);
    expect((await client.callTool({ name: "tests.update", arguments: { ...fields, test_id, version: 2 } })).isError).not.toBe(true);
    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual(fields);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": "minimal-create" });
    expect(JSON.parse(String(request.mock.calls[1]?.[1]?.body))).toEqual(fields);
  });

  it("enforces canonical login account and cardinality rules", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ test: { id: "saved" } })));
    const server = createVenkatMcpServer({ baseUrl: "https://api.qa.army", accessToken: "token", request });
    const client = new Client({ name: "login-tests", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a); open.push(client, server);
    const base = { project_id: `prj_${"a".repeat(32)}`, request_key: "login-test", name: "Login", enabled: true, allow_web_search: false, deep_thinking: false };
    const enabled = { type: "login", instruction: "Sign in", enabled: true };
    expect((await client.callTool({ name: "tests.create", arguments: { ...base, steps: [enabled] } })).isError).toBe(true);
    const account_id = `tac_${"c".repeat(32)}`;
    expect((await client.callTool({ name: "tests.create", arguments: { ...base, steps: [{ ...enabled, account_id }, { ...enabled, account_id }] } })).isError).toBe(true);
    expect((await client.callTool({ name: "tests.create", arguments: { ...base, steps: [{ ...enabled, enabled: false }] } })).isError).not.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("preserves canonical API problem details with resource-neutral errors", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({
      type: "https://api.qa.army/problems/validation", title: "Invalid Workspace", status: 422, code: "INVALID_WORKSPACE",
    }), { status: 422 }));
    const server = createVenkatMcpServer({ baseUrl: "https://api.qa.army", accessToken: "secret", request });
    const client = new Client({ name: "errors", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a); open.push(client, server);
    const result = await client.callTool({ name: "workspaces.list", arguments: {} });
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({ error: { status: 422, code: "INVALID_WORKSPACE", title: "Invalid Workspace" } });
    expect(JSON.stringify(result)).toContain("Invalid Workspace (INVALID_WORKSPACE, 422)");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(JSON.stringify(result)).not.toContain("Run request");
  });

  it("rejects noncanonical Run receipts instead of dropping required fields", async () => {
    const { run_url: _omitted, ...invalidRun } = runObject("READY");
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ run: invalidRun })));
    const server = createVenkatMcpServer({ baseUrl: "https://api.qa.army", accessToken: "token", request });
    const client = new Client({ name: "receipt-validation", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a); open.push(client, server);
    const result = await client.callTool({ name: "runs.create", arguments: { test_id: `tst_${"4".repeat(32)}`, request_key: "receipt" } });
    expect(result.isError).toBe(true);
  });

  it("matches canonical slug, Mobile filename, and request-key bounds", async () => {
    const request = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ project: { id: "saved" } })));
    const server = createVenkatMcpServer({ baseUrl: "https://api.qa.army", accessToken: "token", request });
    const client = new Client({ name: "constraint-parity", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair(); await server.connect(b); await client.connect(a); open.push(client, server);
    const workspace_id = `wsp_${"a".repeat(32)}`;
    const valid = { workspace_id, request_key: "k", name: "App", type: "mobile", target: { app_name: "App", binary_filename: "App.app.zip" } };
    expect((await client.callTool({ name: "projects.create", arguments: valid })).isError).not.toBe(true);
    expect((await client.callTool({ name: "projects.create", arguments: { ...valid, target: { ...valid.target, binary_filename: "App.app.tgz" } } })).isError).toBe(true);
    expect((await client.callTool({ name: "workspaces.create", arguments: { request_key: "k", display_name: "A", name: "A", slug: "ab" } })).isError).toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe("QA.army MCP configuration", () => {
  it.each(["https://api.qa.army", "https://api.qa.army/", "https://api.qa.army/v1", "https://api.qa.army/v1/"])(
    "normalizes %s to the canonical origin", value => expect(normalizeApiBaseUrl(value)).toBe("https://api.qa.army"),
  );

  it("prefers QA.army variables, supports legacy aliases, and defaults the URL", () => {
    expect(loadConfig({ QA_ARMY_ACCESS_TOKEN: "new", VENKAT_ACCESS_TOKEN: "old", QA_ARMY_API_URL: "https://new.example/v1", VENKAT_API_URL: "https://old.example" }))
      .toEqual({ accessToken: "new", baseUrl: "https://new.example" });
    expect(loadConfig({ VENKAT_ACCESS_TOKEN: "old", VENKAT_API_URL: "http://localhost:3000/v1" }))
      .toEqual({ accessToken: "old", baseUrl: "http://localhost:3000" });
    expect(loadConfig({ QA_ARMY_ACCESS_TOKEN: "token" })).toEqual({ accessToken: "token", baseUrl: "https://api.qa.army" });
  });

  it.each(["https://api.qa.army/v2", "https://api.qa.army/v1/runs", "ftp://api.qa.army", "https://user:pass@api.qa.army", "https://api.qa.army?x=1"])(
    "rejects unsafe or non-origin API URL %s", value => expect(() => normalizeApiBaseUrl(value)).toThrow(),
  );
});

function response(status = "READY", statusCode = 201) {
  return new Response(JSON.stringify({ run: runObject(status) }), {
    status: statusCode, headers: { "content-type": "application/json" },
  });
}

function runObject(status: string) {
  return {
    id: `run_${"1".repeat(32)}`, status, workspace_id: `wsp_${"2".repeat(32)}`,
    project_id: `prj_${"3".repeat(32)}`, test_group_id: null, test_id: `tst_${"4".repeat(32)}`,
    run_url: `https://app.qa.army/dashboard/workspace/projects/prj_${"3".repeat(32)}/tests/tst_${"4".repeat(32)}/runs/run_${"1".repeat(32)}`,
    trigger: "manual", triggered_by: `usr_${"5".repeat(32)}`,
    context_schema_version: 2, context_hash: `sha256:${"a".repeat(64)}`,
    resolved_at: "2026-08-19T12:00:00.000Z",
    created_at: "2026-08-19T11:59:00.000Z", updated_at: "2026-08-19T12:00:00.000Z",
    cancellation_requested_at: null, completed_at: null, outcome_summary: null,
  };
}
