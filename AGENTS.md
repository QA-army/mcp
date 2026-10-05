# MCP

When this checkout is inside a local QA.army workspace, find the nearest ancestor containing `.qa-army-workspace` and read that ancestor's AGENTS.md before changes. If absent, use this repository's instructions independently; private workspace access is not required.

- Own MCP tool schemas, API adapters, transport behavior, errors, and public MCP documentation.
- Match supported platform API semantics and applicable CLI capabilities. Do not duplicate server-owned authorization, context resolution, or execution policy.
- Platform contract changes require matching tool/schema/error updates where applicable. Update affected skills when tool names or workflows change.
- Install with `npm ci`; validate with `npm run validate`. Test malformed inputs, API failures, and authentication boundaries where relevant.
- Maintain required Linux, macOS, and Windows validation. Do not add a QA.army journey gate without a scoped rollout.
- Use a clean task branch from current origin/main, review the final diff, and pass required checks before release.
- Keep credentials and private operational material out of this public repository.
