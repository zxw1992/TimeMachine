import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createEntry, getEntry, listEntries } from "../api";
import AudioPlayer from "../components/AudioPlayer";
import EntryDrawer from "../components/EntryDrawer";
import ErrorBanner from "../components/ErrorBanner";
import OnboardingCard from "../components/OnboardingCard";
import OnThisDay from "../components/OnThisDay";
import ProcessingTray, { type Job } from "../components/ProcessingTray";
import { useI18n } from "../lib/i18n";

type Mode = "text" | "image" | "audio";

const isTerminal = (s: string) => s === "done" || s === "error";

const MAX_RECENT = 5;
// Persist the in-progress note so a tab switch / reload doesn't lose it.
const DRAFT_KEY = "aitm-draft-text";

export default function CapturePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("text");
  const [jobs, setJobs] = useState<Job[]>([]);
  const jobsRef = useRef<Job[]>([]);
  jobsRef.current = jobs;
  const handledRef = useRef<Set<number>>(new Set());
  const [openId, setOpenId] = useState<number | null>(null);
  const [memoriesKey, setMemoriesKey] = useState(0);
  const [onboardKey, setOnboardKey] = useState(0);
  const [text, setText] = useState(() => localStorage.getItem(DRAFT_KEY) ?? "");
  const [hint, setHint] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  // Image mode supports a batch: each picked image becomes its own entry.
  const [images, setImages] = useState<File[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [micError, setMicError] = useState<string | null>(null);
  // Optional backdating: when set, overrides the server's "now" timestamp.
  const [showTime, setShowTime] = useState(false);
  const [customTime, setCustomTime] = useState("");

  // Audio recording state
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  // On mount, seed the "Recent" list from the latest entries (any status) so it
  // survives navigating away and back, or a reload — and still shows what was
  // just done, not only what's mid-flight. Anything still processing keeps
  // polling below.
  useEffect(() => {
    listEntries(MAX_RECENT)
      .then((entries) => {
        const recent: Job[] = entries.map((e) => ({
          id: e.id,
          kind: e.kind,
          status: e.status,
          title: e.title,
          error: (e.meta as Record<string, unknown> | null)?.error as string | undefined,
        }));
        setJobs(recent);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Object URLs for the image batch; revoked when the batch changes.
  useEffect(() => {
    const urls = images.map((f) => URL.createObjectURL(f));
    setImagePreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [images]);

  // Keep the draft in localStorage so switching tabs / reloading doesn't lose it.
  useEffect(() => {
    if (text.trim()) localStorage.setItem(DRAFT_KEY, text);
    else localStorage.removeItem(DRAFT_KEY);
  }, [text]);

  // Global paste handler: pasting an image auto-switches to image mode.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const it of items) {
        if (it.kind === "file" && it.type.startsWith("image/")) {
          const f = it.getAsFile();
          if (f) {
            setMode("image");
            setImages((prev) => [...prev, f]);
            e.preventDefault();
            return;
          }
        }
      }
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
        const ext = blob.type.includes("mp4")
          ? ".mp4"
          : blob.type.includes("ogg")
          ? ".ogg"
          : ".webm";
        const f = new File([blob], `rec-${Date.now()}${ext}`, { type: blob.type });
        setFile(f);
        stream.getTracks().forEach((t) => t.stop());
      };
      mr.start();
      recorderRef.current = mr;
      setRecording(true);
      setRecordSec(0);
      recordTimerRef.current = window.setInterval(() => setRecordSec((s) => s + 1), 1000);
    } catch (e: any) {
      setMicError(t("capture.audio.micError", { msg: e.message }));
    }
  }

  function stopRecording() {
    recorderRef.current?.stop();
    setRecording(false);
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
  }

  async function submitCapture() {
    setError(null);
    setSubmitting(true);
    try {
      // datetime-local has minute precision; normalize to seconds.
      const occurredAt = customTime
        ? customTime.length === 16
          ? `${customTime}:00`
          : customTime
        : null;
      const trimmedText = text.trim();
      const trimmedHint = hint.trim();
      // One entry per capture. An image batch attaches all picked files to a
      // single entry (one record can span several photos); audio sends its one
      // file; text sends none.
      const fd = new FormData();
      fd.append("kind", mode);
      if (trimmedText) fd.append("text", trimmedText);
      if (trimmedHint) fd.append("hint", trimmedHint);
      if (occurredAt) fd.append("occurred_at", occurredAt);
      if (mode === "image") {
        for (const f of images) fd.append("files", f);
      } else if (mode === "audio" && file) {
        fd.append("files", file);
      }
      const entry = await createEntry(fd);
      const job: Job = {
        id: entry.id,
        kind: entry.kind,
        status: entry.status,
        title: entry.title,
      };
      setJobs((prev) => [job, ...prev.filter((j) => j.id !== job.id)].slice(0, MAX_RECENT));

      setText("");
      setHint("");
      setFile(null);
      setImages([]);
      setShowTime(false);
      setCustomTime("");
      localStorage.removeItem(DRAFT_KEY);
      setOnboardKey((k) => k + 1); // first capture dismisses the onboarding card
      // Ask once for notification permission so we can alert on completion.
      if (typeof Notification !== "undefined" && Notification.permission === "default") {
        Notification.requestPermission().catch(() => {});
      }
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    submitCapture();
  }

  function dismissJob(id: number) {
    setJobs((prev) => prev.filter((j) => j.id !== id));
  }

  function notifyDone(title: string | null) {
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification(t("brand"), { body: title || t("capture.done.toast") });
    }
  }

  // Poll in-flight jobs until they settle; notify + auto-dismiss when done.
  useEffect(() => {
    const active = jobs.filter((j) => !isTerminal(j.status));
    if (active.length === 0) return;
    const timer = setInterval(async () => {
      const live = jobsRef.current.filter((j) => !isTerminal(j.status));
      const results = await Promise.all(
        live.map(async (j) => {
          try {
            const e = await getEntry(j.id);
            return {
              id: j.id,
              status: e.status,
              title: e.title,
              error: (e.meta as Record<string, unknown> | null)?.error as string | undefined,
            };
          } catch {
            return null;
          }
        }),
      );
      setJobs((prev) =>
        prev.map((j) => {
          const r = results.find((x) => x && x.id === j.id);
          return r ? { ...j, status: r.status, title: r.title ?? j.title, error: r.error } : j;
        }),
      );
      for (const r of results) {
        if (r && isTerminal(r.status) && !handledRef.current.has(r.id)) {
          handledRef.current.add(r.id);
          if (r.status === "done") notifyDone(r.title);
        }
      }
    }, 1200);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs.filter((j) => !isTerminal(j.status)).map((j) => j.id).join(",")]);

  const canSubmit =
    !submitting &&
    ((mode === "text" && text.trim().length > 0) ||
      (mode === "image" && images.length > 0) ||
      (mode === "audio" && file !== null));

  return (
    <div className="max-w-compose mx-auto px-6 pt-10 pb-24 animate-fade-in">
      <h1 className="serif-title text-3xl text-ink mb-2">{t("capture.title")}</h1>
      <p className="text-sm text-ink-faint mb-8">{t("capture.subtitle")}</p>

      <OnboardingCard refreshKey={onboardKey} />

      {/* Mode toggles: minimal ink dots */}
      <div className="flex items-center gap-6 mb-6">
        {(["text", "image", "audio"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setFile(null);
              setImages([]);
            }}
            className={`group flex items-center gap-2 transition-colors duration-200 ${
              mode === m ? "text-ink" : "text-ink-faint hover:text-ink-muted"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
                mode === m ? "bg-amber scale-125" : "bg-ink-faint"
              }`}
            />
            <span className="serif-title text-base">{t(`capture.mode.${m}`)}</span>
          </button>
        ))}
      </div>

      {/* Main compose area: paper-feel card */}
      <form onSubmit={onSubmit} className="surface-card p-6 animate-slide-up">
        {mode === "text" && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("capture.text.placeholder")}
            className="w-full min-h-[180px] bg-transparent border-0 focus:outline-none
                       text-base leading-7 text-ink placeholder:text-ink-faint
                       serif-title resize-none"
          />
        )}

        {mode === "image" && (
          <div>
            {images.length === 0 ? (
              <label
                className="block border border-dashed hairline rounded-lg p-12 text-center cursor-pointer
                           hover:border-amber hover:bg-amber/[0.03] transition-all duration-200"
              >
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) =>
                    setImages((prev) => [...prev, ...Array.from(e.target.files ?? [])])
                  }
                />
                <div className="text-ink-muted mb-2 serif-title">{t("capture.image.drop")}</div>
                <div className="text-xs text-ink-faint">{t("capture.image.paste")}</div>
              </label>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  {imagePreviews.map((src, i) => (
                    <div key={src} className="relative group aspect-square">
                      <img
                        src={src}
                        alt=""
                        className="w-full h-full object-cover rounded-lg hairline border"
                      />
                      <button
                        type="button"
                        onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                        aria-label={t("capture.image.removeOne")}
                        className="absolute top-1 right-1 w-6 h-6 grid place-items-center text-xs rounded-md
                                   bg-paper/80 backdrop-blur text-ink-muted hover:text-amber
                                   opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  {/* Add-more tile */}
                  <label
                    className="aspect-square grid place-items-center border border-dashed hairline rounded-lg
                               cursor-pointer text-ink-faint hover:border-amber hover:text-amber
                               hover:bg-amber/[0.03] transition-all duration-200"
                  >
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) =>
                        setImages((prev) => [...prev, ...Array.from(e.target.files ?? [])])
                      }
                    />
                    <span className="text-2xl leading-none">＋</span>
                  </label>
                </div>
                {images.length > 1 && (
                  <p className="text-xs text-ink-faint">
                    {t("capture.image.batchHint", { n: images.length })}
                  </p>
                )}
                <input
                  value={hint}
                  onChange={(e) => setHint(e.target.value)}
                  placeholder={t("capture.image.hint")}
                  className="input-clean w-full py-2 text-sm text-ink placeholder:text-ink-faint"
                />
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("capture.image.note")}
                  className="w-full bg-transparent border-0 focus:outline-none resize-none
                             text-sm leading-6 text-ink placeholder:text-ink-faint min-h-[60px]"
                />
              </div>
            )}
          </div>
        )}

        {mode === "audio" && (
          <div className="space-y-4">
            <div className="flex items-center gap-4 justify-center py-6">
              {!recording ? (
                <button
                  type="button"
                  onClick={startRecording}
                  className="w-16 h-16 rounded-full bg-amber text-paper text-2xl
                             hover:scale-105 active:scale-95 transition-transform duration-150
                             shadow-soft"
                  aria-label={t("capture.audio.start")}
                >
                  ●
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopRecording}
                  className="w-16 h-16 rounded-full bg-ink text-paper text-2xl
                             animate-pulse-soft shadow-hover"
                  aria-label={t("capture.audio.stop")}
                >
                  ■
                </button>
              )}
              <div className="mono-time text-2xl text-ink-muted tabular-nums">
                {Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, "0")}
              </div>
            </div>
            {file && filePreview && <AudioPlayer src={filePreview} />}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("capture.audio.note")}
              className="w-full bg-transparent border-t hairline pt-3 border-0 focus:outline-none
                         text-sm leading-6 text-ink placeholder:text-ink-faint min-h-[60px] resize-none"
            />
          </div>
        )}

        {micError && <div className="mt-3 text-sm text-amber">{micError}</div>}
        {error != null && <ErrorBanner error={error} onRetry={submitCapture} />}

        <div className="mt-4 text-xs">
          {!showTime ? (
            <button
              type="button"
              onClick={() => setShowTime(true)}
              className="text-ink-faint hover:text-amber transition-colors"
            >
              {t("capture.customTime.toggle")}
            </button>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-ink-faint">{t("capture.customTime.label")}</span>
              <input
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="input-clean text-xs text-ink py-1"
              />
              <button
                type="button"
                onClick={() => {
                  setShowTime(false);
                  setCustomTime("");
                }}
                className="text-ink-faint hover:text-amber transition-colors"
              >
                {t("capture.customTime.clear")}
              </button>
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between border-t hairline pt-4">
          <div className="text-xs text-ink-faint">
            {submitting ? (
              <span className="animate-pulse-soft">{t("capture.submitting")}</span>
            ) : (
              t("capture.footerHint")
            )}
          </div>
          <button type="submit" disabled={!canSubmit} className="btn-ink disabled:opacity-30">
            {t("capture.submit")}
          </button>
        </div>
      </form>

      <ProcessingTray
        jobs={jobs}
        onDismiss={dismissJob}
        onOpen={(id) => navigate(`/timeline?entry=${id}`)}
      />

      <OnThisDay refreshKey={memoriesKey} onOpen={setOpenId} />

      <EntryDrawer
        entryId={openId}
        onClose={() => setOpenId(null)}
        onDeleted={() => setMemoriesKey((k) => k + 1)}
      />
    </div>
  );
}
