#!/usr/bin/env node
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { createVenkatMcpServer } from "./server.js";

const baseUrl = required("VENKAT_API_URL");
const accessToken = required("VENKAT_ACCESS_TOKEN");
const handle = serveStdio(() => createVenkatMcpServer({ baseUrl, accessToken }));

process.on("SIGINT", () => { void handle.close(); });
process.on("SIGTERM", () => { void handle.close(); });

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
