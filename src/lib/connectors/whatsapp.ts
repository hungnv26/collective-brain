// WhatsApp has no API for personal/group chats, so the path is the user's own
// "Export chat" .txt, uploaded via Ingest. These pure helpers detect that format
// and clean it (drop system + media-only lines, join multi-line messages) so
// distillation sees plain "Author: message" content.

// Matches a message-start line in both common export formats:
//   iOS      [15/01/2024, 14:30:05] Jane: hi   ·   [2024-01-15, 2:30 PM] Jane: hi
//   Android  15/01/2024, 14:30 - Jane: hi
const START =
  /^\[?\d{1,4}[./-]\d{1,2}[./-]\d{1,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[APap][Mm])?\]?\s*(?:-\s*)?(.*)$/;

const MEDIA_ONLY = /^(<Media omitted>|image omitted|video omitted|audio omitted|sticker omitted|GIF omitted|.*\bomitted\b.*|This message was deleted)$/i;

interface WaMessage {
  author: string;
  text: string;
}

/** True if the text looks like a WhatsApp chat export. */
export function looksLikeWhatsAppExport(text: string): boolean {
  if (/Messages and calls are end-to-end encrypted/i.test(text.slice(0, 4000))) return true;
  const lines = text.split("\n").filter((l) => l.trim()).slice(0, 20);
  if (lines.length === 0) return false;
  const withAuthor = lines.filter((l) => {
    const m = START.exec(l);
    return m && m[1].includes(": ");
  });
  return withAuthor.length >= Math.min(3, lines.length);
}

/** Parse an export into clean "Author: message" text (system/media lines dropped). */
export function parseWhatsAppExport(text: string): string {
  const messages: WaMessage[] = [];
  let current: WaMessage | null = null;

  for (const raw of text.split("\n")) {
    const line = raw.replace(/‎/g, ""); // strip LTR marks WhatsApp injects
    const m = START.exec(line);
    if (m) {
      const rest = m[1];
      const sep = rest.indexOf(": ");
      if (sep === -1) {
        current = null; // system line (encryption notice, "X added Y", ...)
        continue;
      }
      const author = rest.slice(0, sep).trim();
      const body = rest.slice(sep + 2).trim();
      current = { author, text: body };
      messages.push(current);
    } else if (current) {
      current.text += `\n${line}`; // continuation of a multi-line message
    }
  }

  return messages
    .map((msg) => ({ ...msg, text: msg.text.trim() }))
    .filter((msg) => msg.text && !MEDIA_ONLY.test(msg.text))
    .map((msg) => `${msg.author}: ${msg.text}`)
    .join("\n");
}
