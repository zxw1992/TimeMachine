import { useEffect, useState } from "react";
import {
  generateReport,
  getReport,
  type ReportKind,
  type ReportOverview,
  type ReportStats,
} from "../api";
import SafeSvg from "../components/SafeSvg";
import { useI18n } from "../lib/i18n";

const KINDS: ReportKind[] = ["week", "month"];

export default function ReviewPage() {
  const { t, lang } = useI18n();
  const [kind, setKind] = useState<ReportKind>("week");
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<ReportOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setErr(null);
    getReport(kind, offset)
      .then((d) => alive && setData(d))
      .catch(() => alive && setErr(t("review.loadError")))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, offset]);

  async function generate() {
    setGenerating(true);
    setErr(null);
    try {
      setData(await generateReport(kind, offset));
    } catch {
      setErr(t("review.genError"));
    } finally {
      setGenerating(false);
    }
  }

  function switchKind(k: ReportKind) {
    setKind(k);
    setOffset(0);
  }

  const stats = data?.stats;
  const report = data?.report ?? null;
  const empty = !!data && stats!.count === 0;

  return (
    <div className="max-w-prose mx-auto px-6 pt-10 pb-24">
      {/* Header + week/month toggle */}
      <div className="flex items-center justify-between mb-8 animate-fade-in">
        <h1 className="serif-title text-2xl text-ink">{t("review.title")}</h1>
        <div className="flex items-center gap-1">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => switchKind(k)}
              className={`mono-time text-xs px-3 py-1 rounded-full transition-all duration-200 ${
                kind === k
                  ? "bg-ink text-paper"
                  : "text-ink-muted hover:text-ink hover:bg-surface2"
              }`}
            >
              {t(`review.kind.${k}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Period navigator */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={() => setOffset((o) => o + 1)}
          className="btn-ghost text-sm"
          aria-label={t("review.prev")}
        >
          ‹
        </button>
        <div className="text-center">
          <div className="serif-title text-base text-ink">
            {data ? periodLabel(data, lang) : "…"}
          </div>
          {offset <= 1 && (
            <div className="mono-time text-[10px] text-ink-faint mt-0.5">
              {t(`review.rel.${kind}.${offset}`)}
            </div>
          )}
        </div>
        <button
          onClick={() => setOffset((o) => Math.max(0, o - 1))}
          disabled={offset === 0}
          className="btn-ghost text-sm disabled:opacity-30 disabled:cursor-not-allowed"
          aria-label={t("review.next")}
        >
          ›
        </button>
      </div>

      {loading && (
        <div className="py-20 text-center text-ink-faint mono-time text-sm animate-pulse-soft">
          {t("review.loading")}
        </div>
      )}

      {!loading && empty && (
        <div className="py-20 text-center animate-fade-in">
          <p className="serif-title text-lg text-ink-muted">{t("review.empty.title")}</p>
          <p className="mt-2 text-sm text-ink-faint">{t("review.empty.hint")}</p>
        </div>
      )}

      {!loading && !empty && stats && (
        <div className="space-y-8 animate-fade-in">
          {/* Hero: AI poster if generated, else a warm summary banner */}
          {report?.payload.poster_svg ? (
            <div className="overflow-hidden rounded-xl hairline border shadow-soft">
              <SafeSvg svg={report.payload.poster_svg} className="w-full [&>svg]:block [&>svg]:w-full [&>svg]:h-auto" />
            </div>
          ) : (
            <div className="rounded-xl border hairline bg-gradient-to-br from-amber/10 to-surface2 px-8 py-10 text-center">
              <div className="serif-title text-4xl text-ink">{stats.count}</div>
              <div className="mono-time text-xs text-ink-faint mt-1">
                {t("review.memories")}
              </div>
            </div>
          )}

          {/* AI review body */}
          {report ? (
            <article className="space-y-5">
              {report.payload.headline && (
                <h2 className="serif-title text-2xl text-ink leading-snug">
                  {report.payload.headline}
                </h2>
              )}
              {report.payload.narrative && (
                <div className="text-[15px] leading-8 text-ink whitespace-pre-wrap">
                  {report.payload.narrative}
                </div>
              )}
              {report.payload.highlight && (
                <blockquote className="border-l-2 border-amber pl-4 text-ink-muted italic">
                  {report.payload.highlight}
                </blockquote>
              )}
              {report.payload.themes.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {report.payload.themes.map((th) => (
                    <span
                      key={th}
                      className="rounded-full bg-surface2 text-ink-muted px-3 py-0.5 text-xs"
                    >
                      {th}
                    </span>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-4 text-xs text-ink-faint pt-1">
                <span className="mono-time">
                  {t("review.generatedAt", {
                    time: new Date(report.generated_at + "Z").toLocaleString(
                      lang === "en" ? "en-US" : "zh-CN",
                    ),
                  })}
                </span>
                <button
                  onClick={generate}
                  disabled={generating}
                  className="hover:text-amber transition-colors disabled:opacity-40"
                >
                  {generating ? t("review.generating") : t("review.regenerate")}
                </button>
              </div>
            </article>
          ) : (
            <div className="rounded-xl border hairline surface-card p-6 text-center">
              <p className="text-sm text-ink-muted mb-4">{t("review.cta")}</p>
              <button
                onClick={generate}
                disabled={generating}
                className="btn-ink disabled:opacity-50"
              >
                {generating ? t("review.generating") : t("review.generate")}
              </button>
              {generating && (
                <p className="mt-3 mono-time text-xs text-ink-faint animate-pulse-soft">
                  {t("review.generatingHint")}
                </p>
              )}
            </div>
          )}

          {err && <p className="text-sm text-amber text-center">{err}</p>}

          {/* Visualizations from real data */}
          <Stats stats={stats} t={t} />
        </div>
      )}
    </div>
  );
}

function Stats({
  stats,
  t,
}: {
  stats: ReportStats;
  t: (k: string, v?: Record<string, string | number>) => string;
}) {
  const maxDay = Math.max(1, ...stats.daily.map((d) => d.count));
  const maxTag = Math.max(1, ...stats.top_tags.map((x) => x.count));
  return (
    <section className="border-t hairline pt-6 space-y-6">
      {/* Kind breakdown */}
      <div className="flex flex-wrap gap-x-6 gap-y-1 mono-time text-xs text-ink-muted">
        <span>{t("review.stat.total", { n: stats.count })}</span>
        <span>{t("review.stat.text", { n: stats.by_kind.text })}</span>
        <span>{t("review.stat.image", { n: stats.by_kind.image })}</span>
        <span>{t("review.stat.audio", { n: stats.by_kind.audio })}</span>
        {stats.favorites > 0 && (
          <span className="text-amber">♥ {stats.favorites}</span>
        )}
      </div>

      {/* Daily activity bars */}
      <div>
        <div className="mono-time text-[10px] text-ink-faint mb-2">
          {t("review.daily")}
        </div>
        <div className="flex items-end gap-[3px] h-20 border-b hairline">
          {stats.daily.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.count}`}
              className="flex-1 min-w-[2px] rounded-t bg-amber/60 hover:bg-amber transition-colors"
              style={{ height: d.count ? `${Math.max(6, (d.count / maxDay) * 100)}%` : "0" }}
            />
          ))}
        </div>
      </div>

      {/* Top tags cloud */}
      {stats.top_tags.length > 0 && (
        <div>
          <div className="mono-time text-[10px] text-ink-faint mb-2">
            {t("review.topTags")}
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-baseline">
            {stats.top_tags.map((tg) => (
              <span
                key={tg.name}
                className="text-ink-muted leading-tight"
                style={{ fontSize: `${12 + Math.round((tg.count / maxTag) * 10)}px` }}
              >
                {tg.name}
                <span className="text-ink-faint text-[10px] ml-0.5">{tg.count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function periodLabel(d: ReportOverview, lang: string): string {
  const start = new Date(d.period_start);
  const end = new Date(d.period_end);
  if (d.kind === "month") {
    return start.toLocaleDateString(lang === "en" ? "en-US" : "zh-CN", {
      year: "numeric",
      month: "long",
    });
  }
  // Week: show start .. end-1 day.
  const last = new Date(end.getTime() - 86400000);
  const fmt = (x: Date) =>
    x.toLocaleDateString(lang === "en" ? "en-US" : "zh-CN", {
      month: "short",
      day: "numeric",
    });
  return `${fmt(start)} – ${fmt(last)}`;
}
