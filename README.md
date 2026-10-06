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

Saved ACT steps accept an optional `verification` object: `expectation` (text), `timeout_ms` (1000–120000, default 30000), and `checks` (up to eight `{ "query": "Visible value to read", "equals": "Exact value" }` entries). `equals` can be text, a number, or a boolean. The server freezes inferred expectations when omitted; ambiguous outcomes error before mutation. A dispatched action alone cannot pass. Explicit Assert and Screenshot steps keep their independent roles and order; screenshot-only Tests remain valid. Run receipts support context versions 1 through 5, including historical Runs.


## Generated journey metadata

Focused generation in the QA.army app can compose one ordinary Test from versioned steps in existing Tests when journey discovery is enabled. Generation itself is not execution evidence. CLI and MCP continue to save supplied steps directly.

Preserve the optional `journey` object when editing a generated Test. It records source Test/step IDs and versions, inferred transitions, unresolved prerequisites, and observed identity bindings. References such as `{{binding.game}}` use a value captured from a fresh earlier ACT or Verify observation; the final independent Verify compares the actual identity again. Never replace these with a guessed ID or an instruction to “remember” a game/account. RunContext v5 freezes the composition for that Run. Explicit Verify and Screenshot remain ordinary steps.

A source changing during generation requires generating again. A missing or ambiguous identity produces `ERROR`; an observed identity mismatch produces `FAILED`. Graph retrieval and past receipts cannot make a new Run pass. Disabling journey generation leaves existing manual Tests and ACT verification available.

## Daily product clarifications (release validation pending)

Read the stable Project/UTC-day set with `qa-army memories questions --project prj_...` or MCP `memories.questions`. A set has three context-grounded questions with three choices each, or an exhausted empty state. Answer with `qa-army memories answer --project prj_... --input JSON` or `memories.answer`. The body contains `day`, `question_id`, expected `revision` (initially 0), zero-based `choice` (0–2), `skipped`, and optional `elaboration`. For a skip use `choice: null` and `skipped: true`.

Answers are customer-declared intent and require owner review before publication, even when an owner answers. Corrections append history; stale concurrent answers return a conflict. Never infer customer intent or submit a suggested choice automatically. Published answers may be supplied to future generation; supply does not prove influence or improved results.

To revisit a saved set, select its date in Memory, use CLI `memories questions --project prj_... --day YYYY-MM-DD`, or pass `day` to MCP `memories.questions`. The historical API is `GET /v1/projects/{projectId}/memory/clarifications/{day}`. Only existing sets are returned; prior answers remain correctable with revision checks.
