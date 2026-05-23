import { useI18n, type Lang } from "../lib/i18n";

// Minimal two-state toggle: zh ⇄ en.
export default function LanguageToggle() {
  const { lang, setLang, t } = useI18n();
  const next: Lang = lang === "zh" ? "en" : "zh";
  const label = t(`lang.${lang}`);

  return (
    <button
      onClick={() => setLang(next)}
      title={t("lang.title", { label })}
      className="text-xs mono-time text-ink-muted hover:text-amber
                 px-2.5 py-1 rounded-md hover:bg-surface2
                 transition-colors duration-200"
      aria-label={t("lang.aria")}
    >
      文/EN
    </button>
  );
}
