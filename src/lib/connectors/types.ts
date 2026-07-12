export type Provider = "slack" | "gmail" | "whatsapp" | "instagram";

export const PROVIDERS: Provider[] = ["slack", "gmail", "whatsapp", "instagram"];

export const PROVIDER_LABEL: Record<Provider, string> = {
  slack: "Slack",
  gmail: "Gmail",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
};

/** A message/email normalized to the shape the ingest pipeline needs. */
export interface NormalizedItem {
  externalId: string; // stable id for dedup (e.g. Slack ts, Gmail message id)
  author: string | null;
  timestamp: string; // ISO 8601
  text: string;
  threadId?: string | null;
  url?: string | null; // deep link back to the source
}

export interface FetchResult {
  items: NormalizedItem[];
  cursor: string | null; // the cursor to store and resume from next sync
}

export type Secrets = Record<string, unknown>;
export type ConnectorConfig = Record<string, unknown>;

/**
 * The one contract every channel implements. OAuth methods are optional (a file
 * export connector needs none); `fetchSince` is the required incremental pull.
 */
export interface Connector {
  provider: Provider;
  authUrl?(redirectUri: string, state: string): string;
  exchangeCode?(code: string, redirectUri: string): Promise<Secrets>;
  fetchSince(secrets: Secrets, cursor: string | null, config: ConnectorConfig): Promise<FetchResult>;
}
