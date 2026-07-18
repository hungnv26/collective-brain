import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { supabaseUnavailable } from "@/lib/supabase/guard";
import { getMembership, getMyOrgs } from "@/lib/data/session";
import { llmTestSchema } from "@/lib/validation/schemas";
import { getProvider } from "@/lib/ai/provider";

interface Check {
  ok: boolean;
  error?: string;
}

/**
 * POST /api/settings/llm/test — dry-run the chosen provider with tiny prompts to
 * confirm the server has its API key and the endpoint works, before an owner/admin
 * commits to it. Runs two checks because the two call patterns can differ on the
 * compat endpoints: a streaming text reply (Ask) and a forced tool call (distill).
 */
export async function POST(request: Request) {
  const unavailable = supabaseUnavailable();
  if (unavailable) return unavailable;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });

  const orgs = await getMyOrgs();
  const selected = (await cookies()).get("cb_org")?.value;
  const org = orgs.find((o) => o.id === selected) ?? orgs[0];
  if (!org) return NextResponse.json({ error: "no org" }, { status: 400 });

  const membership = await getMembership(org.id);
  if (membership?.role !== "owner" && membership?.role !== "admin") {
    return NextResponse.json({ error: "Only owners and admins can test providers." }, { status: 403 });
  }

  const parsed = llmTestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "invalid" }, { status: 422 });
  }
  const { provider: providerId, distillModel, answerModel } = parsed.data;

  const provider = getProvider(providerId);
  if (!provider.isConfigured()) {
    return NextResponse.json(
      { error: `${provider.label} has no API key set on the server. Set it in the environment first.` },
      { status: 400 },
    );
  }

  const msg = (e: unknown) => (e instanceof Error ? e.message : "failed");

  // Streaming text (the Ask path).
  const streaming: Check = await (async () => {
    try {
      const handle = provider.stream({
        model: answerModel,
        system: "You are a connection test.",
        userText: "Reply with the single word: OK",
        maxTokens: 16,
      });
      for await (const _ of handle) void _;
      await handle.finalUsage();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  })();

  // Forced tool call (the distill path) — the part most likely to differ on
  // Anthropic-compat endpoints.
  const structured: Check = await (async () => {
    try {
      const res = await provider.structured<{ ok?: boolean }>({
        model: distillModel,
        system: "You are a connection test.",
        toolName: "ack",
        toolDescription: "Acknowledge the connection test.",
        inputSchema: {
          type: "object",
          additionalProperties: false,
          properties: { ok: { type: "boolean" } },
          required: ["ok"],
        },
        userText: "Call the ack tool with ok set to true.",
        maxTokens: 64,
      });
      if (!res.data) return { ok: false, error: "provider returned no structured tool output" };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: msg(e) };
    }
  })();

  return NextResponse.json({
    provider: providerId,
    label: provider.label,
    streaming,
    structured,
    ok: streaming.ok && structured.ok,
  });
}
