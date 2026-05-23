import { useEffect, useRef, useState } from "react";
import { useI18n } from "../lib/i18n";

/** Custom pseudo-waveform audio bar: CSS bars + a hidden <audio>, avoiding the bulky default browser controls. */
export default function AudioPlayer({ src }: { src: string }) {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTime = () => setProgress(a.duration ? a.currentTime / a.duration : 0);
    const onLoaded = () => setDuration(a.duration || 0);
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onLoaded);
    a.addEventListener("ended", onEnd);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onLoaded);
      a.removeEventListener("ended", onEnd);
    };
  }, []);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      setPlaying(false);
    } else {
      a.play();
      setPlaying(true);
    }
  }

  // 28 pseudo-waveform bars derived from a fixed seed so they look rhythmic.
  const bars = Array.from({ length: 28 }, (_, i) => {
    const h = 18 + Math.sin(i * 0.7) * 10 + Math.sin(i * 1.9) * 6;
    return Math.max(6, Math.min(32, h));
  });

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${String(ss).padStart(2, "0")}`;
  }

  return (
    <div className="flex items-center gap-3 select-none">
      <button
        onClick={toggle}
        className="w-9 h-9 rounded-full bg-ink text-paper flex items-center justify-center
                   hover:scale-105 active:scale-95 transition-transform duration-150"
        aria-label={playing ? t("audio.pause") : t("audio.play")}
      >
        {playing ? (
          <span className="block w-2 h-3 border-l-2 border-r-2 border-paper" />
        ) : (
          <span className="block w-0 h-0 border-l-[8px] border-l-paper border-y-[5px] border-y-transparent translate-x-[1px]" />
        )}
      </button>

      <div className="flex items-end gap-[2px] h-8 flex-1">
        {bars.map((h, i) => {
          const active = i / bars.length <= progress;
          return (
            <span
              key={i}
              style={{ height: `${h}px` }}
              className={`w-[3px] rounded-full transition-colors duration-150 ${
                active ? "bg-amber" : "bg-divider"
              }`}
            />
          );
        })}
      </div>

      <span className="mono-time text-xs text-ink-muted">
        {fmt((duration || 0) * progress)} / {fmt(duration || 0)}
      </span>

      <audio ref={audioRef} src={src} preload="metadata" className="hidden" />
    </div>
  );
}
