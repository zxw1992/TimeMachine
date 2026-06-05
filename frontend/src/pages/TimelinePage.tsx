import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { listTags, listTimeline, type TagInfo, type TimelineItem } from "../api";
import CalendarHeatmap from "../components/CalendarHeatmap";
import EntryDrawer from "../components/EntryDrawer";
import { dayKey, hhmm, localIso, longDate } from "../lib/date";
import { useI18n } from "../lib/i18n";

type Range = "today" | "week" | "month" | "all";
const RANGES: Range[] = ["today", "week", "month", "all"];

function rangeBounds(r: Range): { from?: string; to?: string } {
  if (r === "all") return {};
  const now = new Date();
  const start = new Date(now);
  if (r === "today") start.setHours(0, 0, 0, 0);
  if (r === "week") start.setDate(now.getDate() - 7);
  if (r === "month") start.setMonth(now.getMonth() - 1);
  return { from: localIso(start), to: localIso(now) };
}

// Dot color by kind — kept inside the warm-paper palette.
const KIND_DOT: Record<string, string> = {
  text: "bg-ink-muted border-ink-muted",
  image: "bg-amber border-amber",
  audio: "bg-amber-soft border-amber-soft",
  link: "bg-paper border-amber",
};

/** Pixel gap above an entry, scaled by minutes since the previous one. */
function gapPx(prevIso: string | null, currIso: string): number {
  if (!prevIso) return 0;
  const dtMin =
    Math.abs(new Date(prevIso).getTime() - new Date(currIso).getTime()) / 60000;
  if (dtMin < 3) return 0;
  // log2(3min)≈1.6 → ~13px, log2(60)≈5.9 → ~47px, log2(720)≈9.5 → ~76px (capped 80)
  return Math.max(0, Math.min(80, Math.round(Math.log2(dtMin) * 8)));
}

export default function TimelinePage() {
  const { t, lang } = useI18n();
  const [range, setRange] = useState<Range>("week");
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [heatmapKey, setHeatmapKey] = useState(0);
  // Filters: favorites-only and a single active tag.
  const [favOnly, setFavOnly] = useState(false);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [allTags, setAllTags] = useState<TagInfo[]>([]);
  const pendingScrollDay = useRef<string | null>(null);
  const pendingFocusId = useRef<number | null>(null);
  const [flashId, setFlashId] = useState<number | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Consume deep-link params on mount, then strip them so they don't re-fire on
  // refresh. ?entry=<id> opens the detail drawer (capture page's Recent list);
  // ?focus=<id> scrolls the axis to that entry and flashes it (search results),
  // switching to "all" so the entry loads no matter how long ago it happened.
  // Build a fresh URLSearchParams rather than mutating the shared one — mutating
  // it races badly under StrictMode's double-invoked effects.
  useEffect(() => {
    const entry = searchParams.get("entry");
    const focus = searchParams.get("focus");
    if (!entry && !focus) return;
    if (entry) setOpenId(Number(entry));
    if (focus) {
      pendingFocusId.current = Number(focus);
      setRange("all");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("entry");
    next.delete("focus");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refresh() {
    setLoading(true);
    try {
      const data = await listTimeline({
        ...rangeBounds(range),
        order: "desc",
        limit: 2000,
        favorite: favOnly,
        ...(tagFilter ? { tag: tagFilter } : {}),
      });
      setItems(data);
      setHeatmapKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, favOnly, tagFilter]);

  // Tag list for the filter dropdown; refreshed alongside the timeline data.
  useEffect(() => {
    listTags()
      .then(setAllTags)
      .catch(() => {});
  }, [heatmapKey]);

  // While anything is still processing, poll so the timeline updates in place.
  useEffect(() => {
    const hasProcessing = items.some(
      (it) => it.status !== "done" && it.status !== "error",
    );
    if (!hasProcessing) return;
    const timer = setInterval(refresh, 2000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // After data loads, scroll to the day requested via heatmap click.
  useEffect(() => {
    if (!pendingScrollDay.current || loading) return;
    const day = pendingScrollDay.current;
    const el = document.getElementById(`day-${day}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingScrollDay.current = null;
    }
  }, [items, loading]);

  // After data loads, scroll to and flash the entry requested via ?focus=<id>.
  useEffect(() => {
    if (pendingFocusId.current == null || loading) return;
    const id = pendingFocusId.current;
    const el = document.getElementById(`entry-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    pendingFocusId.current = null;
    setFlashId(id);
    const timer = setTimeout(() => setFlashId((c) => (c === id ? null : c)), 2200);
    return () => clearTimeout(timer);
  }, [items, loading]);

  function handleHeatmapDayClick(day: string) {
    pendingScrollDay.current = day;
    if (range !== "all") {
      setRange("all"); // triggers refresh; scroll fires in the effect above
    } else {
      const el = document.getElementById(`day-${day}`);
      el?.scrollIntoView({ behavior: "smooth", block: "start" });
      pendingScrollDay.current = null;
    }
  }

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
        <h1 className="serif-title text-2xl text-ink">{t("timeline.title")}</h1>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`mono-time text-xs px-3 py-1 rounded-full transition-all duration-200 ${
                range === r
                  ? "bg-ink text-paper"
                  : "text-ink-muted hover:text-ink hover:bg-surface2"
              }`}
            >
              {t(`timeline.range.${r}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar heatmap — bird's-eye view, independent of the range selector */}
      <CalendarHeatmap
        refreshKey={heatmapKey}
        onDayClick={handleHeatmapDayClick}
      />

      {/* Filter bar: favorites toggle + tag picker */}
      {(allTags.length > 0 || favOnly || tagFilter) && (
        <div className="mb-3 flex items-center gap-2 flex-wrap text-xs">
          <button
            onClick={() => setFavOnly((v) => !v)}
            className={`inline-flex items-center gap-1 px-3 py-1 rounded-full transition-all duration-200 ${
              favOnly
                ? "bg-amber/15 text-amber"
                : "text-ink-muted hover:text-ink hover:bg-surface2"
            }`}
            aria-pressed={favOnly}
          >
            <span>{favOnly ? "♥" : "♡"}</span>
            {t("timeline.filter.favorites")}
          </button>

          {allTags.length > 0 && (
            <select
              value={tagFilter ?? ""}
              onChange={(e) => setTagFilter(e.target.value || null)}
              className={`px-3 py-1 rounded-full bg-transparent border hairline mono-time
                          focus:outline-none focus:border-amber cursor-pointer ${
                            tagFilter ? "text-amber border-amber" : "text-ink-muted"
                          }`}
            >
              <option value="">{t("timeline.filter.allTags")}</option>
              {allTags.map((tg) => (
                <option key={tg.name} value={tg.name}>
                  {tg.name} ({tg.count})
                </option>
              ))}
            </select>
          )}

          {(favOnly || tagFilter) && (
            <button
              onClick={() => {
                setFavOnly(false);
                setTagFilter(null);
              }}
              className="text-ink-faint hover:text-amber transition-colors"
            >
              {t("timeline.filter.clear")}
            </button>
          )}
        </div>
      )}

      {/* Status line */}
      <div className="mb-2 text-xs text-ink-faint mono-time">
        {loading
          ? t("timeline.loading")
          : items.length === 0
            ? ""
            : t("timeline.count", { n: items.length })}
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
              {t("timeline.empty.title")}
            </p>
            <p className="mt-2 text-sm text-ink-faint">
              {t("timeline.empty.hint")}
            </p>
          </div>
        )}

        {grouped.map(([day, dayItems], gi) => (
          <section
            key={day}
            id={`day-${day}`}
            className="relative mb-10 animate-develop scroll-mt-6"
            style={{ animationDelay: `${Math.min(gi, 6) * 60}ms` }}
          >
            {/* Date marker: diamond */}
            <div className="relative flex items-baseline gap-3 mb-3">
              <span
                className="absolute -left-12 top-1.5 w-[14px] h-[14px] bg-paper border hairline rotate-45"
                aria-hidden
              />
              <h2 className="serif-title text-base text-ink">{longDate(day, lang)}</h2>
              <span className="mono-time text-[10px] text-ink-faint">
                {day} · {dayItems.length}
              </span>
            </div>

            {/* Entry list for this day */}
            <ul>
              {dayItems.map((it, ii) => {
                const prev = ii > 0 ? dayItems[ii - 1].occurred_at : null;
                const mt = gapPx(prev, it.occurred_at);
                const processing = it.status !== "done" && it.status !== "error";
                const failed = it.status === "error";
                return (
                  <li
                    key={it.id}
                    id={`entry-${it.id}`}
                    className="relative scroll-mt-20"
                    style={mt > 0 ? { marginTop: `${mt}px` } : undefined}
                  >
                    <button
                      onClick={() => setOpenId(it.id)}
                      className={`group w-full flex items-baseline gap-4 py-2 px-2 -mx-2 rounded-md
                                 text-left transition-colors duration-150 ${
                                   flashId === it.id
                                     ? "bg-amber/15 ring-1 ring-amber/50"
                                     : "hover:bg-surface2"
                                 }`}
                    >
                      {/* Entry dot — color by kind, or pulse while processing */}
                      <span
                        className={`absolute -left-[36px] top-[14px] w-[9px] h-[9px] rounded-full border-2
                                    ${
                                      processing
                                        ? "bg-amber border-amber animate-pulse-soft"
                                        : failed
                                          ? "bg-paper border-ink-faint"
                                          : KIND_DOT[it.kind] ?? "bg-paper border-ink-faint"
                                    }
                                    group-hover:ring-2 group-hover:ring-amber/40 group-hover:ring-offset-1 group-hover:ring-offset-paper
                                    transition-all duration-200`}
                        aria-hidden
                      />
                      <span className="mono-time text-xs text-ink-faint w-12 flex-shrink-0 pt-0.5">
                        {hhmm(it.occurred_at)}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span
                          className={`block serif-title text-[15px] leading-snug truncate ${
                            processing ? "text-ink-faint italic" : failed ? "text-amber" : "text-ink"
                          }`}
                        >
                          {processing
                            ? t("timeline.processing")
                            : failed
                              ? t("timeline.failed")
                              : it.title || it.snippet || "—"}
                        </span>
                        {it.tags.length > 0 && !processing && !failed && (
                          <span className="mt-1 flex flex-wrap gap-1">
                            {it.tags.slice(0, 4).map((tag) => (
                              <span
                                key={tag}
                                className="rounded-full bg-surface2 text-ink-faint px-2 py-px text-[10px] mono-time"
                              >
                                {tag}
                              </span>
                            ))}
                          </span>
                        )}
                      </span>
                      {it.favorite && (
                        <span className="text-amber text-xs pt-0.5" aria-hidden>
                          ♥
                        </span>
                      )}
                      <span className="serif-title text-xs text-ink-faint pt-0.5 opacity-70 group-hover:opacity-100 transition-opacity">
                        {t(`kind.glyph.${it.kind}`)}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Detail drawer */}
      <EntryDrawer
        entryId={openId}
        entryIds={items.map((it) => it.id)}
        onSelect={setOpenId}
        onClose={() => setOpenId(null)}
        onDeleted={refresh}
        onUpdated={refresh}
      />
    </div>
  );
}
