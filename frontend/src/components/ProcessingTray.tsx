import type { EntryKind, EntryStatus } from "../api";
import { useI18n } from "../lib/i18n";

export interface Job {
  id: number;
  kind: EntryKind;
  status: EntryStatus;
  title: string | null;
  error?: string;
}

const STEPS: Record<EntryKind, EntryStatus[]> = {
  text: ["titling", "embedding"],
  image: ["describing", "titling", "embedding"],
  audio: ["transcribing", "titling", "embedding"],
};

// Linear order used to decide which steps are already past.
const ORDER: EntryStatus[] = [
  "queued",
  "describing",
  "transcribing",
  "titling",
  "embedding",
  "done",
];

function stepState(step: EntryStatus, status: EntryStatus): "done" | "active" | "pending" {
  if (status === "done") return "done";
  const si = ORDER.indexOf(step);
  const ci = ORDER.indexOf(status);
  if (ci > si) return "done";
  if (ci === si) return "active";
  return "pending";
}

export default function ProcessingTray({
  jobs,
  onDismiss,
  onOpen,
}: {
  jobs: Job[];
  onDismiss: (id: number) => void;
  onOpen: (id: number) => void;
}) {
  const { t } = useI18n();
  if (jobs.length === 0) return null;

  return (
    <div className="mt-8">
      <div className="flex items-baseline gap-3 mb-3">
        <h2 className="serif-title text-base text-ink">{t("capture.recent")}</h2>
        <span className="flex-1 h-px bg-divider" />
      </div>
      <div className="space-y-3">
      {jobs.map((job) => {
        const failed = job.status === "error";
        const done = job.status === "done";
        return (
          <div
            key={job.id}
            onClick={() => onOpen(job.id)}
            className="surface-card p-4 animate-slide-up flex items-start gap-3
                       cursor-pointer hover:shadow-hover transition-shadow"
          >
            <span className="text-sm pt-0.5">
              {done ? "✓" : failed ? "⚠" : <span className="inline-block animate-pulse-soft">●</span>}
            </span>
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2 mb-2">
                <span className="serif-title text-sm text-ink truncate">
                  {done
                    ? job.title || t("capture.done.toast")
                    : failed
                      ? t("capture.stage.error")
                      : t("capture.processing")}
                </span>
                {done && (
                  <span className="mono-time text-[10px] text-amber">
                    {t("capture.done.toast")}
                  </span>
                )}
              </div>

              {failed ? (
                <p className="text-xs text-amber break-words">{job.error}</p>
              ) : (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {STEPS[job.kind].map((step, i) => {
                    const s = stepState(step, job.status);
                    return (
                      <span key={step} className="flex items-center gap-1.5">
                        {i > 0 && <span className="text-ink-faint text-[10px]">→</span>}
                        <span
                          className={`mono-time text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                            s === "done"
                              ? "text-ink bg-surface2"
                              : s === "active"
                                ? "text-paper bg-amber animate-pulse-soft"
                                : "text-ink-faint"
                          }`}
                        >
                          {t(`capture.stage.${step}`)}
                        </span>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>

            {(done || failed) && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss(job.id);
                }}
                className="text-xs text-ink-faint hover:text-amber transition-colors"
              >
                {t("capture.dismiss")}
              </button>
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
}
