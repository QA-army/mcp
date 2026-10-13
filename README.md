# QA.army MCP

An MCP stdio server for the canonical QA.army REST API: Workspaces, Projects, members, invitations, Test Groups, Tests, and Run lifecycle operations. It owns no execution or tenant policy.

## Develop and run

Node.js 22+:

```sh
npm ci
npm run validate
node dist/src/index.js
```

The API defaults to `https://api.qa.army`; optional `VENKAT_API_URL` must be HTTPS.
Credential precedence matches CLI: `QA_ARMY_API_KEY`, then
`QA_ARMY_ACCESS_TOKEN` / `VENKAT_ACCESS_TOKEN`, then an existing native profile
key, then the native claimed WorkOS identity. Register once with
`qa-army auth agent-register`; MCP reuses the same `qa.army.cli` native store,
keeps access tokens in memory, and uses the CLI's assertion exchange and rotating
refresh implementation. Native credentials are sent only to the canonical API
origin. No token export or second login is required.
The compatibility binary is `venkat-mcp`; stdout is reserved for MCP. Never print or persist tokens. Hosted account authorization remains `DOGFOOD-PENDING`.

Read [AGENTS.md](AGENTS.md). Keep tool schemas aligned with supported platform/CLI behavior and pass Linux, macOS, and Windows CI.

Codex: open this repo folder as the project and select Worktree from `main`. `.codex/environments/environment.toml` provides setup, cleanup, and actions; dependency installation is explicit.

## Run evidence history

Use `runs.list({ test_id: "tst_...", trigger: "manual" })` for manual Run evidence and `trigger: "deploy"` for deployment/PR evidence. Omit `trigger` for all Runs. Pass the returned `next_before` as `before` and preserve `trigger` when paging; `limit` accepts 1–50 (default 20). The server applies the filter before pagination and retains Workspace authorization. A filtered response with a missing or different Run trigger is rejected, including during a backend rollout. Filtering reads evidence; it never changes Run outcomes or establishes a passing PR check.

## PR review links with QA.army evidence (release validation pending)

For “Show me my PR approval links with QA.army evidence,” use
`prs.approval_links({ project_id: "prj_..." })`. The tool makes one authenticated
`GET /v1/projects/{projectId}/pr-approval-links` request. QA.army's proprietary
cloud service owns authorization, GitHub observations and evidence aggregation;
this public adapter does not read repository credentials or calculate readiness.

Use an authorized Cognito user session or a governed claimed WorkOS agent.
Profile API keys and setup-only credentials are denied. Preserve `403` as an
error; never switch identities or substitute credentials to bypass it.

The response covers at most 10 QA-observed PRs for the Project, not every PR
assigned to the user. Show the returned review links and server `qa_state`,
freshness and evidence reasons; preserve any truncation warning. Selected Run
attempts, evidence finalization and cleanup affect evidence readiness. Observed
checks are not the repository's required branch rules. Missing, stale, failed
or blocked evidence must not become a pass.
A review link is navigation for a human; this tool does not approve, merge,
start a Run or establish merge readiness. API errors remain errors, including
when the endpoint is unavailable or the credential lacks permission.

This source addition requires the matching server endpoint and a released client.
It does not add a hosted MCP connection for an iPhone; transport remains stdio.

## Product memory

Memory management is undergoing release validation. Use a user session or profile API key; claimed WorkOS credentials do not authorize Memory management. Review evidence before approving proposals and keep credentials in Test Accounts. Published memory assists Test creation and individual Run actions; saved assertions still verify current behavior.

### Native build registrations

`builds.list`, `builds.reserve`, and `builds.complete` use server-authorized Mobile Project scope. Reserve the original filename, platform (`ios` or `android`), exact byte count, SHA-256 and a stable request key. Supported files are Android `.apk` and iOS simulator `.app.zip`, `.app.tar.gz` or `.app.tgz`, up to 512 MiB. PUT the file to the returned short-lived URL with only its supplied headers, never the Product bearer token. Complete registration after upload; the server verifies immutable original bytes. These tools require a user session or profile API key; claimed WorkOS credentials cannot register builds. Build registration does not establish native Run support.

### Dynamic PR Tests pilot

The assisted **DOGFOOD-PENDING** pilot adds `prs.list`, `prs.get`, `prs.settings`, `prs.configure`, `prs.usage`, `prs.cancel`, `prs.rerun`, and `prs.promote`. These tools call canonical REST; they do not read repository credentials or execute Tests locally. Claimed WorkOS credentials remain restricted.

Use `prs.usage` before discussing consumption. Dynamic PR configuration requires an active pilot allowance. Enabling dynamic Tests automatically executes at most three generated Tests per matching preview. Planning is included, and each generated Test that ends `PASSED` or `FAILED` consumes one Run from the applicable shared allowance. `ERROR` Runs do not consume the allowance. When Free usage applies, Runs use the monthly allowance of the account that configured the automation, shared across all Workspaces; paid plans use the Workspace allowance. Show that explicit reruns may consume up to three new Runs before requesting one. Mutation tools require `request_key`; retain it after an uncertain response. Promotion creates an editable regression copy without changing the original verification.

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

## Test management and credentials

Group and Test management use the same claimed WorkOS agent identity as setup.
Run `qa-army auth agent-register` once; the server binds that identity to the
claiming user's current Workspace membership. It can create/read/update Tests,
manage Test Groups, and create/start/cancel Runs and inspect evidence. This does
not grant Test deletion, Test Account secrets, billing, member administration or
other owner-only operations. Never copy browser session credentials or put
secrets in Test instructions.

MCP calls the canonical API directly. It does not choose a Workspace on the
caller's behalf or override server permissions. Concurrent native credential
refreshes share a private process lock with CLI; an abandoned lock fails closed
with recovery instructions.

| Operation | Tool |
| --- | --- |
| List/create/read/update Groups | `groups.list`, `groups.create`, `groups.get`, `groups.update` |
| Create/read/update Tests | `tests.create`, `tests.get`, `tests.update` |
| Run a saved Test | `runs.create`, then `runs.start` |
| Inspect result/events | `runs.get`, `runs.watch` |
| Inspect finalized evidence | `runs.evidence` |

Group updates take the current `version`. Test updates take the current
`version` and complete editable definition. Change `group_id` to move a Test
or `enabled` to enable/disable it, preserving steps, settings and journey
metadata. Stale versions are rejected. A Test belongs to one Group; `null`
selects its Project's Default group. There is no separate membership collection. `groups.run` uses the ordinary
create/start lifecycle with the explicit selection contract below.

`runs.evidence` returns finalized IDs, hashes and sizes, not signed URLs.
For artifact bytes use the CLI `evidence download` command. MCP does not return
raw signed URLs or write arbitrary files. Keep any REST artifact-open capability
out of durable logs and receipts. A missing screenshot cannot be
substituted with a metadata-only pass.

### Explicit Group Run selection

Read Group and Test metadata first, then freeze 1–20 unique enabled Tests as
`selection: [{"test_id":"tst_...","version":3}]`. CLI accepts this object through
`groups run --project prj_... --group tgr_... --request-key unique-batch-001 --input JSON`;
MCP takes `groups.run({project_id, group_id, request_key, selection})`. Each Test
is a separate canonical Run and may consume the normal Run allowance.

All selected Tests are checked for the same Project/Group, enabled state and
current version before any Run is created. Every created Run must expose the
matching immutable `test_version` from RunContext (schema 2–5) and context hash
before any child is started. Omitted/null versions never authorize dispatch.
Older servers without that proof are blocked. A response is `DISPATCHED` or
`INCOMPLETE`, never an aggregate Test pass. Use returned Run IDs to watch results
and inspect evidence. A replayed child already beyond READY is reported without
starting it again. The operation is not atomic: an interruption can leave READY
or started children, identified in the partial receipt. Reconcile those IDs
before retrying; keep the same selection and request key. Preparation failures
attempt to cancel known READY children before any start; inspect cancellation
receipts and explicitly cancel any remaining unused READY Runs. Never replace the selection with a fresh list on retry.

## Shared agent authentication source

The five modules under `src/cli-auth` are byte-identical to the CLI revision
in `src/cli-auth/provenance.json`. The offline build checks their recorded
SHA-256 hashes. Refresh/exchange concurrency and keyring behavior are maintained
in CLI first, then copied with a new exact revision; MCP has no separate auth
protocol or credential store.

## Deployment watch Test Groups

Use `qa-army prs watch --integration int_...` or MCP
`prs.watch({integration_id})` to read an existing connected GitHub deployment
watch. Update its full selection with `qa-army prs watch-update --integration
int_... --input JSON` or `prs.watch_update({integration_id, ...body})`:

```json
{"repository_id":"123456789","test_group_ids":["tgr_00000000000000000000000000000001"],"enabled":true}
```

Use the repository ID and actual Group IDs returned by the API. Read first and
include every Group you intend to keep; this replaces the selection, with no
hidden merge. At most 50 unique same-Project Groups are allowed; an enabled
watch needs at least one. The same claimed WorkOS identity can manage the watch
when its claiming user is a current Workspace OWNER. It cannot create a watch,
change its repository, reconnect GitHub, or grant provider consent. Profile API
keys and provisional setup credentials do not authorize these watch operations.

The receipt contains `deployment_watch`, including its new `version`. PUT has
no `If-Match` or idempotency-key contract: after an uncertain response, read back
and reconcile rather than retrying blindly. Changes affect subsequent matching
deployments; they do not start a manual Run or establish a passing PR check.
Keep unrelated selected Groups and integration settings intact. Inspect the
canonical exact-head Runs and screenshots after the next qualified deployment.
