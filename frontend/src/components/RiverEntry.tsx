import { useState } from "react";
import type { EntryOut } from "../api";
import { hhmm } from "../lib/date";
import AudioPlayer from "./AudioPlayer";

const KIND_GLYPH: Record<string, string> = {
  text: "文",
  image: "影",
  audio: "声",
};

export default function RiverEntry({
  entry,
  defaultExpanded = false,
  onDelete,
  score,
}: {
  entry: EntryOut;
  defaultExpanded?: boolean;
  onDelete?: (id: number) => void;
  score?: number;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const thumb =
    entry.meta && typeof entry.meta["thumbnail"] === "string"
      ? `/files/${entry.meta["thumbnail"]}`
      : null;
  const fullImage = entry.kind === "image" && entry.source_url ? entry.source_url : null;

  const previewBody =
    entry.body.length > 140 ? entry.body.slice(0, 140).replace(/\n/g, " ") + "…" : entry.body;

  return (
    <article className="group relative animate-develop">
      {/* Left time column */}
      <div className="grid grid-cols-[72px_1fr] gap-6 py-5 border-t hairline first:border-t-0">
        <div className="pt-1 flex flex-col items-end gap-1">
          <span className="mono-time text-sm text-ink">{hhmm(entry.occurred_at)}</span>
          <span className="serif-title text-xs text-ink-faint">{KIND_GLYPH[entry.kind]}</span>
        </div>

        {/* Body column */}
        <div className="min-w-0">
          {/* Title row */}
          <div className="flex items-baseline gap-3 mb-2">
            {entry.title && (
              <h3 className="serif-title text-lg text-ink leading-snug">{entry.title}</h3>
            )}
            {score !== undefined && (
              <span className="mono-time text-[10px] text-amber whitespace-nowrap">
                · 相似 {(score * 100).toFixed(0)}%
              </span>
            )}
          </div>

          {/* Image: thumbnail → click to expand to full size */}
          {fullImage && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="block mb-3 overflow-hidden rounded-md hairline border
                         hover:opacity-95 transition-opacity"
            >
              <img
                src={expanded ? fullImage : thumb || fullImage}
                alt=""
                className={`block transition-all duration-300 ${
                  expanded ? "max-h-[480px]" : "h-[140px]"
                } w-auto object-cover`}
              />
            </button>
          )}

          {/* Audio bar */}
          {entry.kind === "audio" && entry.source_url && (
            <div className="mb-3">
              <AudioPlayer src={entry.source_url} />
            </div>
          )}

          {/* Body */}
          <p
            className={`text-[15px] leading-7 text-ink-muted whitespace-pre-wrap break-words
                        ${expanded ? "" : "line-clamp-3"}`}
          >
            {expanded ? entry.body : previewBody}
          </p>

          {/* Toolbar */}
          <div className="mt-3 flex items-center gap-4 text-xs text-ink-faint">
            <button
              onClick={() => setExpanded((e) => !e)}
              className="hover:text-amber transition-colors duration-200"
            >
              {expanded ? "收起" : "展开"}
            </button>
            {onDelete && (
              <button
                onClick={() => onDelete(entry.id)}
                className="hover:text-amber transition-colors duration-200
                           opacity-0 group-hover:opacity-100"
              >
                删除
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
