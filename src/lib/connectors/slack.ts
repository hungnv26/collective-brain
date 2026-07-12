import type { Connector, ConnectorConfig, FetchResult, NormalizedItem, Secrets } from "./types";
import { slackClientId, slackClientSecret } from "@/lib/env";

const SCOPES = "channels:history,groups:history,channels:read,groups:read,users:read";

interface SlackMessage {
  ts: string;
  user?: string;
  username?: string;
  text?: string;
  thread_ts?: string;
  subtype?: string;
}

/** Pure: turn a Slack message into a normalized item. Unit-testable. */
export function slackItem(channel: string, m: SlackMessage, author: string | null): NormalizedItem {
  const tsNum = Number.parseFloat(m.ts);
  return {
    externalId: `${channel}:${m.ts}`,
    author,
    timestamp: new Date(tsNum * 1000).toISOString(),
    text: m.text ?? "",
    threadId: m.thread_ts ?? null,
    url: null,
  };
}

/** Pure: the highest ts seen becomes the next cursor (Slack `oldest`). */
export function nextSlackCursor(messages: { ts: string }[], prev: string | null): string | null {
  let max = prev ? Number.parseFloat(prev) : 0;
  for (const m of messages) max = Math.max(max, Number.parseFloat(m.ts));
  return max ? String(max) : prev;
}

async function slackGet(token: string, method: string, params: Record<string, string>) {
  const url = new URL(`https://slack.com/api/${method}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
  const json = await res.json();
  if (!json.ok) throw new Error(`slack ${method}: ${json.error}`);
  return json;
}

async function resolveUser(token: string, id: string, cache: Map<string, string>): Promise<string> {
  const hit = cache.get(id);
  if (hit) return hit;
  try {
    const j = await slackGet(token, "users.info", { user: id });
    const name = j.user?.real_name || j.user?.name || id;
    cache.set(id, name);
    return name;
  } catch {
    return id;
  }
}

export const slackConnector: Connector = {
  provider: "slack",

  authUrl(redirectUri, state) {
    const p = new URLSearchParams({
      client_id: slackClientId() ?? "",
      scope: SCOPES,
      redirect_uri: redirectUri,
      state,
    });
    return `https://slack.com/oauth/v2/authorize?${p.toString()}`;
  },

  async exchangeCode(code, redirectUri): Promise<Secrets> {
    const res = await fetch("https://slack.com/api/oauth.v2.access", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: slackClientId() ?? "",
        client_secret: slackClientSecret() ?? "",
        code,
        redirect_uri: redirectUri,
      }),
    });
    const json = await res.json();
    if (!json.ok) throw new Error(`slack oauth: ${json.error}`);
    return { access_token: json.access_token, team_id: json.team?.id, team_name: json.team?.name };
  },

  async fetchSince(secrets: Secrets, cursor: string | null, config: ConnectorConfig): Promise<FetchResult> {
    const token = secrets.access_token as string;
    const channels = (config.channels as string[] | undefined) ?? [];
    const userCache = new Map<string, string>();
    const items: NormalizedItem[] = [];
    const seenTs: { ts: string }[] = [];

    for (const channel of channels) {
      let pageCursor: string | undefined;
      do {
        const params: Record<string, string> = { channel, limit: "200" };
        if (cursor) params.oldest = cursor;
        if (pageCursor) params.cursor = pageCursor;
        const json = await slackGet(token, "conversations.history", params);
        for (const m of (json.messages ?? []) as SlackMessage[]) {
          if (m.subtype) continue; // skip joins/leaves/bot noise
          const author = m.user ? await resolveUser(token, m.user, userCache) : (m.username ?? null);
          items.push(slackItem(channel, m, author));
          seenTs.push({ ts: m.ts });
        }
        pageCursor = json.response_metadata?.next_cursor || undefined;
      } while (pageCursor);
    }

    return { items, cursor: nextSlackCursor(seenTs, cursor) };
  },
};
