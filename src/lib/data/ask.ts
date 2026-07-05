import { createClient } from "@/lib/supabase/server";
import type { Conversation, Message } from "@/lib/types";

/** The current user's conversations (RLS: own only), most recent first. */
export async function listConversations(): Promise<Conversation[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(30);
  return (data ?? []) as Conversation[];
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("id, role, content, citations, feedback")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return (data ?? []) as Message[];
}
