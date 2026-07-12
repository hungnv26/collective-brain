import { describe, expect, test } from "vitest";
import { renderInviteEmail, sendInviteEmail } from "@/lib/email/invite";
import { renderDigestEmail, sendDigestEmail, type DigestReport } from "@/lib/email/digest";

describe("renderInviteEmail", () => {
  test("includes the org, the link, and the inviter", () => {
    const { subject, html, text } = renderInviteEmail({
      to: "new@x.test",
      inviteUrl: "https://app.test/join?token=abc123",
      orgName: "Acme",
      inviterEmail: "boss@acme.test",
    });
    expect(subject).toBe("Join Acme on Collective Brain");
    expect(html).toContain("https://app.test/join?token=abc123");
    expect(html).toContain("boss@acme.test invited you");
    expect(text).toContain("https://app.test/join?token=abc123");
  });

  test("escapes HTML in the org name (no injection via org title)", () => {
    const { html } = renderInviteEmail({
      to: "new@x.test",
      inviteUrl: "https://app.test/join?token=abc",
      orgName: "<script>alert(1)</script>",
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });
});

describe("sendInviteEmail", () => {
  test("no-ops (sent:false) when no provider key is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendInviteEmail({
      to: "new@x.test",
      inviteUrl: "https://app.test/join?token=abc",
      orgName: "Acme",
    });
    expect(result).toEqual({ sent: false, reason: "not-configured" });
  });
});

const REPORT: DigestReport = {
  newThisWeek: 3,
  byType: { fact: 2, idea: 1 },
  totalNodes: 42,
  openGaps: 5,
  staleNodes: 1,
};

describe("renderDigestEmail", () => {
  test("summarises the week's counts", () => {
    const { subject, html, text } = renderDigestEmail("Acme", REPORT);
    expect(subject).toBe("Acme: 3 new this week");
    expect(html).toContain("42");
    expect(html).toContain("fact 2 · idea 1");
    expect(text).toContain("Open knowledge gaps: 5");
  });

  test("escapes HTML in the org name", () => {
    const { html } = renderDigestEmail("<b>Acme</b>", REPORT);
    expect(html).not.toContain("<b>Acme</b>");
    expect(html).toContain("&lt;b&gt;");
  });
});

describe("sendDigestEmail", () => {
  test("does nothing with no recipients", async () => {
    const result = await sendDigestEmail([], "Acme", REPORT);
    expect(result.sent).toBe(false);
  });

  test("no-ops (sent:false) when no provider key is configured", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendDigestEmail(["boss@acme.test"], "Acme", REPORT);
    expect(result).toEqual({ sent: false, reason: "not-configured" });
  });
});
