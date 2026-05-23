import { useTheme, type Theme } from "../lib/theme";

const order: Theme[] = ["light", "dark", "system"];
const label: Record<Theme, string> = { light: "明", dark: "暗", system: "随系统" };

// Minimal tri-state cycle: light → dark → system → light
export default function ThemeToggle() {
  const [theme, setTheme] = useTheme();
  const next = () => setTheme(order[(order.indexOf(theme) + 1) % order.length]);

  return (
    <button
      onClick={next}
      title={`主题：${label[theme]}（点击切换）`}
      className="text-xs mono-time text-ink-muted hover:text-amber
                 px-2.5 py-1 rounded-md hover:bg-surface2
                 transition-colors duration-200"
      aria-label="切换主题"
    >
      {theme === "light" ? "☼" : theme === "dark" ? "☾" : "◐"}
      <span className="ml-1.5 hidden sm:inline">{label[theme]}</span>
    </button>
  );
}
