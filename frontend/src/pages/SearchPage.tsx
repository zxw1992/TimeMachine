import { useState } from "react";
import { search, type SearchHit } from "../api";
import RiverEntry from "../components/RiverEntry";
import {
  addHistory,
  clearHistory,
  loadHistory,
  removeHistory,
} from "../lib/searchHistory";

const SUGGESTIONS = [
  "那次开会聊到的客户名字",
  "上周看到的一张菜单截图",
  "某天心情不太好时写的话",
  "提到「番茄」的那段录音",
];

const HISTORY_PREVIEW = 5;

export default function SearchPage() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const [history, setHistory] = useState<string[]>(() => loadHistory());
  const [historyExpanded, setHistoryExpanded] = useState(false);

  async function runSearch(query: string) {
    const trimmed = query.trim();
    if (!trimmed) return;
    setLoading(true);
    setError(null);
    setSearched(true);
    setHistory(addHistory(trimmed));
    try {
      setHits(await search(trimmed));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    runSearch(q);
  }

  return (
    <div className="max-w-prose mx-auto px-6 pt-10 pb-24">
      <h1 className="serif-title text-3xl text-ink mb-2 animate-fade-in">回溯</h1>
      <p className="text-sm text-ink-faint mb-10 animate-fade-in">
        用一句话描述你想找回的那段记忆。
      </p>

      <form onSubmit={onSubmit} className="animate-slide-up">
        <div className="border-b-2 hairline focus-within:border-amber transition-colors duration-200">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="比如：那次会议里提到的那个名字…"
            className="w-full bg-transparent border-0 focus:outline-none focus:ring-0
                       serif-title text-xl py-3 text-ink placeholder:text-ink-faint"
            autoFocus
          />
        </div>
        <div className="mt-4 flex items-center justify-between">
          <div className="text-xs text-ink-faint">
            {loading ? <span className="animate-pulse-soft">检索中…</span> : "回车开始"}
          </div>
          <button type="submit" disabled={loading || !q.trim()} className="btn-ink disabled:opacity-30">
            找一找
          </button>
        </div>
      </form>

      {/* Recent searches — localStorage only, shown before the first search */}
      {!searched && history.length > 0 && (
        <div className="mt-12 animate-fade-in">
          <div className="flex items-baseline justify-between mb-3">
            <span className="text-xs text-ink-faint mono-time tracking-wider">
              最近搜索
            </span>
            <button
              onClick={() => {
                setHistory(clearHistory());
                setHistoryExpanded(false);
              }}
              className="text-xs text-ink-faint hover:text-amber transition-colors"
            >
              清空
            </button>
          </div>
          <ul className="space-y-0.5">
            {(historyExpanded ? history : history.slice(0, HISTORY_PREVIEW)).map(
              (item) => (
                <li
                  key={item}
                  className="group flex items-center rounded-md hover:bg-surface2 transition-colors"
                >
                  <button
                    onClick={() => {
                      setQ(item);
                      runSearch(item);
                    }}
                    className="flex-1 min-w-0 text-left px-2 py-1.5 text-sm text-ink-muted truncate hover:text-ink"
                  >
                    {item}
                  </button>
                  <button
                    onClick={() => setHistory(removeHistory(item))}
                    className="px-2.5 py-1.5 text-ink-faint opacity-0 group-hover:opacity-100 hover:text-amber transition-all"
                    aria-label={`删除「${item}」`}
                    title="删除这条历史"
                  >
                    ×
                  </button>
                </li>
              ),
            )}
          </ul>
          {history.length > HISTORY_PREVIEW && (
            <button
              onClick={() => setHistoryExpanded((v) => !v)}
              className="mt-2 text-xs text-ink-faint hover:text-ink transition-colors mono-time"
            >
              {historyExpanded ? "收起" : `展开全部 (${history.length})`}
            </button>
          )}
        </div>
      )}

      {/* Suggestions, shown only before the first search */}
      {!searched && (
        <div className="mt-12 animate-fade-in">
          <div className="text-xs text-ink-faint mb-3 mono-time tracking-wider">
            没有头绪？试试：
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => {
                  setQ(s);
                  runSearch(s);
                }}
                className="text-sm text-ink-muted px-3 py-1.5 rounded-full
                           bg-surface2 hover:bg-amber/10 hover:text-amber
                           transition-colors duration-200"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error */}
      {error && <div className="mt-6 text-sm text-amber">{error}</div>}

      {/* Results */}
      {searched && hits.length === 0 && !loading && (
        <div className="mt-16 text-center animate-fade-in">
          <p className="serif-title text-lg text-ink-muted">没有匹配的记忆。</p>
          <p className="mt-2 text-sm text-ink-faint">换个描述试试，AI 会按语义匹配。</p>
        </div>
      )}

      {hits.length > 0 && (
        <section className="mt-12">
          <div className="flex items-baseline gap-3 mb-6">
            <h2 className="serif-title text-base text-ink">找到 {hits.length} 条相关记忆</h2>
            <span className="flex-1 h-px bg-divider" />
          </div>
          {hits.map((h) => (
            <RiverEntry key={h.entry.id} entry={h.entry} score={h.score} />
          ))}
        </section>
      )}
    </div>
  );
}
