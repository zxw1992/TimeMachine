import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import LanguageToggle from "./components/LanguageToggle";
import ThemeToggle from "./components/ThemeToggle";
import { useI18n } from "./lib/i18n";
import CapturePage from "./pages/CapturePage";
import TimelinePage from "./pages/TimelinePage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";
import ReviewPage from "./pages/ReviewPage";

const NAV = [
  { to: "/capture", key: "nav.capture" },
  { to: "/timeline", key: "nav.timeline" },
  { to: "/search", key: "nav.search" },
  { to: "/review", key: "nav.review" },
];

function navCls({ isActive }: { isActive: boolean }) {
  return [
    "relative px-1 py-1 text-sm transition-colors duration-200",
    isActive ? "text-ink" : "text-ink-muted hover:text-ink",
  ].join(" ");
}

export default function App() {
  const { t } = useI18n();
  return (
    <div className="h-full flex flex-col">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-paper/70 border-b hairline">
        <div className="max-w-prose mx-auto px-6 h-14 flex items-center gap-8">
          <div className="flex items-baseline gap-3">
            <span className="serif-title text-xl text-ink">{t("brand")}</span>
            <span className="mono-time text-[10px] text-ink-faint tracking-widest">
              AI&nbsp;TIME&nbsp;MACHINE
            </span>
          </div>

          <nav className="flex gap-6">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navCls}>
                {({ isActive }) => (
                  <>
                    <span className="serif-title">{t(n.key)}</span>
                    {isActive && (
                      <span className="absolute -bottom-[10px] left-0 right-0 h-px bg-amber" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <LanguageToggle />
            <ThemeToggle />
            <a
              href="https://github.com/zxw1992/TimeMachine"
              target="_blank"
              rel="noreferrer"
              className="text-ink-muted hover:text-amber hover:bg-surface2
                         px-2.5 py-1 rounded-md transition-colors duration-200"
              title={t("nav.github")}
              aria-label={t("nav.github")}
            >
              <svg
                viewBox="0 0 16 16"
                className="w-[18px] h-[18px]"
                fill="currentColor"
                aria-hidden
              >
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.65 7.65 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
            </a>
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                `text-base px-2.5 py-1 rounded-md transition-colors duration-200 ${
                  isActive ? "text-ink bg-surface2" : "text-ink-muted hover:text-amber hover:bg-surface2"
                }`
              }
              title={t("nav.settings")}
              aria-label={t("nav.settings")}
            >
              ⚙
            </NavLink>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/capture" replace />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/review" element={<ReviewPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
