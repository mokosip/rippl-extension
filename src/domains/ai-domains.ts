export interface DomainEntry {
  hostname: string;
  subpath?: string;
  label: string;
}

export const AI_DOMAINS: DomainEntry[] = [
  { hostname: "chatgpt.com", label: "ChatGPT" },
  { hostname: "chat.openai.com", label: "ChatGPT" },
  { hostname: "claude.ai", label: "Claude" },
  { hostname: "gemini.google.com", label: "Gemini" },
  { hostname: "copilot.microsoft.com", label: "Copilot" },
  { hostname: "perplexity.ai", label: "Perplexity" },
  { hostname: "midjourney.com", label: "Midjourney" },
  { hostname: "poe.com", label: "Poe" },
  { hostname: "huggingface.co", subpath: "/chat", label: "HuggingChat" },
  { hostname: "you.com", label: "You.com" },
  { hostname: "github.com", subpath: "/copilot", label: "GitHub Copilot" },
];

function stripWww(hostname: string): string {
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function matchAIDomain(
  url: string,
  customDomains: DomainEntry[] = []
): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const hostname = stripWww(parsed.hostname);
  const allDomains = [...AI_DOMAINS, ...customDomains];

  for (const entry of allDomains) {
    if (hostname === entry.hostname) {
      if (entry.subpath) {
        if (parsed.pathname.startsWith(entry.subpath)) return entry.label;
        continue;
      }
      return entry.label;
    }
  }

  return null;
}
