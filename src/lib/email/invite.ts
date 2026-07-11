import { emailFrom, isEmailConfigured, resendApiKey } from "@/lib/env";

export interface InviteEmail {
  to: string;
  inviteUrl: string;
  orgName: string;
  inviterEmail?: string | null;
  role?: string;
}

export interface SendResult {
  sent: boolean;
  reason?: "not-configured" | "error";
  error?: string;
}

/** Subject + HTML/text body for an invite. Pure — no I/O, so it's unit-testable. */
export function renderInviteEmail(e: InviteEmail): { subject: string; html: string; text: string } {
  const who = e.inviterEmail ? `${e.inviterEmail} invited you` : "You've been invited";
  const subject = `Join ${e.orgName} on Collective Brain`;
  const safeOrg = escapeHtml(e.orgName);
  const safeUrl = encodeURI(e.inviteUrl);

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 4px">Collective Brain</h1>
      <p style="color:#71717a;margin:0 0 20px">${escapeHtml(who)} to <strong>${safeOrg}</strong>.</p>
      <a href="${safeUrl}"
         style="display:inline-block;background:#18181b;color:#fff;text-decoration:none;
                padding:10px 16px;border-radius:8px;font-weight:600">Accept invite</a>
      <p style="color:#71717a;font-size:12px;margin:20px 0 0">
        Or paste this link into your browser:<br>
        <span style="word-break:break-all">${safeUrl}</span>
      </p>
    </div>`.trim();

  const text = `${who} to ${e.orgName} on Collective Brain.\n\nAccept your invite:\n${e.inviteUrl}\n`;
  return { subject, html, text };
}

/**
 * Best-effort invite email via Resend's REST API (no SDK — just fetch). When no
 * provider key is configured it no-ops with `sent: false` so the caller can fall
 * back to showing the copyable link. Never throws.
 */
export async function sendInviteEmail(e: InviteEmail): Promise<SendResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "not-configured" };

  const { subject, html, text } = renderInviteEmail(e);
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendApiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: emailFrom(), to: e.to, subject, html, text }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return { sent: false, reason: "error", error: `${res.status} ${detail}`.trim() };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: "error", error: err instanceof Error ? err.message : "unknown" };
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
