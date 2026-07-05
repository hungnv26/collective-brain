import { describe, expect, test } from "vitest";
import { parseWikilinks, renderWikilinksToMarkdown, slugifyRef } from "@/lib/nodes/wikilinks";

describe("parseWikilinks", () => {
  test("extracts slugs and labels, incl. [[target|label]]", () => {
    const links = parseWikilinks("See [[Onboarding SOP]] and [[pricing-2024|the pricing doc]].");
    expect(links).toEqual([
      { raw: "[[Onboarding SOP]]", slug: "onboarding-sop", label: "Onboarding SOP" },
      { raw: "[[pricing-2024|the pricing doc]]", slug: "pricing-2024", label: "the pricing doc" },
    ]);
  });

  test("ignores empty refs and dedupes nothing (caller decides)", () => {
    expect(parseWikilinks("no links here")).toEqual([]);
    expect(parseWikilinks("[[ ]]")).toEqual([]);
  });
});

describe("slugifyRef", () => {
  test("matches the DB slug normalisation", () => {
    expect(slugifyRef("Quarterly Revenue!")).toBe("quarterly-revenue");
    expect(slugifyRef("  Already-Slugged  ")).toBe("already-slugged");
  });
});

describe("renderWikilinksToMarkdown", () => {
  const resolve = (slug: string) => (slug === "onboarding-sop" ? { id: "abc-123" } : null);

  test("resolved links become internal node links", () => {
    expect(renderWikilinksToMarkdown("go [[Onboarding SOP]]", resolve)).toBe(
      "go [Onboarding SOP](/nodes/abc-123)",
    );
  });

  test("unresolved links stay literal", () => {
    expect(renderWikilinksToMarkdown("[[Missing Thing]]", resolve)).toBe("[[Missing Thing]]");
  });
});
