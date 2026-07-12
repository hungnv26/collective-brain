import { describe, expect, test } from "vitest";
import { slackItem, nextSlackCursor } from "@/lib/connectors/slack";
import {
  decodeB64Url,
  gmailPlainText,
  stripQuoted,
  parseGmailMessage,
  nextGmailCursor,
} from "@/lib/connectors/gmail";

describe("slack adapter (pure)", () => {
  test("slackItem normalizes a message", () => {
    const it = slackItem("C123", { ts: "1700000000.000100", user: "U9", text: "hi", thread_ts: "1699999999.0" }, "Jane");
    expect(it.externalId).toBe("C123:1700000000.000100");
    expect(it.author).toBe("Jane");
    expect(it.threadId).toBe("1699999999.0");
    expect(it.timestamp).toBe(new Date(1700000000.0001 * 1000).toISOString());
  });

  test("nextSlackCursor takes the highest ts", () => {
    expect(nextSlackCursor([{ ts: "100.5" }, { ts: "300.2" }, { ts: "200.1" }], null)).toBe("300.2");
    expect(nextSlackCursor([], "50")).toBe("50"); // nothing new → keep prior
  });
});

describe("gmail adapter (pure)", () => {
  test("decodeB64Url decodes url-safe base64", () => {
    const encoded = Buffer.from("héllo & <b>", "utf-8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
    expect(decodeB64Url(encoded)).toBe("héllo & <b>");
  });

  test("gmailPlainText finds the text/plain part in a nested payload", () => {
    const data = Buffer.from("the body", "utf-8").toString("base64url");
    const text = gmailPlainText({
      headers: [],
      parts: [
        { mimeType: "text/html", body: { data: Buffer.from("<p>x</p>").toString("base64url") } },
        { mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data } }] },
      ],
    });
    expect(text).toBe("the body");
  });

  test("stripQuoted removes quotes, reply headers, and signatures", () => {
    const raw = ["New content here.", "On Mon wrote:", "> old quoted line", "-- ", "My Signature"].join("\n");
    expect(stripQuoted(raw)).toBe("New content here.");
  });

  test("parseGmailMessage builds a normalized item", () => {
    const item = parseGmailMessage({
      id: "m1",
      threadId: "t1",
      internalDate: "1700000000000",
      payload: {
        headers: [
          { name: "From", value: "boss@acme.test" },
          { name: "Subject", value: "Q3 pricing" },
        ],
        body: { data: Buffer.from("We set net-30.", "utf-8").toString("base64url") },
      },
    });
    expect(item.externalId).toBe("m1");
    expect(item.author).toBe("boss@acme.test");
    expect(item.text).toBe("Q3 pricing\n\nWe set net-30.");
    expect(item.timestamp).toBe(new Date(1700000000000).toISOString());
  });

  test("nextGmailCursor takes the highest internalDate", () => {
    expect(nextGmailCursor(["1700000000000", "1700000005000", undefined], null)).toBe("1700000005000");
  });
});
