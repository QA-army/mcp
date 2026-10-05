# MCP — agent integrations

**Be a doer.** Inspect, implement, test, review, merge, deploy or publish when needed, and verify the requested outcome. Fix failures and continue until delivered or concretely blocked; a plan, PR, or green build alone is not completion.

If an ancestor contains `.qa-army-workspace`, read its `AGENTS.md` first. Otherwise, this repo stands alone.

- Own tool schemas, REST adapters, stdio transport, typed errors, and MCP docs.
- Match supported platform/CLI capabilities. Authorization, context resolution, and execution remain server-owned; MCP stays outside the Run execution path.
- Coordinate API/schema/tool-name changes with platform and skills. Use [README](README.md) validation; test malformed input, auth boundaries, and API failures.
- Use a clean task branch from current main, review the diff, and pass Linux/macOS/Windows CI. QA.army journey gates currently apply only to landing-marketing.
- Preserve compatibility identifiers and unrelated work. Keep credentials/private operations out of this public repo; reserve stdout for MCP.

## Direction

- Build a better product than [TesterArmy](https://tester.army/); read its [blog](https://tester.army/blog) for product guidance and verify ideas against customer needs.
- Get funding through shipped value, measurable traction, and repeatable demos backed by real evidence. Never invent results.
- QA.army is the first customer: use the same product, permissions, integrations, and release journeys customers use; turn findings into general fixes.
- Build for SaaS, web, mobile, and desktop customers across domains. Customer URLs, IDs, selectors, and workflows belong in configuration or Tests, never product-code special cases. Do not overbuild unrequested abstractions.
