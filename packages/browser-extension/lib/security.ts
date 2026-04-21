import type { Step } from "./messaging";

const ALLOWED_SCHEMES = new Set(["https:", "http:"]);

export interface ValidationResult {
  ok: boolean;
  message?: string;
}

export function validateStep(step: Step): ValidationResult {
  switch (step.action) {
    case "navigate": {
      const url = step.value ?? "";
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        return { ok: false, message: "invalid URL" };
      }
      if (!ALLOWED_SCHEMES.has(parsed.protocol)) {
        return { ok: false, message: `scheme not allowed: ${parsed.protocol}` };
      }
      return { ok: true };
    }
    case "click":
    case "hover":
    case "type":
    case "scroll":
    case "waitForPageReady":
    case "goBack":
    case "goForward":
    case "refresh":
    case "switchTab":
      return { ok: true };
    default: {
      const _exhaustive: never = step.action;
      void _exhaustive;
      return { ok: false, message: `unknown action: ${String(step.action)}` };
    }
  }
}

export interface RateLimiter {
  acquire(): Promise<boolean>;
}

export function createRateLimiter(minIntervalMs: number): RateLimiter {
  let last = 0;
  return {
    async acquire() {
      const now = Date.now();
      if (now - last < minIntervalMs) return false;
      last = now;
      return true;
    },
  };
}
