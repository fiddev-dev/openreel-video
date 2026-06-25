/**
 * AutoClipProcessingPage — Step 3 (intermediate): shows pipeline progress while clips are being generated.
 * Auto-redirects to results when done.
 */
import { useEffect, useState, useRef } from "react";
import { Scissors, Sparkles } from "lucide-react";
import { AutoClipLayout } from "../../components/auto-clip/AutoClipLayout";
import { ProcessingSteps } from "../../components/auto-clip/ProcessingSteps";
import { useAutoClipStore, MOCK_TIPS } from "../../stores/auto-clip-store";
import { useRouter } from "../../hooks/use-router";

export const AutoClipProcessingPage: React.FC = () => {
  const { navigate } = useRouter();
  const { processing, videoSource } = useAutoClipStore();
  const [tipIndex, setTipIndex] = useState(0);
  const hasNavigated = useRef(false);

  // Cycle through tips every 3 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      setTipIndex((i) => (i + 1) % MOCK_TIPS.length);
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  // Navigate to results when done
  useEffect(() => {
    if (processing.currentStep === "done" && !hasNavigated.current) {
      hasNavigated.current = true;
      setTimeout(() => navigate("clip-results"), 600);
    }
  }, [processing.currentStep, navigate]);

  // Redirect if no video was selected
  if (!videoSource) {
    navigate("upload");
    return null;
  }

  const videoLabel =
    videoSource.type === "file" ? videoSource.name : videoSource.title;

  const isDone = processing.currentStep === "done";

  return (
    <AutoClipLayout title="Processing">
      <div className="max-w-lg mx-auto px-6 py-16 flex flex-col items-center">

        {/* Animated icon */}
        <div className="relative mb-8">
          <div className={`
            w-24 h-24 rounded-3xl flex items-center justify-center
            bg-gradient-to-br from-[var(--accent)]/20 to-violet-500/20
            ${!isDone ? "animate-pulse" : ""}
          `}>
            {isDone ? (
              <Sparkles size={44} className="text-[var(--accent)]" />
            ) : (
              <Scissors size={44} className="text-[var(--accent)] animate-bounce" />
            )}
          </div>
          {/* Orbiting dot */}
          {!isDone && (
            <div className="absolute inset-0 rounded-3xl border-2 border-[var(--accent)]/30 animate-spin" style={{ animationDuration: "3s" }}>
              <div className="absolute -top-1 left-1/2 w-2 h-2 bg-[var(--accent)] rounded-full -translate-x-1/2" />
            </div>
          )}
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-[var(--fg)] tracking-tight mb-2 text-center">
          {isDone ? "Clips ready! 🎉" : "Creating your clips..."}
        </h1>
        <p className="text-sm text-[var(--fg-3)] text-center mb-2 max-w-sm line-clamp-1">
          {videoLabel}
        </p>
        <p className="text-xs text-[var(--fg-muted)] text-center mb-8">
          You can safely leave this page — we'll notify you when done.
        </p>

        {/* Steps */}
        <div className="w-full bg-[var(--bg-1)] rounded-2xl border border-[var(--border)] p-5 mb-6">
          <ProcessingSteps
            stepProgress={processing.stepProgress}
            progress={processing.progress}
          />
        </div>

        {/* AI Tip */}
        <div className="w-full flex items-start gap-3 p-4 rounded-xl bg-violet-500/10 border border-violet-500/20">
          <Sparkles size={14} className="text-violet-400 mt-0.5 flex-shrink-0" />
          <p
            key={tipIndex}
            className="text-xs text-violet-300 leading-relaxed"
            style={{ animation: "fadeIn 0.4s ease-out" }}
          >
            {MOCK_TIPS[tipIndex]}
          </p>
        </div>

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}</style>
      </div>
    </AutoClipLayout>
  );
};
