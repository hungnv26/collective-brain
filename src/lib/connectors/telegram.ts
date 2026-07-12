import type { Connector, ConnectorConfig, FetchResult, NormalizedItem, Secrets } from "./types";

interface TgUser {
  first_name?: string;
  username?: string;
}
interface TgChat {
  id: number;
  title?: string;
  username?: string;
  type?: string;
}
interface TgMessage {
  message_id: number;
  from?: TgUser;
  chat: TgChat;
  date: number;
  text?: string;
  message_thread_id?: number;
  reply_to_message?: { message_id: number };
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  channel_post?: TgMessage;
}

/** Pure: a Telegram update → normalized item, or null for non-text updates. */
export function telegramItem(update: TgUpdate): NormalizedItem | null {
  const msg = update.message ?? update.channel_post;
  if (!msg?.text) return null;
  const author = msg.from
    ? msg.from.first_name || msg.from.username || null
    : (msg.chat.title ?? null);
  const url = msg.chat.username ? `https://t.me/${msg.chat.username}/${msg.message_id}` : null;
  return {
    externalId: `${msg.chat.id}:${msg.message_id}`,
    author,
    timestamp: new Date(msg.date * 1000).toISOString(),
    text: msg.text,
    threadId: msg.message_thread_id
      ? String(msg.message_thread_id)
      : msg.reply_to_message
        ? String(msg.reply_to_message.message_id)
        : null,
    url,
  };
}

/** Pure: next getUpdates offset is the highest update_id seen + 1. */
export function nextTelegramOffset(updates: TgUpdate[], prev: string | null): string | null {
  let max = 0;
  for (const u of updates) max = Math.max(max, u.update_id);
  return max ? String(max + 1) : prev;
}

/** Verify a bot token via getMe (used by the token-based connect flow). */
export async function verifyTelegramToken(token: string): Promise<{ ok: boolean; username?: string }> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const json = await res.json();
    if (!json.ok) return { ok: false };
    return { ok: true, username: json.result?.username };
  } catch {
    return { ok: false };
  }
}

export const telegramConnector: Connector = {
  provider: "telegram",
  // No authUrl/exchangeCode — Telegram uses a bot token, set on the connect form.

  async fetchSince(secrets: Secrets, cursor: string | null, config: ConnectorConfig): Promise<FetchResult> {
    const token = secrets.bot_token as string;
    const chatIds = new Set((config.chatIds as string[] | undefined)?.map(String) ?? []);

    const url = new URL(`https://api.telegram.org/bot${token}/getUpdates`);
    if (cursor) url.searchParams.set("offset", cursor);
    url.searchParams.set("limit", "100");
    url.searchParams.set("allowed_updates", JSON.stringify(["message", "channel_post"]));

    const res = await fetch(url);
    const json = await res.json();
    if (!json.ok) throw new Error(`telegram: ${json.description ?? "getUpdates failed"}`);

    const updates = (json.result ?? []) as TgUpdate[];
    const items = updates
      .map(telegramItem)
      .filter((i): i is NormalizedItem => i !== null)
      .filter((i) => chatIds.size === 0 || chatIds.has(i.externalId.split(":")[0]));

    return { items, cursor: nextTelegramOffset(updates, cursor) };
  },
};
