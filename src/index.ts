#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadConfig } from "./config.js";
import { createQaArmyMcpServer } from "./server.js";

const config = loadConfig();
const handle = serveStdio(() => createQaArmyMcpServer(config));

process.on("SIGINT", () => { void handle.close(); });
process.on("SIGTERM", () => { void handle.close(); });
