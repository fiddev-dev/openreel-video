/**
 * ProcessingSteps — animated progress indicator for the auto-clip pipeline.
 * Shows all pipeline steps with their current status.
 */
import { CheckCircle2, Loader2, Circle, AlertCircle } from "lucide-react";
import type { ProcessingStep } from "../../stores/auto-clip-store";

interface Step {
  key: ProcessingStep;
  label: string;
  description: string;
}

export const PIPELINE_STEPS: Step[] = [
  { key: "upload", label: "Upload", description: "Uploading your video" },
  { key: "create-project", label: "Create project", description: "Initializing workspace" },
  { key: "process-video", label: "Process video", description: "Analyzing video frames" },
  { key: "transcribe", label: "Transcribe", description: "Converting speech to text" },
  { key: "find-clips", label: "Find best parts", description: "Scoring viral potential" },
  { key: "edit-clips", label: "Edit clips", description: "Applying your settings" },
  { key: "finalize", label: "Finalize", description: "Preparing your clips" },
];

interface ProcessingStepsProps {
  stepProgress: Record<ProcessingStep, "pending" | "active" | "done" | "error">;
  progress: number;
}

export const ProcessingSteps: React.FC<ProcessingStepsProps> = ({
  stepProgress,
  progress,
}) => {
  return (
    <div className="flex flex-col gap-1">
      {PIPELINE_STEPS.map((step, idx) => {
        const status = stepProgress[step.key];
        return (
          <div
            key={step.key}
            className={`
              flex items-center gap-3 p-3 rounded-xl transition-all duration-300
              ${status === "active" ? "bg-[var(--accent-soft)]" : ""}
            `}
          >
            {/* Status icon */}
            <div className="w-5 h-5 flex items-center justify-center flex-shrink-0">
              {status === "done" && (
                <CheckCircle2 size={18} className="text-[var(--accent)]" />
              )}
              {status === "active" && (
                <Loader2 size={18} className="text-[var(--accent)] animate-spin" />
              )}
              {status === "pending" && (
                <Circle size={18} className="text-[var(--fg-muted)]" />
              )}
              {status === "error" && (
                <AlertCircle size={18} className="text-red-400" />
              )}
            </div>

            {/* Step info */}
            <div className="flex-1 min-w-0">
              <p
                className={`text-sm font-medium transition-colors duration-200 ${
                  status === "done"
                    ? "text-[var(--accent)]"
                    : status === "active"
                    ? "text-[var(--fg)]"
                    : "text-[var(--fg-muted)]"
                }`}
              >
                {step.label}
              </p>
              {status === "active" && (
                <p className="text-xs text-[var(--fg-3)] mt-0.5 animate-pulse">
                  {step.description}...
                </p>
              )}
            </div>

            {/* Step number */}
            <span className="text-xs text-[var(--fg-muted)] font-mono">
              {String(idx + 1).padStart(2, "0")}
            </span>
          </div>
        );
      })}

      {/* Overall progress bar */}
      <div className="mt-4">
        <div className="flex justify-between text-xs text-[var(--fg-3)] mb-2">
          <span>Overall progress</span>
          <span className="font-mono font-semibold text-[var(--accent)]">{progress}%</span>
        </div>
        <div className="h-2 bg-[var(--bg-3)] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[var(--accent)] to-emerald-400 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
