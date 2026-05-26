export type EntryKind = "text" | "image" | "audio";

// Processing lifecycle: queued → (describing|transcribing) → titling → embedding → done | error
export type EntryStatus =
  | "queued"
  | "describing"
  | "transcribing"
  | "titling"
  | "embedding"
  | "done"
  | "error";

export interface EntryOut {
  id: number;
  occurred_at: string;
  created_at: string;
  kind: EntryKind;
  title: string | null;
  body: string;
  source_url: string | null;
  meta: Record<string, unknown> | null;
  status: EntryStatus;
  tags: string[];
  favorite: boolean;
}

/** A resolved image with URLs for its full file and (optional) thumbnail. */
export interface EntryImage {
  full: string;
  thumb: string | null;
}

/**
 * All images attached to an entry, newest model first. An image entry can span
 * several photos (meta.images); older single-image entries (no meta.images)
 * fall back to source_url + meta.thumbnail.
 */
export function entryImages(entry: {
  kind: EntryKind;
  source_url: string | null;
  meta: Record<string, unknown> | null;
}): EntryImage[] {
  const raw = entry.meta?.["images"];
  if (Array.isArray(raw) && raw.length > 0) {
    return raw
      .filter(
        (im): im is { path: string; thumb?: string | null } =>
          !!im && typeof (im as { path?: unknown }).path === "string",
      )
      .map((im) => ({
        full: `/files/${im.path}`,
        thumb: im.thumb ? `/files/${im.thumb}` : null,
      }));
  }
  if (entry.kind === "image" && entry.source_url) {
    const thumb =
      entry.meta && typeof entry.meta["thumbnail"] === "string"
        ? `/files/${entry.meta["thumbnail"]}`
        : null;
    return [{ full: entry.source_url, thumb }];
  }
  return [];
}

export interface TimelineItem {
  id: number;
  occurred_at: string;
  kind: EntryKind;
  title: string | null;
  snippet: string;
  source_url: string | null;
  status: EntryStatus;
  tags: string[];
  favorite: boolean;
}

export interface TagInfo {
  name: string;
  count: number;
}

export interface SearchHit {
  entry: EntryOut;
  score: number;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(path, init);
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new Error(`${resp.status} ${resp.statusText} ${text}`);
  }
  return resp.json();
}

export async function createEntry(form: FormData): Promise<EntryOut> {
  return request<EntryOut>("/api/entries", { method: "POST", body: form });
}

export async function listEntries(
  limit = 10,
  order: "asc" | "desc" = "desc",
): Promise<EntryOut[]> {
  return request<EntryOut[]>(`/api/entries?limit=${limit}&order=${order}`);
}

export async function updateEntry(
  id: number,
  updates: {
    title?: string | null;
    body?: string;
    occurred_at?: string;
    tags?: string[];
    favorite?: boolean;
  },
): Promise<EntryOut> {
  return request<EntryOut>(`/api/entries/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function deleteEntry(id: number): Promise<void> {
  const r = await fetch(`/api/entries/${id}`, { method: "DELETE" });
  if (!r.ok) throw new Error("delete failed");
}

export async function listTimeline(params: {
  from?: string;
  to?: string;
  kind?: EntryKind;
  tag?: string;
  favorite?: boolean;
  limit?: number;
  order?: "asc" | "desc";
}): Promise<TimelineItem[]> {
  const qs = new URLSearchParams();
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.kind) qs.set("kind", params.kind);
  if (params.tag) qs.set("tag", params.tag);
  if (params.favorite) qs.set("favorite", "true");
  if (params.limit) qs.set("limit", String(params.limit));
  if (params.order) qs.set("order", params.order);
  return request<TimelineItem[]>(`/api/timeline?${qs}`);
}

export async function listTags(): Promise<TagInfo[]> {
  return request<TagInfo[]>("/api/tags");
}

export async function getEntry(id: number): Promise<EntryOut> {
  return request<EntryOut>(`/api/entries/${id}`);
}

export async function onThisDay(): Promise<TimelineItem[]> {
  return request<TimelineItem[]>("/api/on-this-day");
}

export async function search(query: string, kind?: EntryKind): Promise<SearchHit[]> {
  const body = { query, top_k: 20, ...(kind ? { kind } : {}) };
  const resp = await request<{ hits: SearchHit[] }>("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return resp.hits;
}

// ───────────────────────── Settings ─────────────────────────

export type Capability = "vision" | "title" | "embed" | "transcribe";

export interface ProviderInfo {
  label: string;
  caps: Capability[];
  api_key_set: boolean;
  models: Record<string, string>;
}

export interface CustomProvider {
  id: string;
  label?: string;
  base_url?: string;
  api_key?: string;
  api_key_set?: boolean;
  text_model?: string;
  vision_model?: string;
  embedding_model?: string;
  embedding_dim?: number;
  transcribe_model?: string;
  caps: Capability[];
}

export interface CatalogItem {
  id: string;
  label: string;
  caps: Capability[];
}

export interface SettingsState {
  ai_provider: string;
  embedding_provider: string;
  transcribe_provider: string;
  providers: Record<string, ProviderInfo>;
  custom_providers: CustomProvider[];
  catalog: CatalogItem[];
  embedding: { locked_dim: number | null; entry_count: number };
}

export interface TestResult {
  ok: boolean;
  detail?: string;
  error?: string;
}

export async function getSettings(): Promise<SettingsState> {
  return request<SettingsState>("/api/settings");
}

export async function updateSettings(
  updates: Record<string, unknown>,
): Promise<SettingsState> {
  return request<SettingsState>("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}

export async function testConnection(): Promise<Record<string, TestResult>> {
  const resp = await request<{ results: Record<string, TestResult> }>(
    "/api/settings/test",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" },
  );
  return resp.results;
}

export async function reindexEmbeddings(
  updates: Record<string, unknown>,
): Promise<{ ok: boolean; dim: number; count: number }> {
  return request("/api/settings/reindex", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
}
