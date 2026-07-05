import { SignOutButton } from "./SignOutButton";

export function TopBar({ email }: { email: string }) {
  const initial = email.charAt(0).toUpperCase() || "?";
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-border bg-background px-4">
      <form action="/search" className="relative max-w-xl flex-1">
        <input
          name="q"
          placeholder="Search everything…"
          className="w-full rounded-md border border-border bg-panel px-3 py-1.5 text-sm outline-none focus:border-zinc-400"
        />
        <kbd className="absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border bg-background px-1.5 text-xs text-muted">
          ⌘K
        </kbd>
      </form>
      <div className="flex items-center gap-3">
        <span className="hidden text-sm text-muted sm:inline">{email}</span>
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-sm font-medium text-white dark:bg-white dark:text-zinc-900">
          {initial}
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
