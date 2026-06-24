import { describe, it, expect } from "vitest";
import { renderDescription, renderDescriptionInline } from "./markdown.ts";

describe("renderDescription — approved subset renders", () => {
  it("renders bold", () => {
    expect(renderDescription("**bold**")).toContain("<strong>bold</strong>");
  });

  it("renders italic", () => {
    expect(renderDescription("*italic*")).toContain("<em>italic</em>");
  });

  it("renders inline code", () => {
    expect(renderDescription("`code`")).toContain("<code>code</code>");
  });

  it("wraps prose in a paragraph", () => {
    expect(renderDescription("hello")).toContain("<p>hello</p>");
  });

  it("turns a single newline into a line break", () => {
    expect(renderDescription("a\nb")).toContain("<br");
  });

  it("renders a bullet list", () => {
    const html = renderDescription("- one\n- two");
    expect(html).toContain("<ul>");
    expect(html.match(/<li>/g)).toHaveLength(2);
  });

  it("renders a numbered list", () => {
    const html = renderDescription("1. one\n2. two");
    expect(html).toContain("<ol>");
    expect(html).toContain("<li>");
  });

  it("renders a link with forced rel and target", () => {
    const html = renderDescription("[Android](https://play.google.com/x)");
    expect(html).toContain('href="https://play.google.com/x"');
    expect(html).toContain('rel="nofollow noopener"');
    expect(html).toContain('target="_blank"');
  });

  it("allows mailto links", () => {
    expect(renderDescription("[mail](mailto:a@b.com)")).toContain(
      'href="mailto:a@b.com"',
    );
  });
});

describe("renderDescription — security hardening", () => {
  it("overwrites author-supplied rel", () => {
    const html = renderDescription('<a href="https://x.com" rel="dofollow">x</a>');
    expect(html).toContain('rel="nofollow noopener"');
    expect(html).not.toContain("dofollow");
  });

  it("strips raw <script> including its text content", () => {
    const html = renderDescription("<script>alert(1)</script>hi");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("hi");
  });

  it("strips <img onerror>", () => {
    const html = renderDescription('<img src=x onerror=alert(1)>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert");
  });

  it("rejects javascript: URLs but keeps the anchor text", () => {
    const html = renderDescription("[x](javascript:alert(1))");
    expect(html).not.toContain("href");
    expect(html).not.toContain("javascript:");
    expect(html).toContain("x");
  });

  it("rejects data: URLs", () => {
    const html = renderDescription("[x](data:text/html,<script>1)");
    expect(html).not.toContain("data:");
  });

  it("rejects protocol-relative URLs", () => {
    const html = renderDescription('<a href="//evil.example">x</a>');
    expect(html).not.toContain('href="//evil.example"');
  });

  it("drops event-handler attributes on allowed tags", () => {
    const html = renderDescription('<a href="https://x" onclick="evil()">x</a>');
    expect(html).not.toContain("onclick");
  });

  it("strips markdown images", () => {
    expect(renderDescription("![alt](https://x/i.png)")).not.toContain("<img");
  });

  it("strips headings (no <h*> tag)", () => {
    const html = renderDescription("# Heading");
    expect(html).not.toMatch(/<h[1-6]/);
  });

  it("strips GFM tables", () => {
    const html = renderDescription("| a | b |\n| - | - |\n| 1 | 2 |");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("<td");
  });
});

describe("renderDescription — empty input", () => {
  it("returns empty string for empty/nullish input", () => {
    expect(renderDescription("")).toBe("");
    expect(renderDescription(null)).toBe("");
    expect(renderDescription(undefined)).toBe("");
  });
});

describe("renderDescriptionInline — emphasis renders, blocks flatten", () => {
  it("renders bold", () => {
    expect(renderDescriptionInline("**bold**")).toContain("<strong>bold</strong>");
  });

  it("renders italic", () => {
    expect(renderDescriptionInline("*italic*")).toContain("<em>italic</em>");
  });

  it("renders inline code", () => {
    expect(renderDescriptionInline("`code`")).toContain("<code>code</code>");
  });

  it("does not wrap prose in a paragraph", () => {
    const html = renderDescriptionInline("hello");
    expect(html).not.toContain("<p>");
    expect(html).toContain("hello");
  });

  it("flattens a link to plain text (no anchor, no href)", () => {
    const html = renderDescriptionInline("[Android](https://play.google.com/x)");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("href");
    expect(html).toContain("Android");
  });

  it("flattens a bullet list, keeping item text", () => {
    const html = renderDescriptionInline("- one\n- two");
    expect(html).not.toContain("<ul>");
    expect(html).not.toContain("<li>");
    expect(html).toContain("one");
    expect(html).toContain("two");
  });

  it("keeps word separation across flattened block boundaries", () => {
    // Two paragraphs must not fuse into "end.Start" once <p> tags are dropped.
    expect(renderDescriptionInline("end.\n\nStart")).toBe("end. Start");
  });
});

describe("renderDescriptionInline — security hardening", () => {
  it("strips raw <script> including its text content", () => {
    const html = renderDescriptionInline("<script>alert(1)</script>hi");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(1)");
    expect(html).toContain("hi");
  });

  it("strips <img onerror>", () => {
    const html = renderDescriptionInline('<img src=x onerror=alert(1)>');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("alert");
  });

  it("returns empty string for empty/nullish input", () => {
    expect(renderDescriptionInline("")).toBe("");
    expect(renderDescriptionInline(null)).toBe("");
    expect(renderDescriptionInline(undefined)).toBe("");
  });
});
