import { useEffect, useMemo, useState } from "react";
import { listTimeline, type TimelineItem } from "../api";
import EntryDrawer from "../components/EntryDrawer";
import { cnDate, dayKey, hhmm, localIso } from "../lib/date";

type Range = "today" | "week" | "month" | "all";
const RANGES: { key: Range; label: string }[] = [
  { key: "today", label: "今日" },
  { key: "week", label: "本周" },
  { key: "month", label: "本月" },
  { key: "all", label: "全部" },
];

function rangeBounds(r: Range): { from?: string; to?: string } {
  if (r === "all") return {};
  const now = new Date();
  const start = new Date(now);
  if (r === "today") start.setHours(0, 0, 0, 0);
  if (r === "week") start.setDate(now.getDate() - 7);
  if (r === "month") start.setMonth(now.getMonth() - 1);
  return { from: localIso(start), to: localIso(now) };
}

const KIND_GLYPH: Record<string, string> = {
  text: "文",
  image: "影",
  audio: "声",
};

export default function TimelinePage() {
  const [range, setRange] = useState<Range>("week");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listTimeline({
        ...rangeBounds(range),
        order: "desc",
        limit: 2000,
      });
      setItems(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range]);

  // Group entries by day
  const grouped = useMemo(() => {
    const g = new Map<string, TimelineItem[]>();
    for (const it of items) {
      const k = dayKey(it.occurred_at);
      if (!g.has(k)) g.set(k, []);
      g.get(k)!.push(it);
    }
    return Array.from(g.entries());
  }, [items]);

  return (
    <div className="max-w-prose mx-auto px-6 pt-10 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-12 animate-fade-in">
        <h1 className="serif-title text-2xl text-ink">时间之河</h1>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              onClick={() => setRange(r.key)}
              className={`mono-time text-xs px-3 py-1 rounded-full transition-all duration-200 ${
                range === r.key
                  ? "bg-ink text-paper"
                  : "text-ink-muted hover:text-ink hover:bg-surface2"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Status line */}
      <div className="mb-2 text-xs text-ink-faint mono-time">
        {loading ? "汲取中…" : items.length === 0 ? "" : `${items.length} 条记忆`}
      </div>

      {/* ───── Time axis ─────
        A 1px hairline on the left runs the full content height.
        Date nodes are hollow diamonds; entries are filled dots. */}
      <div className="relative pl-12">
        {/* Main axis line */}
        <div
          className="absolute left-[14px] top-3 bottom-3 w-px bg-divider"
          aria-hidden
        />

        {grouped.length === 0 && !loading && (
          <div className="py-24 text-center animate-fade-in">
            <p className="serif-title text-lg text-ink-muted">
              这段时间还没有记忆。
            </p>
            <p className="mt-2 text-sm text-ink-faint">
              去"记录"页留下点什么吧。
            </p>
          </div>
        )}

        {grouped.map(([day, dayItems], gi) => (
          <section
            key={day}
            className="relative mb-10 animate-develop"
            style={{ animationDelay: `${Math.min(gi, 6) * 60}ms` }}
          >
            {/* Date marker: diamond */}
            <div className="relative flex items-baseline gap-3 mb-3">
              <span
                className="absolute -left-12 top-1.5 w-[14px] h-[14px] bg-paper border hairline rotate-45"
                aria-hidden
              />
              <h2 className="serif-title text-base text-ink">{cnDate(day)}</h2>
              <span className="mono-time text-[10px] text-ink-faint">
                {day} · {dayItems.length}
              </span>
            </div>

            {/* Entry list for this day */}
            <ul className="space-y-0.5">
              {dayItems.map((it) => (
                <li key={it.id} className="relative">
                  <button
                    onClick={() => setOpenId(it.id)}
                    className="group w-full flex items-baseline gap-4 py-2 px-2 -mx-2 rounded-md
                               text-left hover:bg-surface2 transition-colors duration-150"
                  >
                    {/* Entry dot */}
                    <span
                      className="absolute -left-[36px] top-[14px] w-[9px] h-[9px] rounded-full
                                 bg-paper border-2 border-ink-faint
                                 group-hover:border-amber group-hover:bg-amber
                                 transition-colors duration-200"
                      aria-hidden
                    />
                    <span className="mono-time text-xs text-ink-faint w-12 flex-shrink-0 pt-0.5">
                      {hhmm(it.occurred_at)}
                    </span>
                    <span className="serif-title text-[15px] text-ink leading-snug flex-1 min-w-0 truncate">
                      {it.title || it.snippet || "—"}
                    </span>
                    <span className="serif-title text-xs text-ink-faint pt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                      {KIND_GLYPH[it.kind]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* Detail drawer */}
      <EntryDrawer
        entryId={openId}
        onClose={() => setOpenId(null)}
        onDeleted={refresh}
      />
    </div>
  );
}
