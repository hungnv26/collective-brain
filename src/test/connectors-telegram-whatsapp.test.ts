import { describe, expect, test } from "vitest";
import { telegramItem, nextTelegramOffset, type TgUpdate } from "@/lib/connectors/telegram";
import { looksLikeWhatsAppExport, parseWhatsAppExport } from "@/lib/connectors/whatsapp";

describe("telegram adapter (pure)", () => {
  test("telegramItem normalizes a group message", () => {
    const u: TgUpdate = {
      update_id: 10,
      message: {
        message_id: 42,
        from: { first_name: "Jane", username: "jane" },
        chat: { id: -100123, title: "Team", type: "supergroup" },
        date: 1700000000,
        text: "ship it",
      },
    };
    const item = telegramItem(u)!;
    expect(item.externalId).toBe("-100123:42");
    expect(item.author).toBe("Jane");
    expect(item.text).toBe("ship it");
    expect(item.timestamp).toBe(new Date(1700000000 * 1000).toISOString());
  });

  test("telegramItem ignores non-text updates", () => {
    expect(telegramItem({ update_id: 1 })).toBeNull();
    expect(telegramItem({ update_id: 2, message: { message_id: 1, chat: { id: 1 }, date: 1 } })).toBeNull();
  });

  test("nextTelegramOffset is highest update_id + 1", () => {
    expect(nextTelegramOffset([{ update_id: 5 }, { update_id: 9 }, { update_id: 7 }], null)).toBe("10");
    expect(nextTelegramOffset([], "3")).toBe("3"); // nothing new → keep prior
  });
});

describe("whatsapp export parser (pure)", () => {
  const ios = [
    "[15/01/2024, 14:30:05] Messages and calls are end-to-end encrypted.",
    "[15/01/2024, 14:31:00] Jane: We agreed on net-30 terms",
    "with Acme.",
    "[15/01/2024, 14:32:10] Tom: <Media omitted>",
    "[15/01/2024, 14:33:00] Tom: Sounds good 👍",
  ].join("\n");

  test("detects an export", () => {
    expect(looksLikeWhatsAppExport(ios)).toBe(true);
    expect(looksLikeWhatsAppExport("just some notes\nno timestamps here")).toBe(false);
  });

  test("cleans to Author: message, joining multi-line and dropping system/media", () => {
    const out = parseWhatsAppExport(ios);
    expect(out).toContain("Jane: We agreed on net-30 terms\nwith Acme.");
    expect(out).toContain("Tom: Sounds good 👍");
    expect(out).not.toContain("end-to-end encrypted"); // system line dropped
    expect(out).not.toContain("Media omitted"); // media-only dropped
  });

  test("parses the Android format too", () => {
    const android = "15/01/2024, 14:30 - Jane: hello there";
    expect(parseWhatsAppExport(android)).toBe("Jane: hello there");
  });
});
