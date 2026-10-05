import { Client, InMemoryTransport } from "@modelcontextprotocol/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createVenkatMcpServer } from "../src/server.js";

const open: Array<{ close(): Promise<void> }> = [];
afterEach(async () => { await Promise.all(open.splice(0).map((item) => item.close())); });

describe("QA.army MCP Run parity", () => {
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
      "memories.list", "memories.graph", "memories.summary", "memories.create", "memories.update", "memories.decide", "memories.settings", "memories.import", "memories.history", "memories.clear",
      "workspaces.list", "workspaces.create", "workspaces.get", "workspaces.update",
      "projects.list", "projects.create", "members.list", "invitations.create",
      "groups.list", "groups.create", "groups.get", "groups.update",
      "tests.list", "tests.create", "tests.get", "tests.update", "tests.archive",
      "runs.create", "runs.get", "runs.start", "runs.watch", "runs.cancel",
    ]);
    const result = await client.callTool({
      name: "runs.create", arguments: { test_id: `tst_${"4".repeat(32)}` },
    });
    expect(result.structuredContent).toMatchObject({ status: "READY", context_schema_version: 2 });
    const [, init] = request.mock.calls[0]!;
    expect(init?.body).toBe(JSON.stringify({ test_id: `tst_${"4".repeat(32)}` }));
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

    expect((await client.callTool({ name: "runs.start", arguments: { run_id: runId } })).structuredContent)
      .toMatchObject({ id: runId, status: "QUEUED" });
    expect((await client.callTool({ name: "runs.watch", arguments: { run_id: runId, after_sequence: 4 } })).structuredContent)
      .toMatchObject({ next_after: 5, terminal: false });
    expect((await client.callTool({ name: "runs.cancel", arguments: { run_id: runId } })).structuredContent)
      .toMatchObject({ id: runId, status: "CANCELLED" });
    expect(request.mock.calls.map(([url]) => String(url))).toEqual([
      `https://app.example.test/v1/runs/${runId}/start`,
      `https://app.example.test/v1/runs/${runId}/events?after=4`,
      `https://app.example.test/v1/runs/${runId}/cancel`,
    ]);
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
    expect(request.mock.calls[2]?.[1]?.headers).toMatchObject({ "idempotency-key": expect.any(String) });
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
      workspace_id: workspace, name: "Store", type: "web", target: { url: "https://shop.example.test" },
    } });
    expect(result.isError).not.toBe(true);
    const [url, init] = request.mock.calls[0]!;
    expect(url).toBe(`https://app.example.test/v1/workspaces/${workspace}/projects`);
    expect(JSON.parse(String(init?.body))).toEqual({
      name: "Store", type: "web", target: { url: "https://shop.example.test" },
    });
  });

  it("fails input validation before calling REST", async () => {
    const request = vi.fn<typeof fetch>();
    const server = createVenkatMcpServer({ baseUrl: "https://app.example.test", accessToken: "token", request });
    const client = new Client({ name: "venkat-test", version: "1.0.0" });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport); await client.connect(clientTransport);
    open.push(client, server);
    const result = await client.callTool({ name: "runs.create", arguments: { test_id: "foreign" } });
    expect(result.isError).toBe(true); expect(request).not.toHaveBeenCalled();
  });
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
    context_schema_version: 2, context_hash: `sha256:${"a".repeat(64)}`,
    resolved_at: "2026-08-19T12:00:00.000Z",
    cancellation_requested_at: null, completed_at: null, outcome_summary: null,
  };
}
