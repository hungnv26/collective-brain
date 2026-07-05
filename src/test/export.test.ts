import { describe, expect, test } from "vitest";
import JSZip from "jszip";
import { buildVaultZip } from "@/lib/export/vault";
import type { Node } from "@/lib/types";

function node(partial: Partial<Node>): Node {
  return {
    id: "id",
    org_id: "org",
    space_id: "space",
    type: "fact",
    title: "Untitled",
    slug: "untitled",
    body_md: "",
    frontmatter: {},
    confidence: null,
    status: "reviewed",
    created_by: null,
    source_ref: null,
    created_at: "2026-07-06T00:00:00Z",
    updated_at: "2026-07-06T00:00:00Z",
    ...partial,
  };
}

describe("buildVaultZip", () => {
  test("writes one note per node plus a README, with Obsidian frontmatter", async () => {
    const zip = await JSZip.loadAsync(
      await buildVaultZip(
        [
          node({ title: "Onboarding Pricing", slug: "onboarding-pricing", type: "decision", confidence: "high", body_md: "See [[Onboarding SOP]]." }),
          node({ title: "Onboarding SOP", slug: "onboarding-sop", type: "sop" }),
        ],
        "My Private Brain",
      ),
    );

    expect(zip.file("README.md")).toBeTruthy();
    const pricing = await zip.file("Onboarding Pricing.md")!.async("string");
    expect(pricing).toContain("type: decision");
    expect(pricing).toContain("confidence: high");
    expect(pricing).toContain("aliases:\n  - onboarding-pricing");
    expect(pricing).toContain("# Onboarding Pricing");
    expect(pricing).toContain("[[Onboarding SOP]]"); // wikilinks preserved
  });

  test("de-duplicates colliding filenames", async () => {
    const zip = await JSZip.loadAsync(
      await buildVaultZip(
        [node({ title: "Meeting", slug: "meeting" }), node({ title: "Meeting", slug: "meeting-2" })],
        "Team",
      ),
    );
    expect(zip.file("Meeting.md")).toBeTruthy();
    expect(zip.file("Meeting (2).md")).toBeTruthy();
  });

  test("sanitizes filesystem-hostile titles", async () => {
    const zip = await JSZip.loadAsync(await buildVaultZip([node({ title: "Q3/Q4: Plan?" })], "S"));
    expect(zip.file("Q3-Q4- Plan-.md")).toBeTruthy();
  });
});
