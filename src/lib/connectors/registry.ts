import type { Connector, Provider } from "./types";
import { slackConnector } from "./slack";
import { gmailConnector } from "./gmail";

/**
 * The registered adapters. WhatsApp/Instagram aren't here — they arrive via file
 * export (Phase 3), not a polling adapter, so the sync runner skips them.
 */
export const CONNECTORS: Partial<Record<Provider, Connector>> = {
  slack: slackConnector,
  gmail: gmailConnector,
};
