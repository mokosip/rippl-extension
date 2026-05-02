import { describe, it, expect } from "vitest";
import { AI_DOMAINS, matchAIDomain, DomainEntry } from "../../src/domains/ai-domains";

describe("AI_DOMAINS list", () => {
  it("has more than 8 entries", () => {
    expect(AI_DOMAINS.length).toBeGreaterThan(8);
  });
});

describe("matchAIDomain — known AI domains", () => {
  it("detects chatgpt.com", () => {
    expect(matchAIDomain("https://chatgpt.com/")).toBe("ChatGPT");
  });

  it("detects chat.openai.com", () => {
    expect(matchAIDomain("https://chat.openai.com/")).toBe("ChatGPT");
  });

  it("detects claude.ai", () => {
    expect(matchAIDomain("https://claude.ai/chat/new")).toBe("Claude");
  });

  it("detects gemini.google.com", () => {
    expect(matchAIDomain("https://gemini.google.com/app")).toBe("Gemini");
  });

  it("detects copilot.microsoft.com", () => {
    expect(matchAIDomain("https://copilot.microsoft.com/")).toBe("Copilot");
  });

  it("detects perplexity.ai", () => {
    expect(matchAIDomain("https://perplexity.ai/search")).toBe("Perplexity");
  });

  it("detects midjourney.com", () => {
    expect(matchAIDomain("https://midjourney.com/home")).toBe("Midjourney");
  });

  it("detects poe.com", () => {
    expect(matchAIDomain("https://poe.com/Claude-3-Opus")).toBe("Poe");
  });

  it("detects huggingface.co/chat", () => {
    expect(matchAIDomain("https://huggingface.co/chat")).toBe("HuggingChat");
  });

  it("detects you.com", () => {
    expect(matchAIDomain("https://you.com/search?q=test")).toBe("You.com");
  });
});

describe("matchAIDomain — www prefix stripping", () => {
  it("detects www.perplexity.ai as perplexity.ai", () => {
    expect(matchAIDomain("https://www.perplexity.ai/search")).toBe("Perplexity");
  });

  it("detects www.chatgpt.com as chatgpt.com", () => {
    expect(matchAIDomain("https://www.chatgpt.com/")).toBe("ChatGPT");
  });

  it("detects www.poe.com as poe.com", () => {
    expect(matchAIDomain("https://www.poe.com/")).toBe("Poe");
  });
});

describe("matchAIDomain — subpath matching", () => {
  it("detects github.com/copilot", () => {
    expect(matchAIDomain("https://github.com/copilot")).toBe("GitHub Copilot");
  });

  it("detects github.com/copilot with trailing path", () => {
    expect(matchAIDomain("https://github.com/copilot/workspace")).toBe("GitHub Copilot");
  });

  it("does NOT match github.com without /copilot path", () => {
    expect(matchAIDomain("https://github.com/")).toBeNull();
  });

  it("does NOT match github.com with unrelated path", () => {
    expect(matchAIDomain("https://github.com/microsoft/vscode")).toBeNull();
  });

  it("does NOT match huggingface.co without /chat path", () => {
    expect(matchAIDomain("https://huggingface.co/models")).toBeNull();
  });
});

describe("matchAIDomain — non-AI domains", () => {
  it("returns null for google.com", () => {
    expect(matchAIDomain("https://google.com/search?q=ai")).toBeNull();
  });

  it("returns null for stackoverflow.com", () => {
    expect(matchAIDomain("https://stackoverflow.com/questions/123")).toBeNull();
  });

  it("returns null for example.com", () => {
    expect(matchAIDomain("https://example.com")).toBeNull();
  });
});

describe("matchAIDomain — special / invalid URLs", () => {
  it("returns null for chrome:// protocol", () => {
    expect(matchAIDomain("chrome://newtab/")).toBeNull();
  });

  it("returns null for about:blank", () => {
    expect(matchAIDomain("about:blank")).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(matchAIDomain("")).toBeNull();
  });

  it("returns null for undefined (passed as empty string)", () => {
    expect(matchAIDomain(undefined as unknown as string)).toBeNull();
  });

  it("returns null for malformed URL", () => {
    expect(matchAIDomain("not a url at all")).toBeNull();
  });
});

describe("matchAIDomain — custom domains", () => {
  const customDomains: DomainEntry[] = [
    { hostname: "myai.internal.corp", label: "CorpAI" },
    { hostname: "llm.example.com", subpath: "/chat", label: "ExampleChat" },
  ];

  it("detects a custom domain", () => {
    expect(matchAIDomain("https://myai.internal.corp/session/1", customDomains)).toBe("CorpAI");
  });

  it("detects a custom domain with subpath", () => {
    expect(matchAIDomain("https://llm.example.com/chat/new", customDomains)).toBe("ExampleChat");
  });

  it("does NOT match custom subpath domain on wrong path", () => {
    expect(matchAIDomain("https://llm.example.com/api/v1", customDomains)).toBeNull();
  });

  it("still detects built-in domains when custom domains are provided", () => {
    expect(matchAIDomain("https://claude.ai/chat", customDomains)).toBe("Claude");
  });

  it("uses empty custom domains by default", () => {
    expect(matchAIDomain("https://chatgpt.com/")).toBe("ChatGPT");
  });
});
