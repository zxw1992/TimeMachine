import { useEffect, useMemo, useState } from "react";
import {
  getSettings,
  reindexEmbeddings,
  testConnection,
  updateSettings,
  type CustomProvider,
  type SettingsState,
  type TestResult,
} from "../api";
import { useI18n } from "../lib/i18n";
import { useTheme, type Theme } from "../lib/theme";

const CAPS = ["vision", "title", "embed", "transcribe"] as const;
type Cap = (typeof CAPS)[number];

const EMPTY_CUSTOM: CustomProvider = {
  id: "",
  label: "",
  base_url: "",
  api_key: "",
  text_model: "",
  vision_model: "",
  embedding_model: "",
  embedding_dim: 1536,
  transcribe_model: "",
  caps: ["vision", "title"],
};

function prettyField(field: string): string {
  return field.replace(/^[a-z]+_/, "").replace(/_/g, " ");
}

export default function SettingsPage() {
  const { t, lang, setLang } = useI18n();
  const [theme, setTheme] = useTheme();

  const [st, setSt] = useState<SettingsState | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Editable draft, layered on top of the server snapshot.
  const [aiProvider, setAiProvider] = useState("");
  const [transProvider, setTransProvider] = useState("");
  const [embedProvider, setEmbedProvider] = useState("");
  const [models, setModels] = useState<Record<string, string>>({});
  const [keys, setKeys] = useState<Record<string, string>>({});
  const [customs, setCustoms] = useState<CustomProvider[]>([]);

  const [saving, setSaving] = useState(false);
  const [savedTick, setSavedTick] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResults, setTestResults] = useState<Record<string, TestResult> | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexMsg, setReindexMsg] = useState<string | null>(null);

  function hydrate(s: SettingsState) {
    setSt(s);
    setAiProvider(s.ai_provider);
    setTransProvider(s.transcribe_provider);
    setEmbedProvider(s.embedding_provider);
    const m: Record<string, string> = {};
    for (const p of Object.values(s.providers)) {
      for (const [k, v] of Object.entries(p.models)) m[k] = v;
    }
    setModels(m);
    setKeys({});
    setCustoms(s.custom_providers.map((c) => ({ ...c, api_key: "" })));
  }

  useEffect(() => {
    getSettings().then(hydrate).catch(() => setErr(t("settings.loadError")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const locked = useMemo(
    () => !!st && st.embedding.locked_dim !== null && st.embedding.entry_count > 0,
    [st],
  );

  function optionsFor(cap: Cap, withSame: boolean) {
    if (!st) return [];
    const items = st.catalog.filter((c) => c.caps.includes(cap));
    return withSame ? [{ id: "same", label: t("settings.role.same"), caps: [] }, ...items] : items;
  }

  async function save() {
    if (!st) return;
    setSaving(true);
    setErr(null);
    try {
      const updates: Record<string, unknown> = {
        ai_provider: aiProvider,
        transcribe_provider: transProvider,
        ...models,
        custom_providers: customs,
      };
      // Embedding selection is managed via reindex when locked.
      if (!locked) updates.embedding_provider = embedProvider;
      for (const [k, v] of Object.entries(keys)) if (v) updates[k] = v;
      const fresh = await updateSettings(updates);
      hydrate(fresh);
      setSavedTick(true);
      setTimeout(() => setSavedTick(false), 1500);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function runTest() {
    setTesting(true);
    setTestResults(null);
    try {
      setTestResults(await testConnection());
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setTesting(false);
    }
  }

  async function runReindex() {
    if (!confirm(t("settings.embedding.reindexConfirm"))) return;
    setReindexing(true);
    setReindexMsg(null);
    setErr(null);
    try {
      const r = await reindexEmbeddings({ embedding_provider: embedProvider });
      setReindexMsg(t("settings.embedding.reindexDone", { count: r.count, dim: r.dim }));
      const fresh = await getSettings();
      hydrate(fresh);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setReindexing(false);
    }
  }

  function updateCustom(i: number, patch: Partial<CustomProvider>) {
    setCustoms((cs) => cs.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  }
  function toggleCap(i: number, cap: Cap) {
    setCustoms((cs) =>
      cs.map((c, idx) => {
        if (idx !== i) return c;
        const has = c.caps.includes(cap);
        return { ...c, caps: has ? c.caps.filter((x) => x !== cap) : [...c.caps, cap] };
      }),
    );
  }

  if (err && !st) {
    return (
      <div className="max-w-prose mx-auto px-6 pt-10 text-amber">{err}</div>
    );
  }
  if (!st) {
    return (
      <div className="max-w-prose mx-auto px-6 pt-10 text-ink-faint mono-time animate-pulse-soft">
        …
      </div>
    );
  }

  const selectCls =
    "input-clean py-1.5 text-sm text-ink bg-surface min-w-[200px]";
  const fieldCls =
    "input-clean w-full py-1.5 text-sm text-ink placeholder:text-ink-faint";
  const sectionTitle = "serif-title text-base text-ink mb-4";

  return (
    <div className="max-w-prose mx-auto px-6 pt-10 pb-24 animate-fade-in">
      <h1 className="serif-title text-3xl text-ink mb-2">{t("settings.title")}</h1>
      <p className="text-sm text-ink-faint mb-10">{t("settings.subtitle")}</p>

      {err && <div className="mb-6 text-sm text-amber">{err}</div>}

      {/* ── Roles ── */}
      <section className="mb-12">
        <h2 className={sectionTitle}>{t("settings.section.roles")}</h2>
        <div className="space-y-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-faint">{t("settings.role.primary")}</span>
            <select className={selectCls} value={aiProvider} onChange={(e) => setAiProvider(e.target.value)}>
              {optionsFor("title", false).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-xs text-ink-faint">{t("settings.role.transcribe")}</span>
            <select className={selectCls} value={transProvider} onChange={(e) => setTransProvider(e.target.value)}>
              {optionsFor("transcribe", true).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </label>

          <div className="flex flex-col gap-1">
            <span className="text-xs text-ink-faint">{t("settings.role.embedding")}</span>
            <select
              className={`${selectCls} disabled:opacity-50`}
              value={embedProvider}
              disabled={locked}
              onChange={(e) => setEmbedProvider(e.target.value)}
            >
              {optionsFor("embed", true).map((o) => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
            {locked && (
              <div className="mt-2 text-xs text-ink-faint surface-card p-3 space-y-2">
                <p>
                  {t("settings.embedding.locked", {
                    count: st.embedding.entry_count,
                    dim: st.embedding.locked_dim ?? 0,
                  })}
                </p>
                <div className="flex items-center gap-2">
                  <select
                    className={`${selectCls} min-w-[160px]`}
                    value={embedProvider}
                    onChange={(e) => setEmbedProvider(e.target.value)}
                  >
                    {optionsFor("embed", true).map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={runReindex}
                    disabled={reindexing}
                    className="btn-ghost text-xs border border-divider rounded-md disabled:opacity-40"
                  >
                    {reindexing ? t("settings.embedding.reindexing") : t("settings.embedding.reindexBtn")}
                  </button>
                </div>
                <p className="text-ink-faint">
                  {t("settings.embedding.reindexHint", { count: st.embedding.entry_count })}
                </p>
                {reindexMsg && <p className="text-amber">{reindexMsg}</p>}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Built-in providers ── */}
      <section className="mb-12">
        <h2 className={sectionTitle}>{t("settings.section.builtin")}</h2>
        <div className="space-y-4">
          {Object.entries(st.providers).map(([name, info]) => {
            const keyField = providerKeyField(name);
            return (
              <div key={name} className="surface-card p-4">
                <div className="flex items-center gap-2 mb-3">
                  <span className="serif-title text-sm text-ink">{info.label}</span>
                  <span className="mono-time text-[10px] text-ink-faint">{name}</span>
                  <span className="ml-auto flex gap-1">
                    {info.caps.map((c) => (
                      <span key={c} className="mono-time text-[9px] px-1.5 py-0.5 rounded bg-surface2 text-ink-faint">
                        {t(`settings.cap.${c}`)}
                      </span>
                    ))}
                  </span>
                </div>
                <label className="flex flex-col gap-1 mb-3">
                  <span className="text-xs text-ink-faint">{t("settings.apiKey")}</span>
                  <input
                    type="password"
                    className={fieldCls}
                    placeholder={info.api_key_set ? t("settings.apiKey.set") : t("settings.apiKey.unset")}
                    value={keys[keyField] ?? ""}
                    onChange={(e) => setKeys((k) => ({ ...k, [keyField]: e.target.value }))}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {Object.keys(info.models).map((mf) => (
                    <label key={mf} className="flex flex-col gap-1">
                      <span className="text-[11px] text-ink-faint">{prettyField(mf)}</span>
                      <input
                        className={fieldCls}
                        value={models[mf] ?? ""}
                        onChange={(e) => setModels((m) => ({ ...m, [mf]: e.target.value }))}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Custom providers ── */}
      <section className="mb-12">
        <div className="flex items-center justify-between mb-4">
          <h2 className="serif-title text-base text-ink">{t("settings.section.custom")}</h2>
          <button
            onClick={() => setCustoms((cs) => [...cs, { ...EMPTY_CUSTOM, id: `custom-${cs.length + 1}` }])}
            className="btn-ghost text-xs border border-divider rounded-md"
          >
            + {t("settings.custom.add")}
          </button>
        </div>
        {customs.length === 0 && (
          <p className="text-xs text-ink-faint">{t("settings.custom.empty")}</p>
        )}
        <div className="space-y-4">
          {customs.map((c, i) => (
            <div key={i} className="surface-card p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("settings.custom.id")} value={c.id} onChange={(v) => updateCustom(i, { id: v })} cls={fieldCls} />
                <Field label={t("settings.custom.label")} value={c.label ?? ""} onChange={(v) => updateCustom(i, { label: v })} cls={fieldCls} />
              </div>
              <Field label={t("settings.custom.baseUrl")} value={c.base_url ?? ""} onChange={(v) => updateCustom(i, { base_url: v })} cls={fieldCls} placeholder="http://localhost:11434/v1" />
              <label className="flex flex-col gap-1">
                <span className="text-[11px] text-ink-faint">{t("settings.apiKey")}</span>
                <input
                  type="password"
                  className={fieldCls}
                  placeholder={c.api_key_set ? t("settings.apiKey.set") : t("settings.apiKey.unset")}
                  value={c.api_key ?? ""}
                  onChange={(e) => updateCustom(i, { api_key: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t("settings.custom.textModel")} value={c.text_model ?? ""} onChange={(v) => updateCustom(i, { text_model: v })} cls={fieldCls} />
                <Field label={t("settings.custom.visionModel")} value={c.vision_model ?? ""} onChange={(v) => updateCustom(i, { vision_model: v })} cls={fieldCls} />
                <Field label={t("settings.custom.embeddingModel")} value={c.embedding_model ?? ""} onChange={(v) => updateCustom(i, { embedding_model: v })} cls={fieldCls} />
                <Field label={t("settings.custom.embeddingDim")} value={String(c.embedding_dim ?? "")} onChange={(v) => updateCustom(i, { embedding_dim: Number(v) || 0 })} cls={fieldCls} />
                <Field label={t("settings.custom.transcribeModel")} value={c.transcribe_model ?? ""} onChange={(v) => updateCustom(i, { transcribe_model: v })} cls={fieldCls} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <span className="text-[11px] text-ink-faint">{t("settings.custom.caps")}:</span>
                {CAPS.map((cap) => (
                  <label key={cap} className="flex items-center gap-1 text-xs text-ink-muted cursor-pointer">
                    <input type="checkbox" checked={c.caps.includes(cap)} onChange={() => toggleCap(i, cap)} />
                    {t(`settings.cap.${cap}`)}
                  </label>
                ))}
                <button
                  onClick={() => setCustoms((cs) => cs.filter((_, idx) => idx !== i))}
                  className="ml-auto text-xs text-ink-faint hover:text-amber transition-colors"
                >
                  {t("settings.custom.remove")}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Save + Test ── */}
      <div className="flex items-center gap-3 mb-12">
        <button onClick={save} disabled={saving} className="btn-ink disabled:opacity-40">
          {saving ? t("settings.saving") : savedTick ? t("settings.saved") : t("settings.save")}
        </button>
        <button
          onClick={runTest}
          disabled={testing}
          className="btn-ghost text-sm border border-divider rounded-md disabled:opacity-40"
        >
          {testing ? t("settings.testing") : t("settings.test")}
        </button>
      </div>

      {testResults && (
        <div className="mb-12 surface-card p-4 space-y-1">
          {Object.entries(testResults).map(([cap, r]) => (
            <div key={cap} className="flex items-baseline gap-2 text-xs">
              <span className="mono-time w-16 text-ink-faint">{t(`settings.cap.${cap}`)}</span>
              <span className={r.ok ? "text-ink" : "text-amber"}>
                {r.ok ? `✓ ${t("settings.test.ok")}` : `✕ ${t("settings.test.fail")}`}
              </span>
              <span className="text-ink-faint truncate flex-1">{r.detail || r.error}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Appearance ── */}
      <section className="mb-12">
        <h2 className={sectionTitle}>{t("settings.section.appearance")}</h2>
        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-3">
            <span className="text-xs text-ink-faint w-20">{t("lang.aria")}</span>
            <select className={selectCls} value={lang} onChange={(e) => setLang(e.target.value as "zh" | "en")}>
              <option value="zh">{t("lang.zh")}</option>
              <option value="en">{t("lang.en")}</option>
            </select>
          </label>
          <label className="flex items-center gap-3">
            <span className="text-xs text-ink-faint w-20">{t("theme.aria")}</span>
            <select className={selectCls} value={theme} onChange={(e) => setTheme(e.target.value as Theme)}>
              <option value="light">{t("theme.light")}</option>
              <option value="dark">{t("theme.dark")}</option>
              <option value="system">{t("theme.system")}</option>
            </select>
          </label>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  cls,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  cls: string;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <input className={cls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

// API-key field name for each built-in provider.
function providerKeyField(name: string): string {
  switch (name) {
    case "claude":
      return "anthropic_api_key";
    case "openai":
      return "openai_api_key";
    case "gemini":
      return "gemini_api_key";
    case "bailian":
      return "dashscope_api_key";
    default:
      return `${name}_api_key`;
  }
}
