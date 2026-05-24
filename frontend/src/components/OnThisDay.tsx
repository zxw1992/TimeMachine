import { useEffect, useState } from "react";
import { onThisDay, type TimelineItem } from "../api";
import { useI18n } from "../lib/i18n";

// "On this day" — memories from the same month+day in earlier years.
// Renders nothing when there are none, keeping the home page calm.
export default function OnThisDay({
  refreshKey = 0,
  onOpen,
}: {
  refreshKey?: number;
  onOpen: (id: number) => void;
}) {
  const { t } = useI18n();
  const [items, setItems] = useState<TimelineItem[]>([]);

  useEffect(() => {
    onThisDay()
      .then(setItems)
      .catch(() => setItems([]));
  }, [refreshKey]);

  if (items.length === 0) return null;
  const thisYear = new Date().getFullYear();

  return (
    <section className="mt-14 animate-fade-in">
      <div className="flex items-baseline gap-3 mb-4">
        <h2 className="serif-title text-base text-ink">{t("onThisDay.title")}</h2>
        <span className="flex-1 h-px bg-divider" />
      </div>
      <ul className="space-y-2">
        {items.map((it) => {
          const n = thisYear - new Date(it.occurred_at).getFullYear();
          const label = n === 1 ? t("onThisDay.yearAgo") : t("onThisDay.yearsAgo", { n });
          const thumb = it.kind === "image" ? it.source_url : null;
          return (
            <li key={it.id}>
              <button
                onClick={() => onOpen(it.id)}
                className="group w-full flex items-center gap-3 text-left surface-card p-3
                           hover:shadow-hover transition-shadow"
              >
                {thumb && (
                  <img
                    src={thumb}
                    alt=""
                    className="w-12 h-12 rounded object-cover hairline border flex-shrink-0"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="mono-time text-[10px] text-amber mb-0.5">{label}</div>
                  <div className="serif-title text-sm text-ink truncate">
                    {it.title || it.snippet || "—"}
                  </div>
                </div>
                <span className="serif-title text-xs text-ink-faint">
                  {t(`kind.glyph.${it.kind}`)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
