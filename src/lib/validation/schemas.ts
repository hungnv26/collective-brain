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

export const nodeType = z.enum([
  "fact",
  "decision",
  "sop",
  "person",
  "client",
  "project",
  "meeting",
  "idea",
]);
export const nodeStatus = z.enum(["draft", "reviewed", "stale", "archived"]);

export const createNodeSchema = z.object({
  spaceId: z.string().uuid(),
  type: nodeType.default("fact"),
  title: z.string().trim().min(1, "Title is required").max(200),
  body: z.string().default(""),
  confidence: z.string().max(20).nullish(),
  status: nodeStatus.default("draft"),
});
export type CreateNodeInput = z.infer<typeof createNodeSchema>;

export const updateNodeSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  body: z.string().optional(),
  confidence: z.string().max(20).nullish(),
  status: nodeStatus.optional(),
});
export type UpdateNodeInput = z.infer<typeof updateNodeSchema>;

/** Turn a display name into a URL-safe slug candidate. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
