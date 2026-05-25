/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // 语义化 token，全部走 CSS 变量，深色/浅色自动切换
        paper: "rgb(var(--c-paper) / <alpha-value>)",
        surface: "rgb(var(--c-surface) / <alpha-value>)",
        surface2: "rgb(var(--c-surface-2) / <alpha-value>)",
        ink: "rgb(var(--c-ink) / <alpha-value>)",
        "ink-muted": "rgb(var(--c-ink-muted) / <alpha-value>)",
        "ink-faint": "rgb(var(--c-ink-faint) / <alpha-value>)",
        divider: "rgb(var(--c-divider) / <alpha-value>)",
        amber: "rgb(var(--c-amber) / <alpha-value>)",
        "amber-soft": "rgb(var(--c-amber-soft) / <alpha-value>)",
      },
      // Cross-platform CJK fallbacks: macOS first, then Linux (Noto/Source Han),
      // then Windows (SimSun / Microsoft YaHei), so each OS lands on a real CJK
      // face instead of an ugly Latin-only generic. No bundled webfont keeps the
      // app fully offline and the bundle small.
      fontFamily: {
        serif: [
          '"Songti SC"', // macOS
          '"Source Han Serif SC"',
          '"Noto Serif CJK SC"', // Linux (fontconfig name)
          '"Noto Serif SC"',
          '"Source Han Serif CN"',
          '"SimSun"', // Windows 宋体
          '"STSong"',
          "serif",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"Inter"',
          '"PingFang SC"', // macOS
          '"Microsoft YaHei"', // Windows
          '"Noto Sans CJK SC"', // Linux
          '"Segoe UI"',
          '"Helvetica Neue"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"SF Mono"',
          '"JetBrains Mono"',
          '"Cascadia Code"', // Windows
          "Menlo",
          "Consolas",
          '"DejaVu Sans Mono"', // Linux
          "monospace",
        ],
      },
      letterSpacing: {
        "wide-zh": "0.05em",
      },
      maxWidth: {
        prose: "720px",
        compose: "760px",
      },
      boxShadow: {
        soft: "0 1px 2px rgb(var(--c-shadow) / 0.04), 0 4px 16px rgb(var(--c-shadow) / 0.04)",
        hover: "0 2px 4px rgb(var(--c-shadow) / 0.06), 0 8px 24px rgb(var(--c-shadow) / 0.06)",
      },
      transitionTimingFunction: {
        soft: "cubic-bezier(0.4, 0, 0.2, 1)",
        develop: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      keyframes: {
        develop: {
          "0%": { opacity: "0", transform: "translateY(8px)", filter: "blur(2px)" },
          "100%": { opacity: "1", transform: "translateY(0)", filter: "blur(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "0.5" },
          "50%": { opacity: "1" },
        },
      },
      animation: {
        develop: "develop 600ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "fade-in": "fade-in 300ms ease-out both",
        "slide-up": "slide-up 250ms cubic-bezier(0.16, 1, 0.3, 1) both",
        "pulse-soft": "pulse-soft 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
