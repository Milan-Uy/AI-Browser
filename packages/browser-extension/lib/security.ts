import type { LLMAction } from "./messaging";

const ALLOWED_SCHEMES = new Set(["https:", "http:"]);
const FORBIDDEN_SELECTOR_PATTERNS = [
  /chrome-extension:\/\//i,
  /chrome:\/\//i,
  /^iframe\[src\^="https?:\/\/[^"]+"\]/i,
];

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateAction(action: LLMAction): ValidationResult {
  switch (action.kind) {
    case "navigate": {
      let parsed: URL;
      try {
        parsed = new URL(action.url);
      } catch {
        return { ok: false, message: "invalid URL" };
      }
      if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        return { ok: false, message: `scheme not allowed: ${parsed.protocol}` };
      }
      return { ok: true };
    }
    case "click":
    case "fill":
    case "select":
    case "scroll": {
      const sel = "selector" in action ? action.selector : undefined;
      if (sel) {
        for (const pat of FORBIDDEN_SELECTOR_PATTERNS) {
          if (pat.test(sel)) return { ok: false, message: `selector blocked: ${sel}` };
        }
      }
      return { ok: true };
    }
    default:
      return { ok: true };
  }
}

export interface RateLimiter {
  acquire(): Promise<boolean>;
}

export function createRateLimiter(minIntervalMs: number): RateLimiter {
  let last = 0;
  return {
    async acquire() {
      const elapsed = Date.now() - last;
      if (elapsed < minIntervalMs) {
        await new Promise((r) => setTimeout(r, minIntervalMs - elapsed));
      }
      last = Date.now();
      return true;
    },
  };
}

export function isNoopNavigation(targetUrl: string, currentUrl: string): boolean {
  let t: URL, c: URL;
  try {
    t = new URL(targetUrl);
    c = new URL(currentUrl);
  } catch {
    return false;
  }
  if (t.origin !== c.origin) return false;
  const norm = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);
  if (norm(t.pathname) !== norm(c.pathname)) return false;
  if (t.search && t.search !== c.search) return false;
  return true;
}
