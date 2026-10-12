#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { resolveCredential } from "./profile-credential.js";
import { createVenkatMcpServer } from "./server.js";

const { baseUrl, accessToken } = await resolveCredential(process.env);
const handle = serveStdio(() => createVenkatMcpServer({ baseUrl, accessToken }));

process.on("SIGINT", () => { void handle.close(); });
process.on("SIGTERM", () => { void handle.close(); });
