// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { parseSimpleMarkdown } from "./Chat";

const render = (reply: string) => {
  const div = document.createElement("div");
  div.innerHTML = parseSimpleMarkdown(reply);
  return div;
};

const handlerAttrs = (div: HTMLElement) =>
  Array.from(div.querySelectorAll("*")).flatMap((el) =>
    Array.from(el.attributes)
      .map((a) => a.name)
      .filter((n) => n.startsWith("on"))
  );

describe("parseSimpleMarkdown link escaping", () => {
  it.each([
    ['[x](https://a.com/`" onmouseover="alert(1)" x="`)'],
    ["[x](https://a(https://onmouseover=onerror=alert;throw[1]//)"],
    ["[x](/a(https://b/onmouseover=alert(1)//)"],
    ['[x](/a`"onmouseover=alert(1)//`)'],
    ['[x](/a```\n"onmouseover=alert(1)//```)'],
  ])("puts no event handler attribute on any element for %s", (reply) => {
    expect(handlerAttrs(render(reply))).toEqual([]);
  });

  it("keeps an asterisk in a link URL out of emphasis (correctness, not XSS)", () => {
    const div = render("**[x](https://a.com/*y)** *z*");
    const a = div.querySelector("a");
    expect(a?.getAttribute("href")).toBe("https://a.com/*y");
    expect(a?.textContent).toBe("x");
  });

  it.each([
    "https://en.wikipedia.org/wiki/Foo_(bar)",
    "https://example.com/search?a=1&b=two&c=x%20y",
    "https://example.com/path/*/glob?x=*",
    "https://example.com/some_path/__init__.py",
    "mailto:someone@example.com",
  ])("round-trips %s through href unchanged, as a link and as a bare URL", (url) => {
    expect(render(`[x](${url})`).querySelector("a")?.getAttribute("href")).toBe(url);
    if (url.startsWith("http")) {
      expect(render(`see ${url} now`).querySelector("a")?.getAttribute("href")).toBe(url);
    }
  });
});
