import { useI18n } from "../lib/i18n";
import { useTheme, type Theme } from "../lib/theme";

const order: Theme[] = ["light", "dark", "system"];

// Minimal tri-state cycle: light → dark → system → light
export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const { t } = useI18n();
  const next = () => setTheme(order[(order.indexOf(theme) + 1) % order.length]);
  const label = t(`theme.${theme}`);

  return (
    <button
      onClick={next}
      title={t("theme.title", { label })}
      className="text-xs mono-time text-ink-muted hover:text-amber
                 px-2.5 py-1 rounded-md hover:bg-surface2
                 transition-colors duration-200"
      aria-label={t("theme.aria")}
    >
      {theme === "light" ? "☼" : theme === "dark" ? "☾" : "◐"}
      <span className="ml-1.5 hidden sm:inline">{label}</span>
    </button>
  );
}
