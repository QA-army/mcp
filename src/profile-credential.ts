import { NativeApiKeyCredentialStore, validApiKey } from './cli-auth/auth-store.js';
import { NativeAgentCredentialStore } from './cli-auth/agent-auth-store.js';
import { WorkosAgentAccessTokenProvider, type ApiAccessTokenProvider } from './cli-auth/agent-access-token.js';
const origin = 'https://api.qa.army';

export async function resolveCredential(environment: NodeJS.ProcessEnv): Promise<{ baseUrl: string; accessToken: string | ApiAccessTokenProvider }> {
  let url: URL;
  try { url = new URL(environment.VENKAT_API_URL ?? origin); }
  catch { throw new Error('VENKAT_API_URL must be a valid HTTPS API origin'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !['/','/v1','/v1/'].includes(url.pathname)) throw new Error('VENKAT_API_URL must be an HTTPS origin or end in /v1, without credentials, query or fragment');
  const baseUrl = url.origin;
  const apiKey = environment.QA_ARMY_API_KEY;
  if (apiKey) {
    if (!validApiKey(apiKey)) throw new Error('QA_ARMY_API_KEY is invalid');
    return { baseUrl, accessToken: apiKey };
  }
  const token = environment.QA_ARMY_ACCESS_TOKEN ?? environment.VENKAT_ACCESS_TOKEN;
  if (token) return { baseUrl, accessToken: token };
  if (baseUrl !== origin) throw new Error('Native credentials may only be sent to https://api.qa.army; inject a credential explicitly for another API');
  const key = await new NativeApiKeyCredentialStore().get();
  if (key) return {baseUrl,accessToken:key};
  const store = new NativeAgentCredentialStore();
  const credential = await store.get();
  if (!credential) throw new Error('No QA.army credential is available; run qa-army auth agent-register first');
  return {baseUrl,accessToken:new WorkosAgentAccessTokenProvider(store,undefined,Date.now,credential)};
}
