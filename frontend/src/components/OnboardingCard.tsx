import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSettings, type SettingsState } from "../api";
import { useI18n } from "../lib/i18n";

const DISMISS_KEY = "aitm-onboard-dismissed";

/** True once the provider backing a role has an API key configured. */
function providerHasKey(s: SettingsState, id: string): boolean {
  const builtin = s.providers[id];
  if (builtin) return builtin.api_key_set;
  return !!s.custom_providers.find((c) => c.id === id)?.api_key_set;
}

/**
 * First-run guidance shown on the capture page while the timeline is still
 * empty: add an API key → capture the first memory. Disappears for good once
 * the first entry exists (or the user skips it).
 */
export default function OnboardingCard({ refreshKey }: { refreshKey: number }) {
  const { t } = useI18n();
  const [hasKey, setHasKey] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem(DISMISS_KEY) === "1",
  );

  useEffect(() => {
    if (dismissed) return;
    getSettings()
      .then((s) => {
        setHasKey(providerHasKey(s, s.ai_provider));
        setEmpty(s.embedding.entry_count === 0);
      })
      .catch(() => {});
  }, [refreshKey, dismissed]);

  // Only new users (no memories yet) see this, and only until they skip it.
  if (dismissed || !empty) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="surface-card p-6 mb-6 animate-slide-up">
      <div className="flex items-baseline justify-between mb-1">
        <h2 className="serif-title text-lg text-ink">{t("onboard.title")}</h2>
        <button
          type="button"
          onClick={dismiss}
          className="text-xs text-ink-faint hover:text-amber transition-colors"
        >
          {t("onboard.dismiss")}
        </button>
      </div>
      <p className="text-sm text-ink-faint mb-5">{t("onboard.subtitle")}</p>

      <ol className="space-y-4">
        {/* Step 1 — API key */}
        <li className="flex gap-3">
          <Step n={1} done={hasKey} />
          <div className="min-w-0">
            <div className="serif-title text-[15px] text-ink">
              {t("onboard.step1.title")}
            </div>
            <p className="text-sm text-ink-faint mt-0.5">{t("onboard.step1.desc")}</p>
            {hasKey ? (
              <span className="mono-time text-xs text-amber mt-1 inline-block">
                ✓ {t("onboard.step1.done")}
              </span>
            ) : (
              <Link
                to="/settings"
                className="btn-ink inline-block mt-2 text-sm no-underline"
              >
                {t("onboard.step1.cta")}
              </Link>
            )}
          </div>
        </li>

        {/* Step 2 — first capture */}
        <li className={`flex gap-3 ${hasKey ? "" : "opacity-50"}`}>
          <Step n={2} done={false} />
          <div className="min-w-0">
            <div className="serif-title text-[15px] text-ink">
              {t("onboard.step2.title")}
            </div>
            <p className="text-sm text-ink-faint mt-0.5">{t("onboard.step2.desc")}</p>
          </div>
        </li>
      </ol>
    </div>
  );
}

/** Numbered step bullet — amber + check when done, hollow ink otherwise. */
function Step({ n, done }: { n: number; done: boolean }) {
  return (
    <span
      className={`flex-shrink-0 w-6 h-6 rounded-full grid place-items-center text-xs mono-time
                  ${done ? "bg-amber text-paper" : "border hairline text-ink-muted"}`}
      aria-hidden
    >
      {done ? "✓" : n}
    </span>
  );
}
