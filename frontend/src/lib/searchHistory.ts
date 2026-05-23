// Search history persisted in localStorage (never touches the database).
const KEY = "tm.searchHistory";
export const HISTORY_MAX = 15;

export function loadHistory(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    if (!Array.isArray(arr)) return [];
    return arr.filter((x): x is string => typeof x === "string").slice(0, HISTORY_MAX);
  } catch {
    return [];
  }
}

function save(list: string[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, HISTORY_MAX)));
  } catch {
    /* quota exceeded or storage disabled — history is best-effort */
  }
}

/** Push a query to the front, dedupe, cap at HISTORY_MAX. Returns the new list. */
export function addHistory(query: string): string[] {
  const q = query.trim();
  if (!q) return loadHistory();
  const next = [q, ...loadHistory().filter((x) => x !== q)].slice(0, HISTORY_MAX);
  save(next);
  return next;
}

export function removeHistory(query: string): string[] {
  const next = loadHistory().filter((x) => x !== query);
  save(next);
  return next;
}

export function clearHistory(): string[] {
  save([]);
  return [];
}
