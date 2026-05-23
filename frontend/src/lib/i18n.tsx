import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Lang = "zh" | "en";

const KEY = "aitm-lang";

type Dict = Record<string, string>;

const zh: Dict = {
  // Brand / nav
  "brand": "时光机",
  "nav.capture": "记录",
  "nav.timeline": "时光",
  "nav.search": "回溯",

  // Theme toggle
  "theme.light": "明",
  "theme.dark": "暗",
  "theme.system": "随系统",
  "theme.title": "主题：{label}（点击切换）",
  "theme.aria": "切换主题",

  // Language toggle
  "lang.title": "语言：{label}（点击切换）",
  "lang.aria": "切换语言",
  "lang.zh": "中文",
  "lang.en": "EN",

  // Kinds
  "kind.text": "文字",
  "kind.image": "影像",
  "kind.audio": "声音",
  "kind.glyph.text": "文",
  "kind.glyph.image": "影",
  "kind.glyph.audio": "声",

  // Capture page
  "capture.title": "此刻",
  "capture.subtitle": "把看到的、听到的、想到的，丢进时光机。",
  "capture.mode.text": "想到的",
  "capture.mode.image": "看到的",
  "capture.mode.audio": "听到的",
  "capture.text.placeholder": "此刻在想什么…",
  "capture.image.drop": "选择或拖入一张图",
  "capture.image.paste": "⌘V 也可以直接粘贴截图",
  "capture.image.hint": "可选：补充上下文（在哪儿看到的）",
  "capture.image.note": "可选：你自己的批注",
  "capture.image.replace": "换一张",
  "capture.audio.note": "可选：你的批注",
  "capture.audio.start": "开始录音",
  "capture.audio.stop": "停止录音",
  "capture.audio.micError": "无法访问麦克风：{msg}",
  "capture.submitting": "AI 正在为你整理…",
  "capture.footerHint": "保存后会自动生成标题与描述",
  "capture.submit": "存入时光机",

  // Timeline page
  "timeline.title": "时间之河",
  "timeline.range.today": "今日",
  "timeline.range.week": "本周",
  "timeline.range.month": "本月",
  "timeline.range.all": "全部",
  "timeline.loading": "汲取中…",
  "timeline.count": "{n} 条记忆",
  "timeline.empty.title": "这段时间还没有记忆。",
  "timeline.empty.hint": "去“记录”页留下点什么吧。",

  // Calendar heatmap
  "heatmap.title": "月度鸟瞰",
  "heatmap.summary": "近 {months} 个月 · {total} 条",
  "heatmap.expand": "展开",
  "heatmap.collapse": "收起",
  "heatmap.tip.has": "{n} 条记忆",
  "heatmap.tip.none": "无记录",
  "heatmap.monthLabel": "{year}·{month}月",

  // Entry drawer
  "drawer.close": "关闭",
  "drawer.prev": "上一条",
  "drawer.next": "下一条",
  "drawer.prevTitle": "上一条 (←)",
  "drawer.nextTitle": "下一条 (→)",
  "drawer.confirmDelete": "确认删除这条记忆？",
  "drawer.loading": "汲取中…",
  "drawer.savedAt": "写入于 {time}",
  "drawer.delete": "删除这条记忆",

  // River entry (shared list item)
  "entry.match": "· 相似 {pct}%",
  "entry.expand": "展开",
  "entry.collapse": "收起",
  "entry.delete": "删除",

  // Audio player
  "audio.play": "播放",
  "audio.pause": "暂停",

  // Search page
  "search.title": "回溯",
  "search.subtitle": "用一句话描述你想找回的那段记忆。",
  "search.placeholder": "比如：那次会议里提到的那个名字…",
  "search.searching": "检索中…",
  "search.enterHint": "回车开始",
  "search.submit": "找一找",
  "search.suggestionsTitle": "没有头绪？试试：",
  "search.suggestion.1": "那次开会聊到的客户名字",
  "search.suggestion.2": "上周看到的一张菜单截图",
  "search.suggestion.3": "某天心情不太好时写的话",
  "search.suggestion.4": "提到「番茄」的那段录音",
  "search.history.title": "最近搜索",
  "search.history.clear": "清空",
  "search.history.expand": "展开全部 ({n})",
  "search.history.collapse": "收起",
  "search.history.deleteAria": "删除「{q}」",
  "search.history.deleteTitle": "删除这条历史",
  "search.empty.title": "没有匹配的记忆。",
  "search.empty.hint": "换个描述试试，AI 会按语义匹配。",
  "search.found": "找到 {n} 条相关记忆",
};

const en: Dict = {
  // Brand / nav
  "brand": "Time Machine",
  "nav.capture": "Capture",
  "nav.timeline": "Timeline",
  "nav.search": "Recall",

  // Theme toggle
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "System",
  "theme.title": "Theme: {label} (click to cycle)",
  "theme.aria": "Toggle theme",

  // Language toggle
  "lang.title": "Language: {label} (click to switch)",
  "lang.aria": "Switch language",
  "lang.zh": "中文",
  "lang.en": "EN",

  // Kinds
  "kind.text": "Text",
  "kind.image": "Image",
  "kind.audio": "Audio",
  "kind.glyph.text": "T",
  "kind.glyph.image": "I",
  "kind.glyph.audio": "A",

  // Capture page
  "capture.title": "Now",
  "capture.subtitle": "Drop what you see, hear, and think into the time machine.",
  "capture.mode.text": "Thought",
  "capture.mode.image": "Saw",
  "capture.mode.audio": "Heard",
  "capture.text.placeholder": "What's on your mind…",
  "capture.image.drop": "Choose or drag in an image",
  "capture.image.paste": "⌘V also pastes a screenshot directly",
  "capture.image.hint": "Optional: add context (where you saw it)",
  "capture.image.note": "Optional: your own note",
  "capture.image.replace": "Replace",
  "capture.audio.note": "Optional: your note",
  "capture.audio.start": "Start recording",
  "capture.audio.stop": "Stop recording",
  "capture.audio.micError": "Cannot access microphone: {msg}",
  "capture.submitting": "AI is tidying this up…",
  "capture.footerHint": "A title and description are generated automatically on save",
  "capture.submit": "Save to Time Machine",

  // Timeline page
  "timeline.title": "River of Time",
  "timeline.range.today": "Today",
  "timeline.range.week": "Week",
  "timeline.range.month": "Month",
  "timeline.range.all": "All",
  "timeline.loading": "Loading…",
  "timeline.count": "{n} memories",
  "timeline.empty.title": "No memories in this period yet.",
  "timeline.empty.hint": "Head to “Capture” and jot something down.",

  // Calendar heatmap
  "heatmap.title": "Monthly overview",
  "heatmap.summary": "Last {months} months · {total} total",
  "heatmap.expand": "Expand",
  "heatmap.collapse": "Collapse",
  "heatmap.tip.has": "{n} memories",
  "heatmap.tip.none": "No entries",
  "heatmap.monthLabel": "{month} {year}",

  // Entry drawer
  "drawer.close": "Close",
  "drawer.prev": "Previous",
  "drawer.next": "Next",
  "drawer.prevTitle": "Previous (←)",
  "drawer.nextTitle": "Next (→)",
  "drawer.confirmDelete": "Delete this memory?",
  "drawer.loading": "Loading…",
  "drawer.savedAt": "Saved {time}",
  "drawer.delete": "Delete this memory",

  // River entry (shared list item)
  "entry.match": "· {pct}% match",
  "entry.expand": "Expand",
  "entry.collapse": "Collapse",
  "entry.delete": "Delete",

  // Audio player
  "audio.play": "Play",
  "audio.pause": "Pause",

  // Search page
  "search.title": "Recall",
  "search.subtitle": "Describe the memory you want to find in a sentence.",
  "search.placeholder": "e.g. the name mentioned in that meeting…",
  "search.searching": "Searching…",
  "search.enterHint": "Press Enter to start",
  "search.submit": "Search",
  "search.suggestionsTitle": "Not sure? Try:",
  "search.suggestion.1": "the client's name from that meeting",
  "search.suggestion.2": "a menu screenshot I saw last week",
  "search.suggestion.3": "something I wrote on a bad day",
  "search.suggestion.4": "the recording that mentions “tomato”",
  "search.history.title": "Recent searches",
  "search.history.clear": "Clear",
  "search.history.expand": "Show all ({n})",
  "search.history.collapse": "Collapse",
  "search.history.deleteAria": "Delete “{q}”",
  "search.history.deleteTitle": "Delete this entry",
  "search.empty.title": "No matching memories.",
  "search.empty.hint": "Try rephrasing — the AI matches by meaning.",
  "search.found": "Found {n} related memories",
};

const dict: Record<Lang, Dict> = { zh, en };

function interpolate(s: string, vars?: Record<string, string | number>): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) =>
    k in vars ? String(vars[k]) : `{${k}}`,
  );
}

function detectDefault(): Lang {
  const stored = localStorage.getItem(KEY);
  if (stored === "zh" || stored === "en") return stored;
  return navigator.language?.toLowerCase().startsWith("zh") ? "zh" : "en";
}

export type TFn = (key: string, vars?: Record<string, string | number>) => string;

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: TFn;
}

const Ctx = createContext<I18nCtx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(detectDefault);

  useEffect(() => {
    localStorage.setItem(KEY, lang);
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  }, [lang]);

  const value = useMemo<I18nCtx>(() => {
    const t: TFn = (key, vars) =>
      interpolate(dict[lang][key] ?? zh[key] ?? key, vars);
    return { lang, setLang, t };
  }, [lang]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18nCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useI18n must be used within I18nProvider");
  return c;
}
