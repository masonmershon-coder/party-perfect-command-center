const STORAGE_KEY = "pp-connection-sessions";

export function loadLocalConnectionTokens(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((token): token is string => typeof token === "string")
      : [];
  } catch {
    return [];
  }
}

export function saveLocalConnectionToken(token: string) {
  const tokens = loadLocalConnectionTokens();
  if (!tokens.includes(token)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...tokens, token]));
  }
}

export function removeLocalConnectionToken(token: string) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(loadLocalConnectionTokens().filter((entry) => entry !== token)),
  );
}

export function connectionHeaders(): HeadersInit {
  const tokens = loadLocalConnectionTokens();
  if (tokens.length === 0) return {};
  return { "X-PP-Session-Tokens": tokens.join(",") };
}
