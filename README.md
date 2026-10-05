# QA.army MCP

An MCP stdio server for the canonical QA.army REST API: Workspaces, Projects, members, invitations, Test Groups, Tests, and Run lifecycle operations. It owns no execution or tenant policy.

## Develop and run

Node.js 22+:

```sh
npm ci
npm run validate
node dist/src/index.js
```

Configure the MCP host to supply `VENKAT_API_URL` and a short-lived `VENKAT_ACCESS_TOKEN` through its secret mechanism. The compatibility binary is `venkat-mcp`; stdout is reserved for MCP. Never print or persist tokens. Hosted account authorization remains `DOGFOOD-PENDING`.

Read [AGENTS.md](AGENTS.md). Keep tool schemas aligned with supported platform/CLI behavior and pass Linux, macOS, and Windows CI.
