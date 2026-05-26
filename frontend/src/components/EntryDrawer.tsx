import { useEffect, useState } from "react";
import {
  deleteEntry,
  entryImages,
  getEntry,
  listTags,
  updateEntry,
  type EntryOut,
} from "../api";
import { hhmm, longDate } from "../lib/date";
import { useI18n } from "../lib/i18n";
import AudioPlayer from "./AudioPlayer";
import TagInput from "./TagInput";

/** ISO timestamp → the "YYYY-MM-DDTHH:mm" form a datetime-local input wants. */
function toLocalInput(iso: string): string {
  return iso.slice(0, 16);
}

export default function EntryDrawer({
  entryId,
  entryIds,
  onSelect,
  onClose,
  onDeleted,
  onUpdated,
}: {
  entryId: number | null;
  /** Ordered list of entry ids to navigate through (← / →). */
  entryIds?: number[];
  /** Called when the user navigates to a different entry via prev/next. */
  onSelect?: (id: number) => void;
  onClose: () => void;
  onDeleted?: () => void;
  /** Called after a successful edit so the parent list can refresh. */
  onUpdated?: (entry: EntryOut) => void;
}) {
  const { t, lang } = useI18n();
  const [entry, setEntry] = useState<EntryOut | null>(null);
  const [loading, setLoading] = useState(false);

  // Edit mode: drafts mirror the entry's fields while editing.
  const [editing, setEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftWhen, setDraftWhen] = useState("");
  const [draftTags, setDraftTags] = useState<string[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState(false);

  useEffect(() => {
    if (entryId == null) {
      setEntry(null);
      return;
    }
    setEditing(false);
    setLoading(true);
    setEntry(null);
    getEntry(entryId)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [entryId]);

  function startEdit() {
    if (!entry) return;
    setDraftTitle(entry.title ?? "");
    setDraftBody(entry.body);
    setDraftWhen(toLocalInput(entry.occurred_at));
    setDraftTags(entry.tags);
    setEditError(false);
    setEditing(true);
    // Lazy-load the tag pool for autocomplete the first time anyone edits.
    if (tagSuggestions.length === 0) {
      listTags()
        .then((ts) => setTagSuggestions(ts.map((x) => x.name)))
        .catch(() => {});
    }
  }

  async function handleSave() {
    if (!entry) return;
    setSaving(true);
    setEditError(false);
    try {
      const updated = await updateEntry(entry.id, {
        title: draftTitle.trim() || "",
        body: draftBody,
        occurred_at: draftWhen ? `${draftWhen}:00` : undefined,
        tags: draftTags,
      });
      setEntry(updated);
      setEditing(false);
      onUpdated?.(updated);
    } catch {
      setEditError(true);
    } finally {
      setSaving(false);
    }
  }

  // Favorite is a one-click toggle, available in both view and edit modes.
  async function toggleFavorite() {
    if (!entry) return;
    const next = !entry.favorite;
    setEntry({ ...entry, favorite: next }); // optimistic
    try {
      const updated = await updateEntry(entry.id, { favorite: next });
      setEntry(updated);
      onUpdated?.(updated);
    } catch {
      setEntry({ ...entry, favorite: !next }); // revert on failure
    }
  }

  // Prev/next bounds (current list order; prev = idx-1, next = idx+1).
  const idx =
    entryIds && entryId != null ? entryIds.indexOf(entryId) : -1;
  const prevId = idx > 0 ? entryIds![idx - 1] : null;
  const nextId =
    idx >= 0 && entryIds && idx < entryIds.length - 1
      ? entryIds[idx + 1]
      : null;

  // Esc closes; ← / → step through the list when available.
  useEffect(() => {
    if (entryId == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // While editing, Esc backs out of edit mode rather than closing.
        if (editing) setEditing(false);
        else onClose();
        return;
      }
      // No prev/next navigation while editing — it would discard the draft.
      if (editing) return;
      // Ignore when typing in an input/textarea/contenteditable.
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft" && prevId != null) {
        e.preventDefault();
        onSelect?.(prevId);
      } else if (e.key === "ArrowRight" && nextId != null) {
        e.preventDefault();
        onSelect?.(nextId);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entryId, prevId, nextId, onClose, onSelect, editing]);

  const open = entryId != null;
  const images = entry ? entryImages(entry) : [];

  async function handleDelete() {
    if (!entry) return;
    if (!confirm(t("drawer.confirmDelete"))) return;
    await deleteEntry(entry.id);
    onDeleted?.();
    onClose();
  }

  return (
    <>
      {/* Semi-opaque backdrop */}
      <div
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-ink/20 backdrop-blur-[2px] transition-opacity duration-300 ${
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
        aria-hidden={!open}
      />

      {/* Side drawer */}
      <aside
        className={`fixed top-0 right-0 bottom-0 z-50 w-full sm:w-[520px]
                    bg-surface border-l hairline shadow-hover
                    transform transition-transform duration-300 ease-soft
                    ${open ? "translate-x-0" : "translate-x-full"}`}
        aria-hidden={!open}
      >
        {entry ? (
          <div className="h-full overflow-y-auto">
            {/* Drawer header */}
            <header className="sticky top-0 z-10 bg-surface/85 backdrop-blur px-8 py-4 border-b hairline flex items-center gap-3">
              <span className="mono-time text-xs text-ink-faint">
                {t(`kind.${entry.kind}`)}
              </span>
              <span className="mono-time text-xs text-ink-faint">
                #{entry.id}
              </span>
              <button
                onClick={toggleFavorite}
                className={`text-base leading-none transition-colors duration-200 ${
                  entry.favorite
                    ? "text-amber"
                    : "text-ink-faint hover:text-amber"
                }`}
                aria-label={t(entry.favorite ? "drawer.unfavorite" : "drawer.favorite")}
                title={t(entry.favorite ? "drawer.unfavorite" : "drawer.favorite")}
                aria-pressed={entry.favorite}
              >
                {entry.favorite ? "♥" : "♡"}
              </button>
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => prevId != null && onSelect?.(prevId)}
                  disabled={prevId == null || editing}
                  className="btn-ghost text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={t("drawer.prev")}
                  title={t("drawer.prevTitle")}
                >
                  ←
                </button>
                <button
                  onClick={() => nextId != null && onSelect?.(nextId)}
                  disabled={nextId == null || editing}
                  className="btn-ghost text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={t("drawer.next")}
                  title={t("drawer.nextTitle")}
                >
                  →
                </button>
                <button
                  onClick={onClose}
                  className="btn-ghost text-base ml-1"
                  aria-label={t("drawer.close")}
                >
                  ✕
                </button>
              </div>
            </header>

            {/* Content */}
            <article className="px-8 py-8 animate-fade-in">
              {editing ? (
                <label className="block mb-5">
                  <span className="mono-time text-xs text-ink-faint tracking-wider">
                    {t("drawer.timeLabel")}
                  </span>
                  <input
                    type="datetime-local"
                    value={draftWhen}
                    onChange={(e) => setDraftWhen(e.target.value)}
                    className="mt-1 w-full bg-transparent border hairline rounded-md px-3 py-2 text-sm text-ink focus:outline-none focus:border-amber"
                  />
                </label>
              ) : (
                <div className="mono-time text-xs text-ink-faint tracking-wider mb-3">
                  {longDate(entry.occurred_at, lang)} · {hhmm(entry.occurred_at)}
                </div>
              )}
              {entry.status !== "done" && (
                <div
                  className={`mb-4 text-sm ${
                    entry.status === "error" ? "text-amber" : "text-ink-faint italic"
                  }`}
                >
                  {entry.status === "error"
                    ? t("timeline.failed")
                    : t("timeline.processing")}
                </div>
              )}
              {editing ? (
                <label className="block mb-6">
                  <span className="mono-time text-xs text-ink-faint tracking-wider">
                    {t("drawer.titleLabel")}
                  </span>
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(e) => setDraftTitle(e.target.value)}
                    placeholder={t("drawer.titlePlaceholder")}
                    className="mt-1 w-full bg-transparent border hairline rounded-md px-3 py-2 serif-title text-xl text-ink focus:outline-none focus:border-amber"
                  />
                </label>
              ) : (
                entry.title && (
                  <h2 className="serif-title text-2xl text-ink leading-snug mb-6">
                    {entry.title}
                  </h2>
                )
              )}

              {/* Tags */}
              {editing ? (
                <div className="mb-6">
                  <span className="mono-time text-xs text-ink-faint tracking-wider">
                    {t("drawer.tagsLabel")}
                  </span>
                  <div className="mt-1">
                    <TagInput
                      tags={draftTags}
                      onChange={setDraftTags}
                      suggestions={tagSuggestions}
                    />
                  </div>
                </div>
              ) : (
                entry.tags.length > 0 && (
                  <div className="mb-6 flex flex-wrap gap-1.5">
                    {entry.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-surface2 text-ink-muted px-2.5 py-0.5 text-xs"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )
              )}

              {entry.kind === "image" && images.length > 0 && (
                <div className="mb-6 space-y-3">
                  {images.length > 1 && (
                    <div className="mono-time text-xs text-ink-faint">
                      {t("entry.imageCount", { n: images.length })}
                    </div>
                  )}
                  {images.map((img) => (
                    <a
                      key={img.full}
                      href={img.full}
                      target="_blank"
                      rel="noreferrer"
                      className="block overflow-hidden rounded-lg hairline border"
                    >
                      <img src={img.full} alt="" className="block w-full h-auto" />
                    </a>
                  ))}
                </div>
              )}

              {entry.kind === "audio" && entry.source_url && (
                <div className="mb-6">
                  <AudioPlayer src={entry.source_url} />
                </div>
              )}

              {editing ? (
                <label className="block">
                  <span className="mono-time text-xs text-ink-faint tracking-wider">
                    {t("drawer.bodyLabel")}
                  </span>
                  <textarea
                    value={draftBody}
                    onChange={(e) => setDraftBody(e.target.value)}
                    rows={10}
                    className="mt-1 w-full bg-transparent border hairline rounded-md px-3 py-2 text-[15px] leading-8 text-ink resize-y focus:outline-none focus:border-amber"
                  />
                </label>
              ) : (
                <p className="text-[15px] leading-8 text-ink whitespace-pre-wrap break-words">
                  {entry.body}
                </p>
              )}

              <footer className="mt-12 pt-4 border-t hairline flex items-center justify-between gap-3 text-xs text-ink-faint">
                {editing ? (
                  <>
                    {editError && (
                      <span className="text-amber">{t("drawer.editError")}</span>
                    )}
                    <div className="ml-auto flex items-center gap-3">
                      <button
                        onClick={() => setEditing(false)}
                        disabled={saving}
                        className="hover:text-ink transition-colors duration-200 disabled:opacity-40"
                      >
                        {t("drawer.cancel")}
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={saving || !draftBody.trim()}
                        className="btn-ink text-xs px-4 py-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {saving ? t("drawer.saving") : t("drawer.save")}
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="mono-time">
                      {t("drawer.savedAt", {
                        time: new Date(entry.created_at).toLocaleString(
                          lang === "en" ? "en-US" : "zh-CN",
                        ),
                      })}
                    </span>
                    <div className="flex items-center gap-4">
                      {entry.status === "done" && (
                        <button
                          onClick={startEdit}
                          className="hover:text-ink transition-colors duration-200"
                        >
                          {t("drawer.edit")}
                        </button>
                      )}
                      <button
                        onClick={handleDelete}
                        className="hover:text-amber transition-colors duration-200"
                      >
                        {t("drawer.delete")}
                      </button>
                    </div>
                  </>
                )}
              </footer>
            </article>
          </div>
        ) : loading ? (
          <div className="p-8 text-ink-faint mono-time text-sm animate-pulse-soft">
            {t("drawer.loading")}
          </div>
        ) : null}
      </aside>
    </>
  );
}
