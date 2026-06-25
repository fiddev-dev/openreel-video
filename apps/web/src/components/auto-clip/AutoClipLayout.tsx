/**
 * AutoClipLayout — shared page shell for all Auto Clip pages.
 * Provides header with logo, back navigation, and consistent padding.
 */
import { ArrowLeft, Scissors } from "lucide-react";
import type { AppRoute } from "../../hooks/use-router";
import { useRouter } from "../../hooks/use-router";

interface AutoClipLayoutProps {
  children: React.ReactNode;
  backRoute?: AppRoute;
  backLabel?: string;
  title?: string;
  step?: number;
  totalSteps?: number;
}

const OpenReelLogo: React.FC<{ className?: string }> = ({ className = "" }) => (
  <svg viewBox="0 0 490 490" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
    <path d="M245 24.5C123.223 24.5 24.5 123.223 24.5 245s98.723 220.5 220.5 220.5 220.5-98.723 220.5-220.5S366.777 24.5 245 24.5Z" stroke="currentColor" strokeWidth="30.625" />
    <path d="M294 245a49 49 0 0 1-49 49 49 49 0 0 1-49-49 49 49 0 0 1 98 0" fill="currentColor" />
  </svg>
);

export const AutoClipLayout: React.FC<AutoClipLayoutProps> = ({
  children,
  backRoute,
  backLabel = "Back",
  title,
  step,
  totalSteps,
}) => {
  const { navigate } = useRouter();

  return (
    <div className="fixed inset-0 bg-[var(--bg)] flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 h-14 border-b border-[var(--border)] flex-shrink-0 bg-[var(--bg-1)]">
        <div className="flex items-center gap-4">
          {backRoute && (
            <button
              onClick={() => navigate(backRoute)}
              className="flex items-center gap-1.5 text-xs text-[var(--fg-3)] hover:text-[var(--fg)] transition-colors"
            >
              <ArrowLeft size={15} />
              {backLabel}
            </button>
          )}
          {!backRoute && (
            <div className="flex items-center gap-2">
              <OpenReelLogo className="w-6 h-6 text-[var(--accent)]" />
              <span className="text-sm font-semibold text-[var(--fg)]">OpenReel Video</span>
            </div>
          )}
        </div>

        {/* Center — title with scissors icon */}
        <div className="flex items-center gap-2">
          <Scissors size={14} className="text-[var(--accent)]" />
          <span className="text-sm font-semibold text-[var(--fg)]">
            {title ?? "Auto Clip"}
          </span>
          {step && totalSteps && (
            <span className="text-xs text-[var(--fg-muted)] ml-1">
              {step}/{totalSteps}
            </span>
          )}
        </div>

        {/* Right spacer */}
        <div className="w-24" />
      </header>

      {/* Step progress bar */}
      {step && totalSteps && (
        <div className="h-0.5 bg-[var(--border)] flex-shrink-0">
          <div
            className="h-full bg-[var(--accent)] transition-all duration-500"
            style={{ width: `${(step / totalSteps) * 100}%` }}
          />
        </div>
      )}

      {/* Page content */}
      <div className="flex-1 overflow-y-auto">{children}</div>
    </div>
  );
};
