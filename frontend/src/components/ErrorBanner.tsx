import { Link } from "react-router-dom";
import { classifyError } from "../lib/errors";
import { useI18n } from "../lib/i18n";

/**
 * Friendly, actionable error surface: turns a raw error into a readable
 * message and offers the relevant next step — "Open Settings" for config
 * problems (missing/invalid key) and "Retry" for transient ones.
 */
export default function ErrorBanner({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry?: () => void;
}) {
  const { t } = useI18n();
  const { key, vars, retriable, configFix } = classifyError(error);

  return (
    <div className="mt-4 rounded-lg border hairline bg-amber/[0.06] px-4 py-3 text-sm animate-fade-in">
      <p className="text-amber">{t(key, vars)}</p>
      {(configFix || (retriable && onRetry)) && (
        <div className="mt-2 flex items-center gap-4">
          {configFix && (
            <Link
              to="/settings"
              className="text-xs text-ink-muted hover:text-amber underline underline-offset-2"
            >
              {t("error.toSettings")}
            </Link>
          )}
          {retriable && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="text-xs text-ink-muted hover:text-amber underline underline-offset-2"
            >
              {t("error.retry")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
