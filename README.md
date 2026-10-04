# QA.army MCP

Phase 2 exposes all capabilities shipped through Phase 2 over the official MCP
TypeScript SDK v2 stdio transport: Workspace CRUD, Project list/create,
members/invitations, Test Group CRUD, Test CRUD/archive, and `runs.create` /
`runs.get`, `runs.start`, `runs.watch`, and `runs.cancel`. Every tool calls the canonical QA.army REST API; MCP does not
duplicate scope resolution and is not part of AgentCore run execution.

For current dogfood, launch `venkat-mcp` with `VENKAT_API_URL` and a runtime
`VENKAT_ACCESS_TOKEN`. The process reserves stdout for MCP and never prints or
persists the token. Hosted account authorization remains `DOGFOOD-PENDING`.
