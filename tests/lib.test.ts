import { describe, it, expect } from "vitest";
import { createSSEParser } from "@/lib/sse";
import { isBalancedFence, stripMarkdown } from "@/lib/markdown";
import { estimateTokens } from "@/lib/estimateTokens";
import { compressMessages, getContextBudget } from "@/lib/compressContext";
import { checkRateLimit } from "@/lib/ratelimit";

describe("createSSEParser", () => {
  const collect = () => {
    const out: string[] = [];
    const parser = createSSEParser((d) => out.push(d));
    return { out, parser };
  };

  it("parses single-line data events", () => {
    const { out, parser } = collect();
    parser.push('data: {"a":1}\n\n');
    parser.flush();
    expect(out).toEqual(['{"a":1}']);
  });

  it("handles CRLF line endings", () => {
    const { out, parser } = collect();
    parser.push("data: hello\r\n\r\n");
    parser.flush();
    expect(out).toEqual(["hello"]);
  });

  it("handles `data:` with no space", () => {
    const { out, parser } = collect();
    parser.push('data:{"a":1}\n\n');
    parser.flush();
    expect(out).toEqual(['{"a":1}']);
  });

  it("buffers partial lines split across chunks", () => {
    const { out, parser } = collect();
    parser.push('data: {"tok":"hel');
    parser.push('lo"}\n\ndata: {"tok":"wor');
    parser.push('ld"}\n\n');
    parser.flush();
    expect(out).toEqual(['{"tok":"hello"}', '{"tok":"world"}']);
  });

  it("ignores non-data lines (SSE comments)", () => {
    const { out, parser } = collect();
    parser.push(": keep-alive\n\n");
    parser.flush();
    expect(out).toEqual([]);
  });

  it("flush emits a trailing partial line", () => {
    const { out, parser } = collect();
    parser.push("data: tail");
    parser.flush();
    expect(out).toEqual(["tail"]);
  });

  it("emits multiple events from one chunk", () => {
    const { out, parser } = collect();
    parser.push("data: 1\ndata: 2\ndata: 3\n\n");
    parser.flush();
    expect(out).toEqual(["1", "2", "3"]);
  });
});

describe("isBalancedFence", () => {
  it("balanced when there are no fences", () => {
    expect(isBalancedFence("hello world")).toBe(true);
  });

  it("counts complete fenced blocks", () => {
    expect(isBalancedFence("```js\ncode\n```")).toBe(true);
  });

  it("counts indented fences too", () => {
    expect(isBalancedFence("text\n  ```\n  code\n  ```")).toBe(true);
  });

  it("unclosed fence is unbalanced", () => {
    expect(isBalancedFence("```js\ncode")).toBe(false);
  });

  it("inline backticks don't count", () => {
    expect(isBalancedFence("use `code` inline")).toBe(true);
  });
});

describe("stripMarkdown", () => {
  it("strips bold, italic, headings, links", () => {
    const out = stripMarkdown("**bold** *it*\n# Head\n[link](x.com)");
    expect(out).toBe("bold it\nHead\nlink");
  });

  it("keeps code block content but removes fences", () => {
    const out = stripMarkdown("```js\nconst x = 1;\n```");
    expect(out).toContain("const x = 1;");
    expect(out).not.toContain("```");
  });

  it("removes html tags", () => {
    expect(stripMarkdown("<b>x</b>")).toBe("x");
  });
});

describe("estimateTokens", () => {
  it("empty string is zero", () => {
    expect(estimateTokens("")).toBe(0);
  });

  it("estimates ~4 chars per token", () => {
    expect(estimateTokens("a".repeat(400))).toBe(100);
    expect(estimateTokens("a".repeat(401))).toBe(101);
  });

  it("rounds up partial tokens", () => {
    expect(estimateTokens("hello")).toBe(2);
    expect(estimateTokens("hello world")).toBe(3);
  });
});

describe("compressMessages", () => {
  const msg = (role: string, content: string) => ({ role, content });

  it("returns original array when under budget", () => {
    const msgs = [msg("user", "a".repeat(400))];
    expect(compressMessages(msgs, 1000)).toBe(msgs);
  });

  it("keeps first pair + recent within budget", () => {
    const msgs = [
      msg("user", "a".repeat(400)),
      msg("assistant", "a".repeat(400)),
      msg("user", "b".repeat(400)),
      msg("assistant", "b".repeat(400)),
      msg("user", "c".repeat(400)),
      msg("assistant", "c".repeat(400)),
    ];
    const out = compressMessages(msgs, 400);
    expect(out.length).toBeLessThan(msgs.length);
    expect(out[0].content.startsWith("a")).toBe(true); // anchor kept
    expect(out[out.length - 1].content.startsWith("c")).toBe(true); // newest kept
    expect(out.some((m) => m.content.includes("trimmed"))).toBe(true); // note injected
  });

  it("handles empty input", () => {
    expect(compressMessages([], 100)).toEqual([]);
  });
});

describe("getContextBudget", () => {
  it("known model direct match", () => {
    expect(getContextBudget("gpt-4o")).toBe(Math.floor(128000 * 0.8));
  });

  it("prefix matching for dated variants", () => {
    expect(getContextBudget("gpt-4.1-2025-04-14")).toBe(
      Math.floor(1047576 * 0.8),
    );
  });

  it("unknown model falls back conservatively", () => {
    expect(getContextBudget("llama3.1:8b")).toBe(Math.floor(8192 * 0.8));
  });
});

describe("checkRateLimit", () => {
  it("allows requests under the limit", () => {
    const ip = `test-${Math.random()}`;
    for (let i = 0; i < 20; i++) {
      expect(checkRateLimit(ip).allowed).toBe(true);
    }
  });

  it("blocks requests over the limit", () => {
    const ip = `test-${Math.random()}`;
    for (let i = 0; i < 20; i++) checkRateLimit(ip);
    expect(checkRateLimit(ip).allowed).toBe(false);
  });

  it("tracks different IPs independently", () => {
    const a = `test-${Math.random()}`;
    const b = `test-${Math.random()}`;
    for (let i = 0; i < 20; i++) checkRateLimit(a);
    expect(checkRateLimit(b).allowed).toBe(true);
  });
});
