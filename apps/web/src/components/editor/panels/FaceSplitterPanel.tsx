import React, { useState, useCallback, useRef } from "react";
import { Scissors, Loader2, CheckCircle, Timer, X } from "lucide-react";
import { Slider, Checkbox, Label } from "@openreel/ui";
import { toast } from "../../../stores/notification-store";
import { getFaceSplitterBridge } from "../../../bridges/face-splitter-bridge";
import { useProjectStore } from "../../../stores/project-store";
import { getAutoReframeBridge } from "../../../bridges/auto-reframe-bridge";
import {
  useBackgroundTaskStore,
} from "../../../stores/background-task-store";

interface FaceSplitterPanelProps {
  clipId: string;
}

// Module-level task ID tracker per clipId so panel re-mounts can still show status
const runningTaskIds = new Map<string, string>();

export const FaceSplitterPanel: React.FC<FaceSplitterPanelProps> = React.memo(({ clipId }) => {
  const [minDuration, setMinDuration] = useState<number>(2.0);
  const [autoFocusFace, setAutoFocusFace] = useState(false);
  const [lastResult, setLastResult] = useState<{ splitsApplied: number } | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const addTask = useBackgroundTaskStore((s) => s.addTask);
  const updateTask = useBackgroundTaskStore((s) => s.updateTask);
  const completeTask = useBackgroundTaskStore((s) => s.completeTask);
  const failTask = useBackgroundTaskStore((s) => s.failTask);
  const cancelTask = useBackgroundTaskStore((s) => s.cancelTask);
  const tasks = useBackgroundTaskStore((s) => s.tasks);

  // Check if a task for this clip is already running
  const currentTaskId = runningTaskIds.get(clipId);
  const currentTask = currentTaskId ? tasks.find((t) => t.id === currentTaskId) : null;
  const isProcessing = currentTask?.status === "running";
  const progress = currentTask?.progress ?? 0;
  const progressMessage = currentTask?.message ?? "";

  const handleRunSplitter = useCallback(async () => {
    const store = useProjectStore.getState();
    const clip = store.getClip(clipId);
    if (!clip) {
      toast.error("Error", "Clip not found");
      return;
    }
    const originalTrackId = clip.trackId;
    const originalMediaId = clip.mediaId;
    const rangeStart = clip.startTime;
    const rangeEnd = clip.startTime + clip.duration;

    const abortController = new AbortController();
    abortRef.current = abortController;

    const taskId = addTask({
      id: `face-splitter-${clipId}`,
      name: "AI Face Scene Splitter",
      description: `Splitting clip by face orientation`,
      progress: 0,
      message: "Initializing...",
      cancel: () => {
        abortController.abort();
      },
    });
    runningTaskIds.set(clipId, taskId);
    setLastResult(null);

    try {
      const bridge = getFaceSplitterBridge();

      const result = await bridge.runFaceSplitter(clipId, minDuration, (prog, msg) => {
        if (abortController.signal.aborted) return;
        const scaledProgress = autoFocusFace ? Math.round(prog * 0.9) : prog;
        updateTask(taskId, { progress: scaledProgress, message: msg });
      });

      if (abortController.signal.aborted) return;

      if (!result.success) {
        throw new Error(result.error || "Failed to split clip");
      }

      if (autoFocusFace) {
        updateTask(taskId, { progress: 90, message: "Finding split clips on timeline..." });
        const updatedProject = useProjectStore.getState().project;
        if (updatedProject) {
          const splitClips = updatedProject.timeline.tracks
            .find(t => t.id === originalTrackId)
            ?.clips.filter(c =>
              c.mediaId === originalMediaId &&
              c.startTime >= rangeStart - 0.01 &&
              c.startTime + c.duration <= rangeEnd + 0.01
            ) || [];

          const sortedSplitClips = [...splitClips].sort((a, b) => a.startTime - b.startTime);

          if (sortedSplitClips.length > 0) {
            const autoReframeBridge = getAutoReframeBridge();
            for (let i = 0; i < sortedSplitClips.length; i++) {
              if (abortController.signal.aborted) return;
              const splitClip = sortedSplitClips[i];
              await autoReframeBridge.runAutoFocusFace(splitClip.id, (prog, msg) => {
                if (abortController.signal.aborted) return;
                const baseProgress = 90 + Math.round((i / sortedSplitClips.length) * 10);
                const subProgress = Math.round((prog / 100) * (10 / sortedSplitClips.length));
                updateTask(taskId, {
                  progress: baseProgress + subProgress,
                  message: `Clip ${i + 1}/${sortedSplitClips.length}: ${msg}`,
                });
              });
            }
          }
        }
      }

      setLastResult({ splitsApplied: result.splitsApplied });
      completeTask(taskId);
      runningTaskIds.delete(clipId);

      toast.success(
        "Face Splitter Completed",
        result.splitsApplied > 0
          ? `Successfully split into ${result.splitsApplied + 1} scenes${autoFocusFace ? " with Auto Focus Face applied" : ""}.`
          : `No splits required${autoFocusFace ? ", applied Auto Focus Face to the clip" : ""}.`
      );
    } catch (error) {
      if (abortController.signal.aborted) {
        cancelTask(taskId);
      } else {
        const errMsg = error instanceof Error ? error.message : "Unknown error occurred";
        failTask(taskId, errMsg);
        toast.error("Face Splitter Failed", errMsg);
      }
      runningTaskIds.delete(clipId);
    }
  }, [clipId, minDuration, autoFocusFace, addTask, updateTask, completeTask, failTask, cancelTask]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
    const taskId = runningTaskIds.get(clipId);
    if (taskId) {
      cancelTask(taskId);
      runningTaskIds.delete(clipId);
    }
  }, [clipId, cancelTask]);

  return (
    <div className="space-y-4">
      <div className="space-y-3">
        <p className="text-[10px] text-text-secondary leading-relaxed">
          Automatically detect faces and split this clip on the timeline whenever the speaker switches orientation (e.g. from frontal speaking, to side profile, or no face).
        </p>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 text-[10px] text-text-secondary">
              <Timer size={12} className="text-text-muted" />
              <span>Minimum Scene Duration</span>
            </div>
            <span className="text-[10px] text-text-muted font-mono font-bold">
              {minDuration.toFixed(1)}s
            </span>
          </div>
          <div className="pt-1">
            <Slider
              min={0}
              max={10}
              step={0.5}
              value={[minDuration]}
              onValueChange={(val) => setMinDuration(val[0])}
              disabled={isProcessing}
            />
          </div>
          <span className="text-[9px] text-text-muted block italic">
            Ensures that no split creates a clip shorter than this duration.
          </span>
        </div>

        <div className="flex items-center gap-2 p-2 bg-background-secondary rounded border border-border/20">
          <Checkbox
            id="face-splitter-autofocus"
            checked={autoFocusFace}
            onCheckedChange={(checked) => setAutoFocusFace(checked === true)}
            disabled={isProcessing}
          />
          <Label
            htmlFor="face-splitter-autofocus"
            className="flex items-center gap-1 cursor-pointer select-none text-[10px] font-medium text-text-secondary"
          >
            Auto Focus Face (Zoom & Center)
          </Label>
        </div>

        {/* Progress shown inline while panel is open — full status in BackgroundTaskIndicator */}
        {isProcessing && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-text-muted truncate max-w-[75%]">{progressMessage}</span>
              <div className="flex items-center gap-2">
                <span className="text-text-muted font-mono">{progress}%</span>
                <button
                  onClick={handleCancel}
                  title="Cancel"
                  className="text-text-muted hover:text-red-400 transition-colors"
                >
                  <X size={10} />
                </button>
              </div>
            </div>
            <div className="h-1 bg-background-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[9px] text-primary/70 italic">
              Processing in background — you can continue editing
            </p>
          </div>
        )}

        {lastResult !== null && !isProcessing && (
          <div className="p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 text-[10px] text-green-400 space-y-1 flex items-start gap-2">
            <CheckCircle size={14} className="mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-text-primary">Split execution complete</p>
              <p className="text-text-secondary">
                {lastResult.splitsApplied > 0
                  ? `Timeline updated: clip was split into ${lastResult.splitsApplied + 1} sections.`
                  : "Analysis finished: no transitions detected matching the duration filter."}
              </p>
            </div>
          </div>
        )}

        <button
          onClick={handleRunSplitter}
          disabled={isProcessing}
          className="w-full py-2 rounded text-[11px] font-semibold transition-all flex items-center justify-center gap-2 bg-primary hover:bg-primary/90 disabled:bg-primary/50 text-white shadow-sm cursor-pointer disabled:cursor-not-allowed mt-2"
        >
          {isProcessing ? (
            <>
              <Loader2 size={13} className="animate-spin" />
              <span>Analyzing Video...</span>
            </>
          ) : (
            <>
              <Scissors size={13} />
              <span>Run Face Splitter</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
});

FaceSplitterPanel.displayName = "FaceSplitterPanel";
