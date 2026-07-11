import { emailFrom, isEmailConfigured, resendApiKey } from "@/lib/env";

export interface SendResult {
  sent: boolean;
  reason?: "not-configured" | "error";
  error?: string;
}

export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
  text: string;
}

/**
 * Best-effort transactional email via Resend's REST API (no SDK — just fetch).
 * No-ops with `sent: false` when no provider key is configured, and never
 * throws: email is a side effect, not a critical path.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!isEmailConfigured()) return { sent: false, reason: "not-configured" };
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${resendApiKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ from: emailFrom(), ...msg }),
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

/** Escape user-controlled text before interpolating into an email's HTML. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
