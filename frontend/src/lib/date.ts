const CN_NUM = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
const CN_WEEK = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

function cnNum(n: number): string {
  if (n <= 10) return CN_NUM[n];
  if (n < 20) return "十" + (n === 10 ? "" : CN_NUM[n - 10]);
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return CN_NUM[tens] + "十" + (ones === 0 ? "" : CN_NUM[ones]);
  }
  return String(n);
}

const CN_MONTH = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "十一", "十二"];

import type { Lang } from "./i18n";

/**
 * Long date with weekday.
 * zh → "五月二十三日 · 周六"; en → "May 23 · Sat".
 */
export function longDate(iso: string, lang: Lang = "zh"): string {
  const d = new Date(iso);
  if (lang === "en") {
    const md = new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
    }).format(d);
    const wd = new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(d);
    return `${md} · ${wd}`;
  }
  return `${CN_MONTH[d.getMonth()]}月${cnNum(d.getDate())}日 · ${CN_WEEK[d.getDay()]}`;
}

/** YYYY-MM-DD in local timezone. */
export function dayKey(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 11:42 */
export function hhmm(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Local-time ISO string (no Z suffix), matching the format stored by the backend. */
export function localIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
