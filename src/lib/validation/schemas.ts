import { z } from "zod";

export const createOrgSchema = z.object({
  name: z.string().trim().min(2, "Name must be at least 2 characters").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers and hyphens only"),
});
export type CreateOrgInput = z.infer<typeof createOrgSchema>;

export const membershipRole = z.enum(["owner", "admin", "lead", "member", "viewer"]);

export const createInviteSchema = z.object({
  orgId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email(),
  role: membershipRole.default("member"),
});
export type CreateInviteInput = z.infer<typeof createInviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(10),
});

/** Turn a display name into a URL-safe slug candidate. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
