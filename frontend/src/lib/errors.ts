// Maps raw backend / network error strings into friendly, actionable messages.
//
// Errors reach the UI from two places:
//   1. HTTP failures — `request()` throws `"<status> <statusText> <body>"`.
//   2. Background processing — a failed entry stores `meta.error` as
//      `"<ExceptionType>: <message>"` (e.g. "RuntimeError: OPENAI_API_KEY is empty").
// Both are unstructured text, so we pattern-match rather than parse.

export interface FriendlyError {
  /** i18n key for the human-facing message. */
  key: string;
  /** Interpolation vars for the message. */
  vars?: Record<string, string | number>;
  /** Whether retrying the same action could plausibly succeed. */
  retriable: boolean;
  /** A config problem the user fixes in Settings (key missing / invalid). */
  configFix: boolean;
}

// Backend raises "<PREFIX>_API_KEY is empty"; map the prefix to a readable name.
const PROVIDER_LABEL: Record<string, string> = {
  OPENAI: "OpenAI",
  ANTHROPIC: "Claude",
  GEMINI: "Gemini",
  DASHSCOPE: "Bailian",
};

export function classifyError(raw: unknown): FriendlyError {
  const msg = raw instanceof Error ? raw.message : String(raw ?? "");
  const lower = msg.toLowerCase();

  // Network: fetch rejects with TypeError ("Failed to fetch" / "Load failed").
  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("load failed") ||
    lower.includes("err_connection")
  ) {
    return { key: "error.network", retriable: true, configFix: false };
  }

  // Missing API key — a configuration problem, retrying won't help.
  const keyMatch = msg.match(/([A-Z]+)_API_KEY is empty/);
  if (keyMatch) {
    return {
      key: "error.noKey",
      vars: { provider: PROVIDER_LABEL[keyMatch[1]] ?? keyMatch[1] },
      retriable: false,
      configFix: true,
    };
  }
  if (lower.includes("missing base_url")) {
    return { key: "error.customConfig", retriable: false, configFix: true };
  }

  // Auth / permission — wrong or region-mismatched key.
  if (
    /\b401\b/.test(msg) ||
    /\b403\b/.test(msg) ||
    lower.includes("authenticationerror") ||
    lower.includes("permissiondenied") ||
    lower.includes("unauthorized")
  ) {
    return { key: "error.auth", retriable: false, configFix: true };
  }

  if (/\b429\b/.test(msg) || lower.includes("rate limit") || lower.includes("ratelimit")) {
    return { key: "error.rateLimit", retriable: true, configFix: false };
  }

  if (lower.includes("timeout") || lower.includes("timed out")) {
    return { key: "error.timeout", retriable: true, configFix: false };
  }

  if (/\b5\d\d\b/.test(msg)) {
    return { key: "error.server", retriable: true, configFix: false };
  }

  // Unknown — surface the raw text (trimmed) so nothing is silently swallowed.
  return {
    key: "error.generic",
    vars: { msg: msg.slice(0, 200) || "unknown" },
    retriable: true,
    configFix: false,
  };
}
