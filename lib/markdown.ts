// lib/markdown.ts

/**
 * Escape HTML special characters so raw model output can't inject markup.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Only allow safe URL schemes in links; anything else becomes an inert anchor.
 */
function sanitizeUrl(url: string): string {
  const trimmed = url.trim();
  if (/^(https?:\/\/|mailto:|tel:|\/|#|\.\/|\.\.\/)/i.test(trimmed)) {
    return trimmed;
  }
  return "#";
}

/**
 * Inline markdown (links, emphasis) for a single, already HTML-escaped line.
 */
function parseInlineMarkdown(text: string, anchors: string[]): string {
  const open = (url: string) => {
    anchors.push(`<a href="${sanitizeUrl(url)}" target="_blank" rel="noopener noreferrer">`);
    return `\u0000A${anchors.length - 1}\u0000`;
  };
  return text
    // Markdown links: [text](url) with an optional "title"
    .replace(
      /\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+&quot;.*?&quot;)?\)/g,
      (_m, label, url) => `${open(url)}${label}</a>`
    )
    // Bare URLs
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+)/g, (_m, pre, url) => `${pre}${open(url)}${url}</a>`)
    // Bold
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^_]+)__/g, "<strong>$1</strong>")
    // Italic
    .replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
}

/**
 * Simple markdown-to-HTML converter for common patterns. Code is extracted
 * first so its contents are never treated as markdown, the remaining text is
 * HTML-escaped, and block-level constructs (headings, lists) are parsed line
 * by line before inline markdown is applied.
 */
export function parseSimpleMarkdown(text: string): string {
  const codeBlocks: string[] = [];
  const anchors: string[] = [];
  let src = text.replace(/\u0000/g, "").replace(
    /```(\w*)\n?([\s\S]*?)```/g,
    (_m, _lang, code) => {
      codeBlocks.push(`<pre><code>${escapeHtml(code)}</code></pre>`);
      return `\u0000CODE${codeBlocks.length - 1}\u0000`;
    }
  );

  const inlineCodes: string[] = [];
  src = src.replace(/`([^`]+)`/g, (_m, code) => {
    inlineCodes.push(`<code>${escapeHtml(code)}</code>`);
    return `\u0000ICODE${inlineCodes.length - 1}\u0000`;
  });

  src = escapeHtml(src);

  const out: string[] = [];
  let listType: "ul" | "ol" | null = null;
  const closeList = () => {
    if (listType) {
      out.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const line of src.split("\n")) {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    const ulItem = line.match(/^\s*[-*+]\s+(.*)$/);
    const olItem = line.match(/^\s*\d+\.\s+(.*)$/);

    if (heading) {
      closeList();
      const level = heading[1].length;
      out.push(`<h${level}>${parseInlineMarkdown(heading[2], anchors)}</h${level}>`);
    } else if (ulItem) {
      if (listType !== "ul") {
        closeList();
        out.push("<ul>");
        listType = "ul";
      }
      out.push(`<li>${parseInlineMarkdown(ulItem[1], anchors)}</li>`);
    } else if (olItem) {
      if (listType !== "ol") {
        closeList();
        out.push("<ol>");
        listType = "ol";
      }
      out.push(`<li>${parseInlineMarkdown(olItem[1], anchors)}</li>`);
    } else if (line.trim() === "") {
      closeList();
      out.push("");
    } else if (/^\u0000CODE\d+\u0000$/.test(line)) {
      // A fenced code-block placeholder on its own line; leave it untouched.
      closeList();
      out.push(line);
    } else {
      closeList();
      out.push(`${parseInlineMarkdown(line, anchors)}<br />`);
    }
  }
  closeList();

  let html = out.join("\n");
  html = html.replace(/\u0000ICODE(\d+)\u0000/g, (_m, i) => inlineCodes[+i]);
  html = html.replace(/\u0000CODE(\d+)\u0000/g, (_m, i) => codeBlocks[+i]);
  html = html.replace(/\u0000A(\d+)\u0000/g, (_m, i) => anchors[+i]);
  return html;
}
