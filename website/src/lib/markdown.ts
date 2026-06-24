import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Strict, security-hardened markdown -> HTML for long descriptions.
 *
 * Approved subset: bold, italic, inline code, links, paragraphs, line breaks,
 * and bullet/numbered lists. Everything else — images, headings, tables, and
 * crucially any raw HTML in the source — is stripped. Links are restricted to
 * http/https/mailto and forced to rel="nofollow noopener" target="_blank".
 *
 * Runs at build time (no browser DOM); both marked and sanitize-html are pure
 * JS and work server-side. marked's output is NEVER trusted directly —
 * sanitize-html is the authoritative allowlist.
 */

// gfm gives us tables/strikethrough parsing (tables are then stripped by the
// allowlist); breaks maps a single newline to <br> to match "line breaks" in
// the approved subset. async:false guarantees marked.parse returns a string.
marked.setOptions({
  async: false,
  gfm: true,
  breaks: true,
});

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  // The approved subset only. Note the deliberate omissions: no img, no h1-h6,
  // no table/thead/tbody/tr/td — anything marked emits outside this list is
  // dropped.
  allowedTags: ["p", "br", "strong", "em", "b", "i", "code", "a", "ul", "ol", "li"],
  // Only links carry attributes, and only the three we control. Event-handler
  // attributes (onerror, onclick, ...) are absent here, so they are stripped
  // from every surviving tag.
  allowedAttributes: {
    a: ["href", "rel", "target"],
  },
  // Reject javascript:, data:, vbscript:, file:, ... — only these pass.
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesByTag: {
    a: ["http", "https", "mailto"],
  },
  // Block protocol-relative URLs (//evil.example) which can smuggle a scheme.
  allowProtocolRelative: false,
  // Discard disallowed tags; for script-like tags also drop their text content
  // so "<script>alert(1)</script>" leaves nothing visible behind.
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "noscript"],
  // Force safe rel + target on every surviving anchor, overriding any value the
  // source author supplied.
  transformTags: {
    a: sanitizeHtml.simpleTransform("a", {
      rel: "nofollow noopener",
      target: "_blank",
    }),
  },
};

// Inline variant used by list/card teasers, which live inside a clickable card
// <a> and are clamped to a few lines. We keep emphasis but drop the block- and
// link-level tags: discarded tags retain their text content, so list items and
// link labels survive as plain inline text — and crucially no nested <a> is
// emitted inside the surrounding card anchor (invalid HTML). Same security
// posture as the block allowlist: no attributes, script-like tags fully dropped.
const SANITIZE_OPTIONS_INLINE: sanitizeHtml.IOptions = {
  allowedTags: ["strong", "em", "b", "i", "code"],
  allowedAttributes: {},
  disallowedTagsMode: "discard",
  nonTextTags: ["script", "style", "textarea", "noscript"],
};

/**
 * Render a markdown string into a sanitized HTML string safe to inject via
 * Astro's `set:html`. Returns an empty string for empty/nullish input.
 */
export function renderDescription(md: string | null | undefined): string {
  if (!md) return "";
  // marked.parse returns a string because async:false is set above.
  const rawHtml = marked.parse(md) as string;
  return sanitizeHtml(rawHtml, SANITIZE_OPTIONS);
}

/**
 * Like {@link renderDescription} but for inline contexts (card teasers): only
 * emphasis/inline-code tags survive; paragraphs, lists, line breaks and links
 * are flattened to their text content. Returns "" for empty/nullish input.
 */
export function renderDescriptionInline(md: string | null | undefined): string {
  if (!md) return "";
  const rawHtml = marked.parse(md) as string;
  // The inline allowlist discards block/break tags but keeps their text, so
  // adjacent paragraphs or list items would otherwise fuse ("end.Start").
  // Append a space after each such boundary tag before sanitizing so the
  // flattened text keeps word separation; collapse the resulting runs after.
  const spaced = rawHtml.replace(/<\/(p|li|ul|ol|h[1-6]|blockquote)>|<br\s*\/?>/gi, "$& ");
  return sanitizeHtml(spaced, SANITIZE_OPTIONS_INLINE)
    .replace(/\s+/g, " ")
    .trim();
}
