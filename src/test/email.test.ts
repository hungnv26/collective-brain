import { describe, expect, test } from "vitest";
import { renderInviteEmail, sendInviteEmail } from "@/lib/email/invite";

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
