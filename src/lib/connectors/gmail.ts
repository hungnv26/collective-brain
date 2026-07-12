import type { Connector, ConnectorConfig, FetchResult, NormalizedItem, Secrets } from "./types";
import { googleClientId, googleClientSecret } from "@/lib/env";

const SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

interface GmailPart {
  mimeType?: string;
  body?: { data?: string };
  parts?: GmailPart[];
}
interface GmailMessage {
  id: string;
  threadId?: string;
  internalDate?: string;
  payload?: { headers?: { name: string; value: string }[]; body?: { data?: string }; parts?: GmailPart[] };
}

/** Pure: decode a base64url string (Gmail bodies) to UTF-8. */
export function decodeB64Url(data: string): string {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(b64, "base64").toString("utf-8");
}

/** Pure: pull the first text/plain body out of a Gmail payload tree. */
export function gmailPlainText(payload: GmailMessage["payload"]): string {
  if (!payload) return "";
  const walk = (part: GmailPart): string | null => {
    if (part.mimeType === "text/plain" && part.body?.data) return decodeB64Url(part.body.data);
    for (const child of part.parts ?? []) {
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  if (payload.body?.data && (!payload.parts || payload.parts.length === 0)) {
    return decodeB64Url(payload.body.data);
  }
  return walk({ mimeType: undefined, parts: payload.parts, body: payload.body }) ?? "";
}

/** Pure: strip quoted replies + signatures so distillation sees the new content. */
export function stripQuoted(body: string): string {
  const lines = body.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    if (/^>/.test(line)) continue; // quoted
    if (/^On .+ wrote:$/.test(line.trim())) break; // reply header
    if (/^-- $/.test(line)) break; // signature delimiter
    out.push(line);
  }
  return out.join("\n").trim();
}

/** Pure: a Gmail message → normalized item. Unit-testable. */
export function parseGmailMessage(msg: GmailMessage): NormalizedItem {
  const headers = msg.payload?.headers ?? [];
  const h = (name: string) => headers.find((x) => x.name.toLowerCase() === name.toLowerCase())?.value ?? null;
  const subject = h("Subject") ?? "(no subject)";
  const body = stripQuoted(gmailPlainText(msg.payload));
  return {
    externalId: msg.id,
    author: h("From"),
    timestamp: new Date(Number(msg.internalDate ?? Date.now())).toISOString(),
    text: `${subject}\n\n${body}`.trim(),
    threadId: msg.threadId ?? null,
    url: `https://mail.google.com/mail/u/0/#all/${msg.id}`,
  };
}

/** Pure: highest internalDate seen becomes the next cursor. */
export function nextGmailCursor(dates: (string | undefined)[], prev: string | null): string | null {
  let max = prev ? Number(prev) : 0;
  for (const d of dates) if (d) max = Math.max(max, Number(d));
  return max ? String(max) : prev;
}

async function freshToken(secrets: Secrets): Promise<string> {
  const refresh = secrets.refresh_token as string | undefined;
  if (!refresh) return secrets.access_token as string;
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: googleClientId() ?? "",
      client_secret: googleClientSecret() ?? "",
      refresh_token: refresh,
      grant_type: "refresh_token",
    }),
  });
  const json = await res.json();
  if (json.error) throw new Error(`gmail refresh: ${json.error_description || json.error}`);
  return json.access_token as string;
}

async function gapi(token: string, path: string) {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  if (json.error) throw new Error(`gmail ${path}: ${json.error.message}`);
  return json;
}

export const gmailConnector: Connector = {
  provider: "gmail",

  authUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: googleClientId() ?? "",
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  },

  async exchangeCode(code, redirectUri): Promise<Secrets> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: googleClientId() ?? "",
        client_secret: googleClientSecret() ?? "",
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const json = await res.json();
    if (json.error) throw new Error(`gmail oauth: ${json.error_description || json.error}`);
    return { access_token: json.access_token, refresh_token: json.refresh_token };
  },

  async fetchSince(secrets: Secrets, cursor: string | null, config: ConnectorConfig): Promise<FetchResult> {
    const token = await freshToken(secrets);
    const label = config.label as string | undefined;
    const afterSec = cursor ? Math.floor(Number(cursor) / 1000) : undefined;
    const q =
      [label ? `label:${label}` : "", afterSec ? `after:${afterSec}` : ""].filter(Boolean).join(" ") ||
      "newer_than:7d";

    const list = await gapi(token, `messages?q=${encodeURIComponent(q)}&maxResults=50`);
    const items: NormalizedItem[] = [];
    const dates: (string | undefined)[] = [];
    for (const ref of (list.messages ?? []) as { id: string }[]) {
      const msg = (await gapi(token, `messages/${ref.id}?format=full`)) as GmailMessage;
      items.push(parseGmailMessage(msg));
      dates.push(msg.internalDate);
    }
    return { items, cursor: nextGmailCursor(dates, cursor) };
  },
};
