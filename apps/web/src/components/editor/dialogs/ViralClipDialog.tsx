import React, { useState } from "react";
import { Sparkles, Clock, Flame, Loader2, AlertTriangle, Play, Check } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Button,
  Slider,
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@openreel/ui";
import { useViralClipStore } from "../../../stores/viral-clip-store";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { loadMediaBlob } from "../../../services/media-storage";
import { loadAudioBuffer } from "../../../utils/load-audio-buffer";
import { toast } from "../../../stores/notification-store";
import type { TranscriptWord, Subtitle } from "@openreel/core";

export const ViralClipDialog: React.FC = () => {
  const {
    isDialogOpen,
    setDialogOpen,
    highlights,
    isAnalyzing,
    progress,
    error,
    preferences,
    setPreferences,
    runAnalysis,
  } = useViralClipStore();

  const project = useProjectStore((state) => state.project);
  const { trimClip, moveClip, updateSettings } = useProjectStore();
  const seekTo = useTimelineStore((state) => state.seekTo);

  const [localPreferences, setLocalPrefs] = useState(preferences);
  const [createdClips, setCreatedClips] = useState<Record<number, boolean>>({});

  const handlePreferenceChange = (key: keyof typeof preferences, value: any) => {
    const updated = { ...localPreferences, [key]: value };
    setLocalPrefs(updated);
    setPreferences(updated);
  };

  const handleStartAnalysis = async () => {
    // 1. Get the first video or audio clip in the timeline
    const clips = project.timeline.tracks
      .filter((t) => t.type === "video" || t.type === "audio")
      .flatMap((t) => t.clips);

    if (clips.length === 0) {
      toast.error("Analysis Failed", "Please add a video or audio clip to the timeline first.");
      return;
    }

    const mainClip = clips[0];

    // 2. Extract transcript words from subtitles
    const captionsTrack = project.timeline.tracks.find(
      (t) => t.type === "text" && t.name === "Captions"
    );
    const allTextClips = useProjectStore.getState().getAllTextClips();
    const subtitles = captionsTrack
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

    if (subtitles.length === 0) {
      toast.error(
        "Subtitles Required",
        "Please generate subtitles / transcription first in the Captions panel."
      );
      return;
    }

    const transcriptWords: TranscriptWord[] = subtitles
      .flatMap((sub: Subtitle) =>
        (sub.words || []).map((w: any) => ({
          text: w.text,
          start: w.startTime,
          end: w.endTime,
        }))
      )
      .sort((a, b) => a.start - b.start);

    if (transcriptWords.length === 0) {
      toast.error(
        "Subtitles Empty",
        "No word-level timing data found. Please run transcription again with Whisper."
      );
      return;
    }

    try {
      // 3. Load the media blob
      const blob = await loadMediaBlob(mainClip.mediaId);
      if (!blob) {
        toast.error("Media Error", "Could not load the media source file.");
        return;
      }

      // 4. Decode audio
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = await loadAudioBuffer(audioCtx, blob, {
        onProgress: () => {
          // Can log decoding progress if needed
        },
      });

      if (!audioBuffer) {
        toast.error("Audio Decoding Error", "Failed to extract audio from the media clip.");
        return;
      }

      // 5. Run analysis
      await runAnalysis(audioBuffer, transcriptWords);
    } catch (err) {
      console.error(err);
      toast.error("Analysis Error", err instanceof Error ? err.message : "Failed to run viral clip analysis.");
    }
  };

  const handleCreateClip = async (highlightIndex: number, start: number, end: number) => {
    const clips = project.timeline.tracks
      .filter((t) => t.type === "video" || t.type === "audio")
      .flatMap((t) => t.clips);

    if (clips.length === 0) return;
    const mainClip = clips[0];

    try {
      // 1. Set project format to Vertical 9:16 (1080x1920)
      await updateSettings({
        width: 1080,
        height: 1920,
      });

      // 2. Trim clip to highlight range
      await trimClip(mainClip.id, start, end);

      // 3. Move clip start to 0
      await moveClip(mainClip.id, 0);

      // 4. Seek playhead to start
      seekTo(0);

      setCreatedClips((prev) => ({ ...prev, [highlightIndex]: true }));
      toast.success(
        "Viral Clip Created",
        "Timeline adjusted to the highlight range and aspect ratio set to 9:16 portrait."
      );

      // Close dialog
      setDialogOpen(false);
    } catch (err) {
      toast.error("Failed to Create Clip", err instanceof Error ? err.message : "An error occurred.");
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-emerald-400 bg-emerald-400/10 border-emerald-400/20";
    if (score >= 70) return "text-amber-400 bg-amber-400/10 border-amber-400/20";
    return "text-blue-400 bg-blue-400/10 border-blue-400/20";
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setDialogOpen}>
      <DialogContent className="max-w-3xl max-h-[85vh] p-0 bg-background-secondary border-border flex flex-col overflow-hidden">
        <DialogHeader className="p-6 border-b border-border bg-background-tertiary">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg text-primary">
              <Sparkles size={20} />
            </div>
            <div>
              <DialogTitle className="text-lg font-bold text-text-primary">
                AI Viral Clip Detector
              </DialogTitle>
              <DialogDescription className="text-xs text-text-muted mt-1">
                Scan your timeline using audio energy and transcripts to find the most engaging and viral-ready clips.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isAnalyzing ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-4">
            <Loader2 className="w-12 h-12 text-primary animate-spin" />
            <div className="space-y-1">
              <p className="text-sm font-medium text-text-primary">
                {progress?.message || "Analyzing timeline..."}
              </p>
              <p className="text-xs text-text-muted">
                Phase: {progress?.phase || "extracting"} ({progress?.percent || 0}%)
              </p>
            </div>
            <div className="w-64 h-1.5 bg-background-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress?.percent || 0}%` }}
              />
            </div>
          </div>
        ) : highlights.length > 0 ? (
          <div className="flex-1 flex overflow-hidden">
            {/* Left side: Clip details / options */}
            <div className="flex-1 flex flex-col overflow-hidden p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                  <Flame size={16} className="text-orange-500" />
                  Recommended Highlights ({highlights.length})
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => useViralClipStore.getState().clearResults()}
                  className="text-xs border-border hover:bg-background-tertiary"
                >
                  Reset
                </Button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-3 pr-2">
                {highlights.map((hl, index) => (
                  <div
                    key={index}
                    className="p-4 rounded-xl border border-border bg-background-tertiary hover:border-border-hover transition-all flex items-start justify-between gap-4"
                  >
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${getScoreColor(
                            hl.score
                          )}`}
                        >
                          Score: {hl.score}
                        </span>
                        <span className="text-[11px] text-text-secondary flex items-center gap-1">
                          <Clock size={12} className="text-text-muted" />
                          {hl.start.toFixed(1)}s - {hl.end.toFixed(1)}s ({(hl.end - hl.start).toFixed(1)}s)
                        </span>
                      </div>
                      <h4 className="font-semibold text-sm text-text-primary">{hl.title}</h4>
                      <p className="text-xs text-text-muted leading-relaxed">{hl.reason}</p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleCreateClip(index, hl.start, hl.end)}
                      className="shrink-0 flex items-center gap-1.5"
                    >
                      {createdClips[index] ? (
                        <>
                          <Check size={14} />
                          Created
                        </>
                      ) : (
                        <>
                          <Play size={14} fill="currentColor" />
                          Create Clip
                        </>
                      )}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden">
            {/* Preferences Column */}
            <div className="w-1/2 border-r border-border p-6 space-y-6 overflow-y-auto">
              <h3 className="text-sm font-semibold text-text-primary">Detection Parameters</h3>

              <div className="space-y-2">
                <label className="text-xs text-text-secondary font-medium">Content Type</label>
                <Select
                  value={localPreferences.contentType}
                  onValueChange={(v) => handlePreferenceChange("contentType", v)}
                >
                  <SelectTrigger className="w-full bg-background-tertiary border-border text-text-primary text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background-secondary border-border">
                    <SelectItem value="video">Standard Video</SelectItem>
                    <SelectItem value="podcast">Podcast / Interview</SelectItem>
                    <SelectItem value="tutorial">Tutorial / Screen Recording</SelectItem>
                    <SelectItem value="vlog">Vlog / Casual Talk</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-text-secondary font-medium">Target Clip Count</label>
                  <span className="text-xs font-mono text-text-muted">{localPreferences.targetClipCount}</span>
                </div>
                <Slider
                  value={[localPreferences.targetClipCount]}
                  onValueChange={(v) => handlePreferenceChange("targetClipCount", v[0])}
                  min={1}
                  max={10}
                  step={1}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-text-secondary font-medium">Min Duration (seconds)</label>
                  <span className="text-xs font-mono text-text-muted">{localPreferences.minClipDuration}s</span>
                </div>
                <Slider
                  value={[localPreferences.minClipDuration]}
                  onValueChange={(v) => handlePreferenceChange("minClipDuration", v[0])}
                  min={3}
                  max={30}
                  step={1}
                />
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-text-secondary font-medium">Max Duration (seconds)</label>
                  <span className="text-xs font-mono text-text-muted">{localPreferences.maxClipDuration}s</span>
                </div>
                <Slider
                  value={[localPreferences.maxClipDuration]}
                  onValueChange={(v) => handlePreferenceChange("maxClipDuration", v[0])}
                  min={15}
                  max={120}
                  step={5}
                />
              </div>
            </div>

            {/* Analysis Call to Action */}
            <div className="w-1/2 p-6 flex flex-col justify-between bg-background-tertiary/20">
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-text-primary">Ready to Scan</h3>
                <p className="text-xs text-text-muted leading-relaxed">
                  Openreel will extract the audio content of your first timeline clip, correlate vocal energy peaks with word transcript semantic importance, and find segments that hook viewers immediately.
                </p>

                <div className="p-3 bg-amber-400/5 border border-amber-400/10 rounded-lg flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-[11px] text-amber-400 leading-normal">
                    This feature works on the cloud server. Make sure you have an active internet connection and have already run subtitle generation.
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg text-[11px] text-red-400 leading-normal">
                    ❌ {error}
                  </div>
                )}
              </div>

              <Button onClick={handleStartAnalysis} className="w-full mt-4 flex items-center justify-center gap-2">
                <Sparkles size={16} />
                Scan Video for Highlights
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
};
