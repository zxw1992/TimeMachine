import { useEffect, useMemo, useState } from "react";
import { listTimeline } from "../api";
import { dayKey, localIso } from "../lib/date";

const MONTHS_TO_SHOW = 3;
const CN_MONTH = [
  "一", "二", "三", "四", "五", "六",
  "七", "八", "九", "十", "十一", "十二",
];
// Monday-first weekday labels
const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

interface MonthCell {
  day: string;     // "YYYY-MM-DD", empty when out-of-month
  dom: number;
  count: number;
  inMonth: boolean;
}

interface Props {
  /** Bump this from parent to trigger a re-fetch (e.g. after entries change). */
  refreshKey?: number;
  /** Fires when user clicks a day cell that has at least one entry. */
  onDayClick?: (day: string) => void;
}

const pad = (n: number) => String(n).padStart(2, "0");

function fmtKey(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** Band a count into one of 5 intensity levels. */
function band(count: number): { bg: string; text: string } {
  if (count === 0) return { bg: "bg-surface2/50", text: "text-transparent" };
  if (count === 1) return { bg: "bg-amber/20", text: "text-ink" };
  if (count <= 3) return { bg: "bg-amber/45", text: "text-ink" };
  if (count <= 6) return { bg: "bg-amber/70", text: "text-paper" };
  return { bg: "bg-amber/95", text: "text-paper" };
}

function monthGrid(
  year: number,
  month: number,
  counts: Map<string, number>,
): MonthCell[] {
  const first = new Date(year, month, 1);
  // JS getDay: 0=Sun..6=Sat → convert to 0=Mon..6=Sun
  const firstWeekday = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: MonthCell[] = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push({ day: "", dom: 0, count: 0, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const k = fmtKey(year, month, d);
    cells.push({ day: k, dom: d, count: counts.get(k) ?? 0, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    cells.push({ day: "", dom: 0, count: 0, inMonth: false });
  }
  return cells;
}

export default function CalendarHeatmap({ refreshKey = 0, onDayClick }: Props) {
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const now = new Date();
    const from = new Date(
      now.getFullYear(),
      now.getMonth() - (MONTHS_TO_SHOW - 1),
      1,
    );
    const to = new Date(
      now.getFullYear(),
      now.getMonth() + 1,
      0,
      23, 59, 59,
    );
    let cancelled = false;
    listTimeline({
      from: localIso(from),
      to: localIso(to),
      limit: 2000,
      order: "desc",
    })
      .then((items) => {
        if (cancelled) return;
        const m = new Map<string, number>();
        for (const it of items) {
          const k = dayKey(it.occurred_at);
          m.set(k, (m.get(k) ?? 0) + 1);
        }
        setCounts(m);
      })
      .catch(() => {
        /* silent — heatmap is supplementary */
      });
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const months = useMemo(() => {
    const now = new Date();
    const list: { year: number; month: number }[] = [];
    for (let i = MONTHS_TO_SHOW - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      list.push({ year: d.getFullYear(), month: d.getMonth() });
    }
    return list;
  }, []);

  const todayKey = useMemo(() => {
    const n = new Date();
    return fmtKey(n.getFullYear(), n.getMonth(), n.getDate());
  }, []);

  const total = useMemo(() => {
    let t = 0;
    counts.forEach((v) => (t += v));
    return t;
  }, [counts]);

  return (
    <div className="mb-8 animate-fade-in">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="serif-title text-sm text-ink-muted">
          月度鸟瞰
          <span className="ml-2 mono-time text-[10px] text-ink-faint">
            近 {MONTHS_TO_SHOW} 个月 · {total} 条
          </span>
        </h2>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mono-time text-[10px] text-ink-faint hover:text-ink transition-colors"
        >
          {collapsed ? "展开" : "收起"}
        </button>
      </div>

      {!collapsed && (
        <div className="grid grid-cols-3 gap-3">
          {months.map(({ year, month }) => {
            const cells = monthGrid(year, month, counts);
            return (
              <div key={`${year}-${month}`} className="select-none">
                <div className="mono-time text-[10px] text-ink-faint mb-1.5 text-center">
                  {year}·{CN_MONTH[month]}月
                </div>
                <div className="grid grid-cols-7 gap-[2px] mb-1">
                  {WEEKDAYS.map((w) => (
                    <div
                      key={w}
                      className="serif-title text-[9px] text-ink-faint text-center"
                    >
                      {w}
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-[2px]">
                  {cells.map((c, idx) => {
                    if (!c.inMonth) {
                      return <div key={idx} className="aspect-square" />;
                    }
                    const { bg, text } = band(c.count);
                    const isToday = c.day === todayKey;
                    const clickable = c.count > 0;
                    const title =
                      `${c.day} · ${c.count > 0 ? `${c.count} 条记忆` : "无记录"}`;
                    return (
                      <button
                        key={idx}
                        onClick={() => clickable && onDayClick?.(c.day)}
                        disabled={!clickable}
                        title={title}
                        aria-label={title}
                        className={`aspect-square rounded-[3px] ${bg} flex items-center justify-center
                                    mono-time text-[10px] leading-none ${text}
                                    transition-all duration-150
                                    ${clickable ? "hover:scale-110 hover:ring-1 hover:ring-amber cursor-pointer" : "cursor-default"}
                                    ${isToday ? "ring-1 ring-ink" : ""}`}
                      >
                        {c.count > 0 ? c.count : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
