import { db } from "../db/index";

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

/**
 * Match a URL against a provided list of domains.
 * Returns the label of the matched domain, or null.
 */
export function matchURL(url: string, domains: DomainEntry[]): string | null {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;

  const hostname = stripWww(parsed.hostname);

  for (const entry of domains) {
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

/**
 * Legacy function — delegates to matchURL with AI_DOMAINS + custom domains.
 * Kept for backward compatibility (tests use it).
 */
export function matchAIDomain(
  url: string,
  customDomains: DomainEntry[] = []
): string | null {
  const allDomains = [...AI_DOMAINS, ...customDomains];
  return matchURL(url, allDomains);
}

/**
 * Read the user's enabled domains from DB.
 * Falls back to full AI_DOMAINS list if setup hasn't been completed yet.
 */
export async function getEnabledDomains(): Promise<DomainEntry[]> {
  const config = await db.config.get("enabledDomains");
  const customDomains = await db.customDomains.toArray();

  if (config && Array.isArray(config.value)) {
    const enabledBuiltIn = config.value as DomainEntry[];
    const customEntries: DomainEntry[] = customDomains.map((cd) => ({
      hostname: cd.hostname,
      label: cd.label,
    }));
    return [...enabledBuiltIn, ...customEntries];
  }

  // User hasn't completed setup — fall back to full list + any custom domains
  const customEntries: DomainEntry[] = customDomains.map((cd) => ({
    hostname: cd.hostname,
    label: cd.label,
  }));
  return [...AI_DOMAINS, ...customEntries];
}
