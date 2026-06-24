import React, { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, Play, Check, Loader2, Plus } from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { toast } from "../../../stores/notification-store";
import {
  getTranscriptionService,
  initializeTranscriptionService,
  type TranscriptWord,
  type Subtitle,
} from "@openreel/core";
import { OPENREEL_TRANSCRIBE_URL } from "../../../config/api-endpoints";
import {
  extractHighlights,
  extractHighlightsWithGemini,
  type HighlightResult,
  type HighlightPreferences,
} from "../../../services/highlight-service";
import { useBackgroundTaskStore } from "../../../stores/background-task-store";

interface HighlightExtractorPanelProps {
  clipId: string;
}

// Module-level caches to store highlights and selection per clip to survive unmounts/selection changes
const highlightsCache = new Map<string, HighlightResult[]>();
const selectedCache = new Map<string, Set<number>>();

export const HighlightExtractorPanel: React.FC<HighlightExtractorPanelProps> = React.memo(({
  clipId,
}) => {
  const clipIdRef = useRef(clipId);
  useEffect(() => {
    clipIdRef.current = clipId;
  }, [clipId]);

  const [highlights, setHighlightsInternal] = useState<HighlightResult[]>(() => {
    return highlightsCache.get(clipId) || [];
  });
  const [selected, setSelectedInternal] = useState<Set<number>>(() => {
    return selectedCache.get(clipId) || new Set();
  });

  const setHighlights = useCallback((newVal: HighlightResult[] | ((prev: HighlightResult[]) => HighlightResult[])) => {
    setHighlightsInternal((prev) => {
      const next = typeof newVal === "function" ? newVal(prev) : newVal;
      highlightsCache.set(clipIdRef.current, next);
      return next;
    });
  }, []);

  const setSelected = useCallback((newVal: Set<number> | ((prev: Set<number>) => Set<number>)) => {
    setSelectedInternal((prev) => {
      const next = typeof newVal === "function" ? newVal(prev) : newVal;
      selectedCache.set(clipIdRef.current, next);
      return next;
    });
  }, []);

  useEffect(() => {
    setHighlightsInternal(highlightsCache.get(clipId) || []);
    setSelectedInternal(selectedCache.get(clipId) || new Set());
  }, [clipId]);

  const [phase, setPhase] = useState("");
  const [progress, setProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geminiApiKey, setGeminiApiKey] = useState(() => localStorage.getItem("openreel:gemini_api_key") || "");

  const abortRef = useRef<AbortController | null>(null);

  const addTask = useBackgroundTaskStore((s) => s.addTask);
  const updateTask = useBackgroundTaskStore((s) => s.updateTask);
  const completeTask = useBackgroundTaskStore((s) => s.completeTask);
  const failTask = useBackgroundTaskStore((s) => s.failTask);
  const cancelTask = useBackgroundTaskStore((s) => s.cancelTask);

  const project = useProjectStore((s) => s.project);
  const getMediaItem = useProjectStore((s) => s.getMediaItem);
  const setPlayheadPosition = useTimelineStore((s) => s.setPlayheadPosition);

  const [preferences, setPreferences] = useState<HighlightPreferences>({
    targetClipCount: 5,
    minClipDuration: 5,
    maxClipDuration: 60,
    contentType: "video",
  });

  const handleAnalyze = useCallback(async () => {
    if (!project) return;

    const clip = project.timeline.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === clipId);
    if (!clip) return;

    const mediaItem = getMediaItem(clip.mediaId);
    if (!mediaItem?.blob) {
      setError("Media not found or not loaded");
      return;
    }

    const abortController = new AbortController();
    abortRef.current = abortController;

    const taskId = addTask({
      id: `highlight-extract-${clipId}`,
      name: "AI Highlight Extractor",
      description: "Analyzing audio and transcript for best moments",
      progress: 0,
      message: "Initializing...",
      cancel: () => abortController.abort(),
    });

    setIsProcessing(true);
    setError(null);
    setHighlights([]);

    try {
      let transcript: TranscriptWord[] = [];

      // Check if there are already subtitles on the timeline that overlap with this clip's range
      const captionsTrack = project.timeline.tracks.find(
        (t) => t.type === "text" && t.name === "Captions"
      );
      const allTextClips = useProjectStore.getState().getAllTextClips();
      const allSubtitles: Subtitle[] = captionsTrack
        ? allTextClips
            .filter((tc) => tc.trackId === captionsTrack.id)
            .map((tc) => ({
              id: tc.id,
              text: tc.text,
              startTime: tc.startTime,
              endTime: tc.startTime + tc.duration,
              words: (tc.metadata?.words as any) || [],
            }))
        : [];

      const clipSubtitles = allSubtitles.filter(
        (sub: Subtitle) => sub.startTime < clip.startTime + clip.duration - 0.05 && sub.endTime > clip.startTime + 0.05
      );

      if (clipSubtitles.length > 0) {
        setPhase("Using existing subtitles...");
        setProgress(10);
        updateTask(taskId, { progress: 10, message: "Using existing subtitles..." });
        transcript = clipSubtitles.flatMap((sub: Subtitle) => {
          const startRel = Math.max(clip.inPoint, sub.startTime - clip.startTime + clip.inPoint);
          const endRel = Math.min(clip.inPoint + clip.duration, sub.endTime - clip.startTime + clip.inPoint);
          return sub.words && sub.words.length > 0
            ? sub.words.map((w: any) => ({
                text: w.text,
                start: Math.max(clip.inPoint, w.startTime - clip.startTime + clip.inPoint),
                end: Math.min(clip.inPoint + clip.duration, w.endTime - clip.startTime + clip.inPoint),
              }))
            : [{ text: sub.text, start: startRel, end: endRel }];
        });
      } else {
        setPhase("Transcribing audio...");
        setProgress(5);
        updateTask(taskId, { progress: 5, message: "Transcribing audio..." });

        const transcriptionService = getTranscriptionService() || initializeTranscriptionService({
          apiEndpoint: `${OPENREEL_TRANSCRIBE_URL}/transcribe`,
        });
        const subtitles = await transcriptionService.transcribeClip(
          clip,
          mediaItem,
          (p) => {
            if (abortController.signal.aborted) return;
            const prog = Math.round(p.progress * 20);
            setProgress(prog);
            updateTask(taskId, { progress: prog, message: p.message });
          },
        );

        transcript = subtitles.flatMap((sub) => {
          const startRel = Math.max(clip.inPoint, sub.startTime - clip.startTime + clip.inPoint);
          const endRel = Math.min(clip.inPoint + clip.duration, sub.endTime - clip.startTime + clip.inPoint);
          return sub.words && sub.words.length > 0
            ? sub.words.map((w) => ({
                text: w.text,
                start: Math.max(clip.inPoint, w.startTime - clip.startTime + clip.inPoint),
                end: Math.min(clip.inPoint + clip.duration, w.endTime - clip.startTime + clip.inPoint),
              }))
            : [{ text: sub.text, start: startRel, end: endRel }];
        });
      }

      if (transcript.length === 0) {
        throw new Error("No transcript words found. Please generate auto-captions first or ensure the video has audio.");
      }

      if (abortController.signal.aborted) return;

      let results: HighlightResult[];
      if (geminiApiKey.trim()) {
        results = await extractHighlightsWithGemini(
          transcript,
          geminiApiKey,
          preferences,
          (phaseName, prog) => {
            if (abortController.signal.aborted) return;
            const total = 25 + Math.round(prog * 0.75);
            setPhase(phaseName);
            setProgress(total);
            updateTask(taskId, { progress: total, message: phaseName });
          }
        );
      } else {
        setPhase("Decoding audio...");
        setProgress(25);
        updateTask(taskId, { progress: 25, message: "Decoding audio..." });

        const arrayBuffer = await mediaItem.blob.arrayBuffer();
        const audioContext = new OfflineAudioContext(1, 44100, 44100);
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        results = await extractHighlights(
          audioBuffer,
          transcript,
          preferences,
          (phaseName, prog) => {
            if (abortController.signal.aborted) return;
            const total = 25 + Math.round(prog * 0.75);
            setPhase(phaseName);
            setProgress(total);
            updateTask(taskId, { progress: total, message: phaseName });
          },
        );
      }

      if (abortController.signal.aborted) return;

      setHighlights(results);
      setSelected(new Set(results.map((_, i) => i)));
      completeTask(taskId);
      toast.success("Highlights Found", `Found ${results.length} highlight moments`);
    } catch (err) {
      if ((err as Error)?.name === "AbortError" || abortRef.current?.signal.aborted) {
        cancelTask(taskId);
      } else {
        const errMsg = err instanceof Error ? err.message : "Analysis failed";
        failTask(taskId, errMsg);
        setError(errMsg);
      }
    } finally {
      setIsProcessing(false);
      setPhase("");
      setProgress(0);
      abortRef.current = null;
    }
  }, [clipId, project, getMediaItem, preferences, geminiApiKey, addTask, updateTask, completeTask, failTask, cancelTask]);

  const handleAppendHighlight = useCallback(
    async (highlight: HighlightResult) => {
      if (!project) return;

      const store = useProjectStore.getState();
      const originalTrack = project.timeline.tracks.find((t) =>
        t.clips.some((c) => c.id === clipId),
      );
      if (!originalTrack) {
        setError("Original track not found");
        return;
      }

      const originalClip = originalTrack.clips.find((c) => c.id === clipId);
      if (!originalClip) {
        setError("Original clip not found");
        return;
      }

      try {
        // 1. Find the maximum end time across all tracks to append at the end
        let insertTime = 0;
        for (const track of project.timeline.tracks) {
          for (const c of track.clips) {
            if (c.startTime + c.duration > insertTime) {
              insertTime = c.startTime + c.duration;
            }
          }
        }

        // 2. Add the clip at the end of the original track
        const addResult = await store.addClip(originalTrack.id, originalClip.mediaId, insertTime);
        if (!addResult.success) {
          throw new Error(addResult.error?.message || "Failed to add clip to timeline");
        }

        // 3. Find the newly added clip
        const projectAfter = useProjectStore.getState().project;
        const updatedTrack = projectAfter.timeline.tracks.find((t) => t.id === originalTrack.id);
        const newClip = updatedTrack?.clips.find(
          (c) => c.mediaId === originalClip.mediaId && Math.abs(c.startTime - insertTime) < 0.01
        );

        if (!newClip) {
          throw new Error("Failed to locate the appended clip on the timeline");
        }

        // 4. Trim the new clip to match the highlight's duration
        const trimResult = await store.trimClip(newClip.id, highlight.start, highlight.end);
        if (!trimResult.success) {
          throw new Error(trimResult.error?.message || "Failed to trim appended clip");
        }

        // 5. Copy and align subtitles that overlap with the highlight segment
        const captionsTrack = project.timeline.tracks.find(
          (t) => t.type === "text" && t.name === "Captions"
        );
        const allTextClips = useProjectStore.getState().getAllTextClips();
        const originalSubtitles: Subtitle[] = captionsTrack
          ? allTextClips
              .filter((tc) => tc.trackId === captionsTrack.id)
              .map((tc) => ({
                id: tc.id,
                text: tc.text,
                startTime: tc.startTime,
                endTime: tc.startTime + tc.duration,
                words: (tc.metadata?.words as any) || [],
              }))
          : [];
        for (const sub of originalSubtitles) {
          const relativeToSource = sub.startTime - originalClip.startTime + originalClip.inPoint;
          if (relativeToSource >= highlight.start && relativeToSource <= highlight.end) {
            const offset = relativeToSource - highlight.start;
            const newSubStart = insertTime + offset;
            const newSubEnd = newSubStart + (sub.endTime - sub.startTime);

            // Add the aligned subtitle
            await store.addSubtitle({
              ...sub,
              id: crypto.randomUUID(),
              startTime: newSubStart,
              endTime: newSubEnd,
            });
          }
        }

        toast.success("Clip Added", `Highlight clip "${highlight.title}" appended to timeline successfully`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to append highlight to timeline");
      }
    },
    [clipId, project]
  );

  const handlePreview = useCallback(
    (highlight: HighlightResult) => {
      setPlayheadPosition(highlight.start);
    },
    [setPlayheadPosition],
  );

  const toggleSelect = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <div className="space-y-1">
          <label className="text-[10px] text-text-secondary block">Gemini API Key</label>
          <input
            type="password"
            placeholder="Enter Gemini API Key..."
            value={geminiApiKey}
            onChange={(e) => {
              const val = e.target.value;
              setGeminiApiKey(val);
              localStorage.setItem("openreel:gemini_api_key", val);
            }}
            className="w-full px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-text-primary placeholder:text-text-muted"
          />
        </div>

        <div className="flex items-center gap-1.5">
          <label className="text-[10px] text-text-secondary">Clips</label>
          <input
            type="number"
            min={1}
            max={20}
            value={preferences.targetClipCount}
            onChange={(e) =>
              setPreferences((p) => ({ ...p, targetClipCount: parseInt(e.target.value) || 5 }))
            }
            className="w-10 px-1 py-0.5 text-[10px] bg-background-secondary border border-border rounded text-text-primary"
          />
          <label className="text-[10px] text-text-secondary">Min</label>
          <input
            type="number"
            min={1}
            max={preferences.maxClipDuration}
            value={preferences.minClipDuration}
            onChange={(e) =>
              setPreferences((p) => ({ ...p, minClipDuration: parseInt(e.target.value) || 5 }))
            }
            className="w-10 px-1 py-0.5 text-[10px] bg-background-secondary border border-border rounded text-text-primary"
          />
          <label className="text-[10px] text-text-secondary">Max</label>
          <input
            type="number"
            min={preferences.minClipDuration || 1}
            max={300}
            value={preferences.maxClipDuration}
            onChange={(e) =>
              setPreferences((p) => ({ ...p, maxClipDuration: parseInt(e.target.value) || 60 }))
            }
            className="w-10 px-1 py-0.5 text-[10px] bg-background-secondary border border-border rounded text-text-primary"
          />
          <span className="text-[10px] text-text-muted">s</span>
        </div>

        <button
          onClick={handleAnalyze}
          disabled={isProcessing}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50"
        >
          {isProcessing ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {phase} ({progress}%)
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Find Highlights
            </>
          )}
        </button>

        {error && (
          <p className="text-[10px] text-red-400">{error}</p>
        )}
      </div>

      {highlights.length > 0 && (
        <div className="space-y-1.5">
          {highlights.map((highlight, index) => {
            const normalizedScore = highlight.score > 10 ? highlight.score / 10 : highlight.score;
            return (
              <div
                key={index}
                className={`p-2 rounded border transition-colors cursor-pointer ${
                  selected.has(index)
                    ? "bg-primary/10 border-primary/30"
                    : "bg-background-tertiary border-transparent hover:border-border"
                }`}
                onClick={() => toggleSelect(index)}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-1.5">
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                        normalizedScore >= 8
                          ? "bg-green-500"
                          : normalizedScore >= 5
                            ? "bg-yellow-500"
                            : "bg-gray-500"
                      }`}
                    >
                      {Math.round(highlight.score)}
                    </div>
                    <span className="text-[10px] text-text-primary font-medium truncate max-w-[120px]">
                      {highlight.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={async (e) => {
                        e.stopPropagation();
                        await handleAppendHighlight(highlight);
                      }}
                      className="p-1 hover:bg-background-secondary rounded text-green-400 hover:text-green-300"
                      title="Add segment to timeline"
                    >
                      <Plus size={10} />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(highlight);
                      }}
                      className="p-1 hover:bg-background-secondary rounded"
                      title="Preview segment"
                    >
                      <Play size={10} className="text-text-muted" />
                    </button>
                    {selected.has(index) && (
                      <Check size={12} className="text-primary" />
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-text-muted">
                    {formatTime(highlight.start)} - {formatTime(highlight.end)}
                  </span>
                  <span className="text-[9px] text-text-muted italic truncate max-w-[120px]">
                    {highlight.reason}
                  </span>
                </div>
              </div>
            );
          })}

          <button
            onClick={async () => {
              const selectedHighlights = highlights
                .filter((_, i) => selected.has(i))
                .sort((a, b) => a.start - b.start);
              if (selectedHighlights.length === 0) return;

              const store = useProjectStore.getState();
              const proj = store.project;
              const originalTrack = proj.timeline.tracks.find((t) =>
                t.clips.some((c) => c.id === clipId),
              );
              if (!originalTrack) return;

              const clip = originalTrack.clips.find((c) => c.id === clipId);
              if (!clip) return;

              const clipStart = clip.startTime;
              const clipInPoint = clip.inPoint;

              const splitTimes: number[] = [];
              for (const h of selectedHighlights) {
                const hStartOnTimeline = clipStart + (h.start - clipInPoint);
                const hEndOnTimeline = clipStart + (h.end - clipInPoint);
                splitTimes.push(hStartOnTimeline);
                splitTimes.push(hEndOnTimeline);
              }

              const uniqueSplitTimes = [...new Set(splitTimes)]
                .sort((a, b) => a - b)
                .filter((t) => t > clipStart && t < clipStart + clip.duration);

              for (const splitTime of uniqueSplitTimes) {
                const currentProj = useProjectStore.getState().project;
                const track = currentProj.timeline.tracks.find((t) => t.id === originalTrack.id);
                if (!track) break;

                const clipAtTime = track.clips.find(
                  (c) => c.startTime < splitTime && c.startTime + c.duration > splitTime,
                );
                if (clipAtTime) {
                  await store.splitClip(clipAtTime.id, splitTime);
                }
              }

              const finalProj = useProjectStore.getState().project;
              const finalTrack = finalProj.timeline.tracks.find((t) => t.id === originalTrack.id);
              if (!finalTrack) return;

              const clipsToRemove = finalTrack.clips.filter((c) => {
                const cSourceStart = c.inPoint;
                const cSourceEnd = c.inPoint + c.duration;
                return !selectedHighlights.some(
                  (h) => h.start < cSourceEnd && h.end > cSourceStart,
                );
              });

              for (const c of clipsToRemove.sort((a, b) => b.startTime - a.startTime)) {
                await useProjectStore.getState().rippleDeleteClip(c.id);
              }
            }}
            disabled={selected.size === 0}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            <Check size={14} />
            Apply {selected.size} Highlight{selected.size !== 1 ? "s" : ""}
          </button>
        </div>
      )}
    </div>
  );
});

HighlightExtractorPanel.displayName = "HighlightExtractorPanel";

export default HighlightExtractorPanel;
