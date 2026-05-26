import { useMemo, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

/**
 * Chip-style tag editor. Type and press Enter or comma to add; Backspace on an
 * empty field removes the last chip. Dedupes case-insensitively and offers
 * matching existing tags as suggestions.
 */
export default function TagInput({
  tags,
  onChange,
  suggestions = [],
  placeholder,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const { t } = useI18n();
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addTag(raw: string) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) return;
    const exists = tags.some((x) => x.toLowerCase() === name.toLowerCase());
    if (!exists) onChange([...tags, name]);
    setDraft("");
  }

  function removeTag(idx: number) {
    onChange(tags.filter((_, i) => i !== idx));
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === "Backspace" && !draft && tags.length > 0) {
      removeTag(tags.length - 1);
    }
  }

  // Existing tags that match the draft and aren't already chosen.
  const matches = useMemo(() => {
    const q = draft.trim().toLowerCase();
    const chosen = new Set(tags.map((x) => x.toLowerCase()));
    return suggestions
      .filter(
        (s) => !chosen.has(s.toLowerCase()) && (!q || s.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [draft, suggestions, tags]);

  return (
    <div className="relative">
      <div
        onClick={() => inputRef.current?.focus()}
        className={`flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5 cursor-text
                    transition-colors duration-200 ${focused ? "border-amber" : "hairline"}`}
      >
        {tags.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-surface2 text-ink-muted
                       px-2.5 py-0.5 text-xs"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(i);
              }}
              aria-label={t("tags.remove", { tag })}
              className="text-ink-faint hover:text-amber transition-colors leading-none"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            // Commit a half-typed tag on blur so it isn't silently dropped.
            if (draft.trim()) addTag(draft);
          }}
          placeholder={tags.length === 0 ? (placeholder ?? t("tags.placeholder")) : ""}
          className="flex-1 min-w-[80px] bg-transparent border-0 focus:outline-none
                     text-sm text-ink placeholder:text-ink-faint py-0.5"
        />
      </div>

      {/* Suggestions from existing tags */}
      {focused && matches.length > 0 && (
        <div
          className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-md border hairline
                     bg-surface shadow-soft py-1"
        >
          {matches.map((s) => (
            <button
              key={s}
              type="button"
              // onMouseDown (not onClick) so it fires before the input's blur.
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(s);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm text-ink-muted
                         hover:bg-surface2 hover:text-ink transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
