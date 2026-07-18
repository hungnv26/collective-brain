"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ProviderId } from "@/lib/ai/provider";

interface ProviderOption {
  id: ProviderId;
  label: string;
}
interface Config {
  provider: ProviderId;
  distillModel: string;
  answerModel: string;
}
interface Override {
  provider: ProviderId | null;
  distillModel: string | null;
  answerModel: string | null;
}
interface Check {
  ok: boolean;
  error?: string;
}
interface TestResult {
  label: string;
  streaming: Check;
  structured: Check;
  ok: boolean;
}

export function LlmSettingsForm({
  providers,
  envDefault,
  initial,
}: {
  providers: ProviderOption[];
  envDefault: Config;
  initial: Override | null;
}) {
  const router = useRouter();
  // "" = platform default (null override).
  const [provider, setProvider] = useState<ProviderId | "">(initial?.provider ?? "");
  const [distillModel, setDistillModel] = useState(initial?.distillModel ?? "");
  const [answerModel, setAnswerModel] = useState(initial?.answerModel ?? "");
  const [busy, setBusy] = useState<"save" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  // The effective provider whose defaults we hint as placeholders.
  const effectiveProvider: ProviderId = provider || envDefault.provider;
  const modelPlaceholder =
    effectiveProvider === envDefault.provider
      ? { distill: envDefault.distillModel, answer: envDefault.answerModel }
      : { distill: "provider default", answer: "provider default" };

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy("save");
    setError(null);
    setSaved(false);
    const res = await fetch("/api/settings/llm", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: provider || null,
        distillModel: distillModel || null,
        answerModel: answerModel || null,
      }),
    });
    setBusy(null);
    if (res.ok) {
      setSaved(true);
      router.refresh();
    } else {
      const { error } = await res.json().catch(() => ({ error: "" }));
      setError(error || "Could not save settings.");
    }
  }

  async function runTest() {
    setBusy("test");
    setError(null);
    setTest(null);
    const res = await fetch("/api/settings/llm/test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        provider: effectiveProvider,
        distillModel: distillModel || modelPlaceholderResolved().distill,
        answerModel: answerModel || modelPlaceholderResolved().answer,
      }),
    });
    setBusy(null);
    const body = await res.json().catch(() => ({}));
    if (res.ok) setTest(body as TestResult);
    else setError((body as { error?: string }).error || "Test failed.");
  }

  // Resolve a concrete model id for the test call (the server needs a non-empty
  // model; blank means "use the env default for the currently active provider").
  function modelPlaceholderResolved() {
    const useEnv = effectiveProvider === envDefault.provider;
    return {
      distill: useEnv ? envDefault.distillModel : "",
      answer: useEnv ? envDefault.answerModel : "",
    };
  }

  return (
    <form onSubmit={save} className="rounded-xl border border-border bg-background p-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="text-xs font-medium text-muted">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderId | "")}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">Platform default ({providerLabelOf(providers, envDefault.provider)})</option>
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Ask model</label>
          <input
            value={answerModel}
            onChange={(e) => setAnswerModel(e.target.value)}
            placeholder={modelPlaceholder.answer}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-zinc-400"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted">Distill model</label>
          <input
            value={distillModel}
            onChange={(e) => setDistillModel(e.target.value)}
            placeholder={modelPlaceholder.distill}
            className="mt-1 w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-zinc-400"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy !== null}
          className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:opacity-90 disabled:opacity-50"
        >
          {busy === "save" ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={runTest}
          disabled={busy !== null}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-panel disabled:opacity-50"
        >
          {busy === "test" ? "Testing…" : "Test connection"}
        </button>
        {saved && <span className="text-xs text-green-600">Saved.</span>}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      {test && (
        <div className="mt-3 rounded-md border border-border bg-panel p-3 text-xs">
          <p className="font-medium">
            {test.label}: {test.ok ? "✓ ready" : "✗ issues found"}
          </p>
          <ul className="mt-1.5 space-y-1">
            <li className={test.streaming.ok ? "text-green-700" : "text-red-600"}>
              {test.streaming.ok ? "✓" : "✗"} Ask (streaming)
              {test.streaming.error ? ` — ${test.streaming.error}` : ""}
            </li>
            <li className={test.structured.ok ? "text-green-700" : "text-red-600"}>
              {test.structured.ok ? "✓" : "✗"} Distill (tool-use)
              {test.structured.error ? ` — ${test.structured.error}` : ""}
            </li>
          </ul>
        </div>
      )}
    </form>
  );
}

function providerLabelOf(providers: ProviderOption[], id: ProviderId): string {
  return providers.find((p) => p.id === id)?.label ?? id;
}
