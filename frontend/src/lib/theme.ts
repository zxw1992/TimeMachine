import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "system";

const KEY = "aitm-theme";

function applyTheme(t: Theme) {
  const sysDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = t === "dark" || (t === "system" && sysDark);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(
    () => (localStorage.getItem(KEY) as Theme) || "system",
  );

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyTheme("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  return [theme, setThemeState];
}

// Synchronously apply theme before React mounts, to avoid a flash of incorrect theme.
export function bootstrapTheme() {
  const stored = (localStorage.getItem(KEY) as Theme) || "system";
  applyTheme(stored);
}
