import type { Connector, Provider } from "./types";
import { slackConnector } from "./slack";
import { gmailConnector } from "./gmail";
import { telegramConnector } from "./telegram";

/**
 * The registered polling adapters. WhatsApp/Instagram aren't here — they arrive
 * via file export (parsed at ingest time), not a polling adapter, so the sync
 * runner has nothing to poll for them.
 */
export const CONNECTORS: Partial<Record<Provider, Connector>> = {
  slack: slackConnector,
  gmail: gmailConnector,
  telegram: telegramConnector,
};
