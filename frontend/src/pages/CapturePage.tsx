import { useEffect, useRef, useState } from "react";
import { createEntry } from "../api";
import { useI18n } from "../lib/i18n";

type Mode = "text" | "image" | "audio";

export default function CapturePage() {
  const { t } = useI18n();
  const [mode, setMode] = useState<Mode>("text");
  const [text, setText] = useState("");
  const [hint, setHint] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio recording state
  const [recording, setRecording] = useState(false);
  const [recordSec, setRecordSec] = useState(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!file) {
      setFilePreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setFilePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

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
            setFile(f);
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
      setError(t("capture.audio.micError", { msg: e.message }));
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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("kind", mode);
      if (text.trim()) fd.append("text", text.trim());
      if (hint.trim()) fd.append("hint", hint.trim());
      if ((mode === "image" || mode === "audio") && file) fd.append("file", file);
      await createEntry(fd);
      setText("");
      setHint("");
      setFile(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    !submitting &&
    ((mode === "text" && text.trim().length > 0) || (mode !== "text" && file !== null));

  return (
    <div className="max-w-compose mx-auto px-6 pt-10 pb-24 animate-fade-in">
      <h1 className="serif-title text-3xl text-ink mb-2">{t("capture.title")}</h1>
      <p className="text-sm text-ink-faint mb-8">{t("capture.subtitle")}</p>

      {/* Mode toggles: minimal ink dots */}
      <div className="flex items-center gap-6 mb-6">
        {(["text", "image", "audio"] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setFile(null);
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
            {!filePreview ? (
              <label
                className="block border border-dashed hairline rounded-lg p-12 text-center cursor-pointer
                           hover:border-amber hover:bg-amber/[0.03] transition-all duration-200"
              >
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
                <div className="text-ink-muted mb-2 serif-title">{t("capture.image.drop")}</div>
                <div className="text-xs text-ink-faint">{t("capture.image.paste")}</div>
              </label>
            ) : (
              <div className="space-y-3">
                <div className="relative group">
                  <img
                    src={filePreview}
                    alt=""
                    className="max-h-[320px] rounded-lg hairline border mx-auto"
                  />
                  <button
                    type="button"
                    onClick={() => setFile(null)}
                    className="absolute top-2 right-2 px-2 py-1 text-xs rounded-md
                               bg-paper/80 backdrop-blur text-ink-muted hover:text-amber
                               opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    {t("capture.image.replace")}
                  </button>
                </div>
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
            {file && filePreview && (
              <audio controls src={filePreview} className="w-full" />
            )}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t("capture.audio.note")}
              className="w-full bg-transparent border-t hairline pt-3 border-0 focus:outline-none
                         text-sm leading-6 text-ink placeholder:text-ink-faint min-h-[60px] resize-none"
            />
          </div>
        )}

        {error && <div className="mt-3 text-sm text-amber">{error}</div>}

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
    </div>
  );
}
