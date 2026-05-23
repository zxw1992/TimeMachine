import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import LanguageToggle from "./components/LanguageToggle";
import ThemeToggle from "./components/ThemeToggle";
import { useI18n } from "./lib/i18n";
import CapturePage from "./pages/CapturePage";
import TimelinePage from "./pages/TimelinePage";
import SearchPage from "./pages/SearchPage";
import SettingsPage from "./pages/SettingsPage";

const NAV = [
  { to: "/capture", key: "nav.capture" },
  { to: "/timeline", key: "nav.timeline" },
  { to: "/search", key: "nav.search" },
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
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
}
