import React, { useState, useCallback } from "react";
import { Scissors, Loader2, CheckCircle, Timer } from "lucide-react";
import { Slider, Checkbox, Label } from "@openreel/ui";
import { toast } from "../../../stores/notification-store";
import { getFaceSplitterBridge } from "../../../bridges/face-splitter-bridge";
import { useProjectStore } from "../../../stores/project-store";
import { getAutoReframeBridge } from "../../../bridges/auto-reframe-bridge";

interface FaceSplitterPanelProps {
  clipId: string;
}

export const FaceSplitterPanel: React.FC<FaceSplitterPanelProps> = ({ clipId }) => {
  const [minDuration, setMinDuration] = useState<number>(2.0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [autoFocusFace, setAutoFocusFace] = useState(false);
  const [lastResult, setLastResult] = useState<{ splitsApplied: number } | null>(null);

  const handleRunSplitter = useCallback(async () => {
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage("Initializing...");
    setLastResult(null);

    const store = useProjectStore.getState();
    const clip = store.getClip(clipId);
    if (!clip) {
      toast.error("Error", "Clip not found");
      setIsProcessing(false);
      return;
    }
    const originalTrackId = clip.trackId;
    const originalMediaId = clip.mediaId;
    const rangeStart = clip.startTime;
    const rangeEnd = clip.startTime + clip.duration;

    try {
      const bridge = getFaceSplitterBridge();
      const result = await bridge.runFaceSplitter(clipId, minDuration, (prog, msg) => {
        // Map 0-100% of splitter to 0-90% if autofocus is enabled
        const scaledProgress = autoFocusFace ? Math.round(prog * 0.9) : prog;
        setProgress(scaledProgress);
        setProgressMessage(msg);
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to split clip");
      }

      if (autoFocusFace) {
        setProgress(90);
        setProgressMessage("Finding split clips on timeline...");
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
              const splitClip = sortedSplitClips[i];
              setProgressMessage(`Auto-focusing face on clip ${i + 1}/${sortedSplitClips.length}...`);
              await autoReframeBridge.runAutoFocusFace(splitClip.id, (prog, msg) => {
                const baseProgress = 90 + Math.round((i / sortedSplitClips.length) * 10);
                const subProgress = Math.round((prog / 100) * (10 / sortedSplitClips.length));
                setProgress(baseProgress + subProgress);
                setProgressMessage(`Clip ${i + 1}/${sortedSplitClips.length}: ${msg}`);
              });
            }
          }
        }
      }

      setLastResult({ splitsApplied: result.splitsApplied });
      toast.success(
        "Face Splitter Completed",
        result.splitsApplied > 0
          ? `Successfully split the clip into ${result.splitsApplied + 1} scenes on the timeline${autoFocusFace ? " and applied Auto Focus Face to all split clips" : ""}.`
          : `The clip is already optimized. No splits were required${autoFocusFace ? ", applied Auto Focus Face to the clip" : ""}.`
      );
    } catch (error) {
      console.error("Face Splitter failed:", error);
      toast.error(
        "Face Splitter Failed",
        error instanceof Error ? error.message : "Unknown error occurred"
      );
    } finally {
      setIsProcessing(false);
    }
  }, [clipId, minDuration, autoFocusFace]);

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

        {isProcessing && (
          <div className="space-y-1.5 pt-2">
            <div className="flex items-center justify-between text-[9px]">
              <span className="text-text-muted truncate max-w-[80%]">{progressMessage}</span>
              <span className="text-text-muted font-mono">{progress}%</span>
            </div>
            <div className="h-1 bg-background-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
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
};
