import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/data/session";
import { AcceptInvite } from "@/components/invites/AcceptInvite";

export const dynamic = "force-dynamic";

/**
 * Invite landing page. Lives outside the (app) group so a brand-new user with
 * no org yet isn't bounced to onboarding before they can accept. The middleware
 * already gates auth (sending logged-out visitors to /login?next=/join…), so a
 * reaching user is signed in; we redeem the token client-side, then head in.
 */
export default async function JoinPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/join?token=${token ?? ""}`)}`);

  if (!token) {
    return (
      <div className="flex flex-1 items-center justify-center bg-panel px-4">
        <div className="w-full max-w-sm rounded-xl border border-border bg-background p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">Invite link incomplete</h1>
          <p className="mt-3 text-sm text-muted">
            This link is missing its token. Ask an admin to resend the invite.
          </p>
          <Link href="/" className="mt-4 inline-block text-sm underline">
            Go to the app
          </Link>
        </div>
      </div>
    );
  }

  return <AcceptInvite token={token} />;
}
