import { useEffect, useState } from "react";
import { deleteEntry, getEntry, type EntryOut } from "../api";
import { hhmm, longDate } from "../lib/date";
import { useI18n } from "../lib/i18n";
import AudioPlayer from "./AudioPlayer";

export default function EntryDrawer({
  entryId,
  entryIds,
  onSelect,
  onClose,
  onDeleted,
}: {
  entryId: number | null;
  /** Ordered list of entry ids to navigate through (← / →). */
  entryIds?: number[];
  /** Called when the user navigates to a different entry via prev/next. */
  onSelect?: (id: number) => void;
  onClose: () => void;
  onDeleted?: () => void;
}) {
  const { t, lang } = useI18n();
  const [entry, setEntry] = useState<EntryOut | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (entryId == null) {
      setEntry(null);
      return;
    }
    setLoading(true);
    setEntry(null);
    getEntry(entryId)
      .then(setEntry)
      .finally(() => setLoading(false));
  }, [entryId]);

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
        onClose();
        return;
      }
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
  }, [entryId, prevId, nextId, onClose, onSelect]);

  const open = entryId != null;
  const thumb =
    entry?.meta && typeof entry.meta["thumbnail"] === "string"
      ? `/files/${entry.meta["thumbnail"]}`
      : null;

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
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => prevId != null && onSelect?.(prevId)}
                  disabled={prevId == null}
                  className="btn-ghost text-sm disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={t("drawer.prev")}
                  title={t("drawer.prevTitle")}
                >
                  ←
                </button>
                <button
                  onClick={() => nextId != null && onSelect?.(nextId)}
                  disabled={nextId == null}
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
              <div className="mono-time text-xs text-ink-faint tracking-wider mb-3">
                {longDate(entry.occurred_at, lang)} · {hhmm(entry.occurred_at)}
              </div>
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
              {entry.title && (
                <h2 className="serif-title text-2xl text-ink leading-snug mb-6">
                  {entry.title}
                </h2>
              )}

              {entry.kind === "image" && entry.source_url && (
                <a
                  href={entry.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="block mb-6 overflow-hidden rounded-lg hairline border"
                >
                  <img
                    src={entry.source_url}
                    alt=""
                    className="block w-full h-auto"
                  />
                </a>
              )}

              {entry.kind === "audio" && entry.source_url && (
                <div className="mb-6">
                  <AudioPlayer src={entry.source_url} />
                </div>
              )}

              <p className="text-[15px] leading-8 text-ink whitespace-pre-wrap break-words">
                {entry.body}
              </p>

              <footer className="mt-12 pt-4 border-t hairline flex items-center justify-between text-xs text-ink-faint">
                <span className="mono-time">
                  {t("drawer.savedAt", {
                    time: new Date(entry.created_at).toLocaleString(
                      lang === "en" ? "en-US" : "zh-CN",
                    ),
                  })}
                </span>
                <button
                  onClick={handleDelete}
                  className="hover:text-amber transition-colors duration-200"
                >
                  {t("drawer.delete")}
                </button>
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
