import { escapeHtml, sendEmail, type SendResult } from "./send";

export interface DigestReport {
  newThisWeek: number;
  byType: Record<string, number>;
  totalNodes: number;
  openGaps: number;
  staleNodes: number;
}

/** Subject + HTML/text for the weekly digest. Pure — unit-testable. */
export function renderDigestEmail(
  orgName: string,
  report: DigestReport,
): { subject: string; html: string; text: string } {
  const safeOrg = escapeHtml(orgName);
  const subject = `${orgName}: ${report.newThisWeek} new this week`;
  const byType = Object.entries(report.byType)
    .map(([t, n]) => `${t} ${n}`)
    .join(" · ");

  const row = (label: string, value: number) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#71717a">${label}</td><td style="padding:4px 0;font-weight:600;text-align:right">${value}</td></tr>`;

  const html = `
    <div style="font-family:Inter,system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px">
      <h1 style="font-size:20px;margin:0 0 4px">${safeOrg} — weekly digest</h1>
      <p style="color:#71717a;margin:0 0 16px">Your company's memory, this week.</p>
      <table style="border-collapse:collapse;font-size:14px">
        ${row("New this week", report.newThisWeek)}
        ${row("Total nodes", report.totalNodes)}
        ${row("Open knowledge gaps", report.openGaps)}
        ${row("Stale nodes", report.staleNodes)}
      </table>
      ${byType ? `<p style="color:#71717a;font-size:12px;margin:16px 0 0">New by type: ${escapeHtml(byType)}</p>` : ""}
    </div>`.trim();

  const text =
    `${orgName} — weekly digest\n\n` +
    `New this week: ${report.newThisWeek}\n` +
    `Total nodes: ${report.totalNodes}\n` +
    `Open knowledge gaps: ${report.openGaps}\n` +
    `Stale nodes: ${report.staleNodes}\n` +
    (byType ? `\nNew by type: ${byType}\n` : "");

  return { subject, html, text };
}

/** Best-effort weekly digest email to the given recipients. */
export async function sendDigestEmail(
  to: string[],
  orgName: string,
  report: DigestReport,
): Promise<SendResult> {
  if (to.length === 0) return { sent: false, reason: "error", error: "no recipients" };
  const { subject, html, text } = renderDigestEmail(orgName, report);
  return sendEmail({ to, subject, html, text });
}
