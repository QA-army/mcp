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

Codex: open this repo folder as the project and select Worktree from `main`. `.codex/environments/environment.toml` provides setup, cleanup, and actions; dependency installation is explicit.

## Product memory

Memory management is undergoing release validation. Use a user session or profile API key; setup-only WorkOS credentials are restricted. Review evidence before approving proposals and keep credentials in Test Accounts. Published memory assists Test creation and individual Run actions; saved assertions still verify current behavior.

### Native build registrations

`builds.list`, `builds.reserve`, and `builds.complete` use server-authorized Mobile Project scope. Reserve the original filename, platform (`ios` or `android`), exact byte count, SHA-256 and a stable request key. Supported files are Android `.apk` and iOS simulator `.app.zip`, `.app.tar.gz` or `.app.tgz`, up to 512 MiB. PUT the file to the returned short-lived URL with only its supplied headers, never the Product bearer token. Complete registration after upload; the server verifies immutable original bytes. These tools require a user session or profile API key; agent setup credentials remain restricted. Build registration does not establish native Run support.

### Dynamic PR Tests pilot

The assisted **DOGFOOD-PENDING** pilot adds `prs.list`, `prs.get`, `prs.settings`, `prs.configure`, `prs.usage`, `prs.cancel`, `prs.rerun`, and `prs.promote`. These tools call canonical REST; they do not read repository credentials or execute Tests locally. Restricted agent setup credentials remain restricted.

Use `prs.usage` before discussing consumption. Enabling dynamic Tests automatically executes at most three generated Tests per matching preview. Planning is included, and each completed generated Test consumes one shared Workspace Run. Show that explicit reruns may consume up to three new Runs before requesting one. Mutation tools require `request_key`; retain it after an uncertain response. Promotion creates an editable regression copy without changing the original verification.

## ACT outcomes

Saved ACT steps accept an optional `verification` object: `expectation` (text), `timeout_ms` (1000–120000, default 30000), and `checks` (up to eight `{ "query": "Visible value to read", "equals": "Exact value" }` entries). `equals` can be text, a number, or a boolean. The server freezes inferred expectations when omitted; ambiguous outcomes error before mutation. A dispatched action alone cannot pass. Explicit Assert and Screenshot steps keep their independent roles and order; screenshot-only Tests remain valid. Run receipts support context versions 1 through 4, including historical Runs.
