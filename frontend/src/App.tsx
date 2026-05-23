import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import ThemeToggle from "./components/ThemeToggle";
import CapturePage from "./pages/CapturePage";
import TimelinePage from "./pages/TimelinePage";
import SearchPage from "./pages/SearchPage";

const NAV = [
  { to: "/capture", label: "记录" },
  { to: "/timeline", label: "时光" },
  { to: "/search", label: "回溯" },
];

function navCls({ isActive }: { isActive: boolean }) {
  return [
    "relative px-1 py-1 text-sm transition-colors duration-200",
    isActive ? "text-ink" : "text-ink-muted hover:text-ink",
  ].join(" ");
}

export default function App() {
  return (
    <div className="h-full flex flex-col">
      <header className="sticky top-0 z-10 backdrop-blur-md bg-paper/70 border-b hairline">
        <div className="max-w-prose mx-auto px-6 h-14 flex items-center gap-8">
          <div className="flex items-baseline gap-3">
            <span className="serif-title text-xl text-ink">时光机</span>
            <span className="mono-time text-[10px] text-ink-faint tracking-widest">
              AI&nbsp;TIME&nbsp;MACHINE
            </span>
          </div>

          <nav className="flex gap-6">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} className={navCls}>
                {({ isActive }) => (
                  <>
                    <span className="serif-title">{n.label}</span>
                    {isActive && (
                      <span className="absolute -bottom-[10px] left-0 right-0 h-px bg-amber" />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto">
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<Navigate to="/capture" replace />} />
          <Route path="/capture" element={<CapturePage />} />
          <Route path="/timeline" element={<TimelinePage />} />
          <Route path="/search" element={<SearchPage />} />
        </Routes>
      </main>
    </div>
  );
}
