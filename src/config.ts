export interface QaArmyMcpConfig {
  readonly baseUrl: string;
  readonly accessToken: string;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): QaArmyMcpConfig {
  const accessToken = first(env.QA_ARMY_ACCESS_TOKEN, env.VENKAT_ACCESS_TOKEN);
  if (!accessToken) {
    throw new Error("QA_ARMY_ACCESS_TOKEN is required (VENKAT_ACCESS_TOKEN remains a compatibility alias)");
  }
  return {
    baseUrl: normalizeApiBaseUrl(first(env.QA_ARMY_API_URL, env.VENKAT_API_URL) ?? "https://api.qa.army"),
    accessToken,
  };
}

export function normalizeApiBaseUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("QA_ARMY_API_URL must be an absolute HTTP(S) URL"); }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error("QA_ARMY_API_URL must be an HTTP(S) origin without credentials, query, or fragment");
  }
  const path = url.pathname.replace(/\/+$/, "");
  if (path !== "" && path !== "/v1") {
    throw new Error("QA_ARMY_API_URL must be the API origin, optionally ending in /v1");
  }
  return url.origin;
}

function first(primary: string | undefined, compatibility: string | undefined): string | undefined {
  return primary?.trim() || compatibility?.trim() || undefined;
}
