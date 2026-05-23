import { useEffect, useState } from "react";
import { deleteEntry, getEntry, type EntryOut } from "../api";
import { cnDate, hhmm } from "../lib/date";
import AudioPlayer from "./AudioPlayer";

const KIND_LABEL: Record<string, string> = {
  text: "文字",
  image: "影像",
  audio: "声音",
};

export default function EntryDrawer({
  entryId,
  onClose,
  onDeleted,
}: {
  entryId: number | null;
  onClose: () => void;
  onDeleted?: () => void;
}) {
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

  // Close on Esc
  useEffect(() => {
    if (entryId == null) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entryId, onClose]);

  const open = entryId != null;
  const thumb =
    entry?.meta && typeof entry.meta["thumbnail"] === "string"
      ? `/files/${entry.meta["thumbnail"]}`
      : null;

  async function handleDelete() {
    if (!entry) return;
    if (!confirm("确认删除这条记忆？")) return;
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
                {KIND_LABEL[entry.kind]}
              </span>
              <span className="mono-time text-xs text-ink-faint">
                #{entry.id}
              </span>
              <button
                onClick={onClose}
                className="ml-auto btn-ghost text-base"
                aria-label="关闭"
              >
                ✕
              </button>
            </header>

            {/* Content */}
            <article className="px-8 py-8 animate-fade-in">
              <div className="mono-time text-xs text-ink-faint tracking-wider mb-3">
                {cnDate(entry.occurred_at)} · {hhmm(entry.occurred_at)}
              </div>
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
                  写入于 {new Date(entry.created_at).toLocaleString("zh-CN")}
                </span>
                <button
                  onClick={handleDelete}
                  className="hover:text-amber transition-colors duration-200"
                >
                  删除这条记忆
                </button>
              </footer>
            </article>
          </div>
        ) : loading ? (
          <div className="p-8 text-ink-faint mono-time text-sm animate-pulse-soft">
            汲取中…
          </div>
        ) : null}
      </aside>
    </>
  );
}
