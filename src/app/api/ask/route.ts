import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMyOrgs } from "@/lib/data/session";
import { retrieve } from "@/lib/retrieval/retrieve";
import { answerStream, citedSources, isAnswererConfigured } from "@/lib/ask/answer";
import { askSchema } from "@/lib/validation/schemas";
import { monthToDateTokens, monthlyTokenCap, overCap, recordUsage } from "@/lib/usage/meter";

export const maxDuration = 60;

/** POST /api/ask — retrieve, then stream a cited answer as SSE. */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;
  if (!isAnswererConfigured()) {
    return NextResponse.json({ error: "Ask needs ANTHROPIC_API_KEY set." }, { status: 503 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const parsed = askSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }
  const { question } = parsed.data;

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  if (!org) return NextResponse.json({ error: "no org" }, { status: 400 });

  // Enforce the monthly token cap before spending on an answer.
  if (overCap(await monthToDateTokens(supabase, org.id))) {
    return NextResponse.json(
      { error: `Monthly usage cap reached (${monthlyTokenCap().toLocaleString()} tokens).` },
      { status: 429 },
    );
  }

  // Ensure a conversation, then record the user's turn.
  let conversationId = parsed.data.conversationId;
  if (!conversationId) {
    const { data: conv, error } = await supabase
      .from("conversations")
      .insert({ org_id: org.id, user_id: user.id, title: question.slice(0, 60) })
      .select("id")
      .single();
    if (error || !conv) return NextResponse.json({ error: "could not start conversation" }, { status: 400 });
    conversationId = (conv as { id: string }).id;
  }
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    org_id: org.id,
    role: "user",
    content: question,
  });

  const { sources, context } = await retrieve(supabase, org.id, question);
  const client = new Anthropic();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      try {
        send({ type: "meta", conversationId, sources });

        let full = "";
        const claude = answerStream(client, question, context);
        for await (const event of claude) {
          if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
            full += event.delta.text;
            send({ type: "delta", text: event.delta.text });
          }
        }

        // Record token usage (best-effort) from the completed message.
        const finalMsg = await claude.finalMessage();
        await recordUsage(supabase, {
          orgId: org.id,
          userId: user.id,
          kind: "ask",
          usage: {
            model: finalMsg.model,
            inputTokens: finalMsg.usage.input_tokens,
            outputTokens: finalMsg.usage.output_tokens,
          },
        });

        const cited = citedSources(full, sources);
        const answered = cited.length > 0;
        const citations = cited.map((c) => ({ n: c.n, node_id: c.id, title: c.title }));

        const { data: msg } = await supabase
          .from("messages")
          .insert({
            conversation_id: conversationId,
            org_id: org.id,
            role: "assistant",
            content: full,
            citations,
          })
          .select("id")
          .single();

        await supabase.from("questions_log").insert({
          org_id: org.id,
          user_id: user.id,
          question,
          answered,
        });
        await supabase.from("conversations").update({ updated_at: new Date().toISOString() }).eq("id", conversationId);

        send({ type: "done", messageId: (msg as { id: string } | null)?.id, answered, citations });
      } catch (err) {
        send({ type: "error", error: err instanceof Error ? err.message : "Ask failed" });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
