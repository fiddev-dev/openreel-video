import React, { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { Languages, AlertCircle, Captions, Loader2, Sparkles, Volume2, Video, FileText, CheckCircle } from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import { useUIStore } from "../../../stores/ui-store";
import {
  initializeTranscriptionService,
  disposeTranscriptionService,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
} from "@openreel/core";
import type {
  CaptionAnimationStyle,
  WhisperTranscriptionProgress,
} from "@openreel/core";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@openreel/ui";
import { OPENREEL_TRANSCRIBE_URL } from "../../../config/api-endpoints";

const CAPTION_STYLE_PRESETS = [
  {
    id: "default",
    name: "Default",
    description: "White text on dark background",
  },
  { id: "modern", name: "Modern", description: "Clean, minimal style" },
  { id: "bold", name: "Bold", description: "Large, impactful text" },
  { id: "cinematic", name: "Cinematic", description: "Film-style captions" },
  { id: "minimal", name: "Minimal", description: "Subtle, understated" },
];

const WHISPER_LANGUAGES = [
  { code: "auto", name: "Auto-Detect Language" },
  { code: "en", name: "English" },
  { code: "id", name: "Indonesian" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "sv", name: "Swedish" },
];

const TARGET_LANGUAGES = [
  { code: "none", name: "Original (no translation)" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "pt", name: "Portuguese" },
  { code: "it", name: "Italian" },
  { code: "nl", name: "Dutch" },
  { code: "ru", name: "Russian" },
  { code: "zh", name: "Chinese" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "ar", name: "Arabic" },
  { code: "hi", name: "Hindi" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "sv", name: "Swedish" },
];

export const AutoCaptionPanel: React.FC = () => {
  const project = useProjectStore((state) => state.project);
  const getClip = useProjectStore((state) => state.getClip);
  const getMediaItem = useProjectStore((state) => state.getMediaItem);
  const addSubtitle = useProjectStore((state) => state.addSubtitle);
  const applySubtitleStylePreset = useProjectStore(
    (state) => state.applySubtitleStylePreset,
  );

  const selectedItems = useUIStore((state) => state.selectedItems);

  // Get all audio and video clips from the timeline
  const timelineClips = useMemo(() => {
    const clipsList: { id: string; name: string; type: "video" | "audio"; duration: number }[] = [];
    project.timeline.tracks.forEach((track) => {
      if (track.type === "video" || track.type === "audio") {
        track.clips.forEach((clip) => {
          const mediaItem = getMediaItem(clip.mediaId);
          clipsList.push({
            id: clip.id,
            name: mediaItem?.name || `Clip (${track.type})`,
            type: track.type as "video" | "audio",
            duration: clip.duration,
          });
        });
      }
    });
    return clipsList;
  }, [project.timeline.tracks, getMediaItem]);

  // Determine if a clip is currently selected on the timeline
  const selectedClipIdFromTimeline = useMemo(() => {
    const clipItem = selectedItems.find((item) => item.type === "clip");
    if (!clipItem) return null;
    return timelineClips.some((c) => c.id === clipItem.id) ? clipItem.id : null;
  }, [selectedItems, timelineClips]);

  const [selectedClipId, setSelectedClipId] = useState<string>("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState<WhisperTranscriptionProgress | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("auto");
  const [targetLanguage, setTargetLanguage] = useState("none");
  const [selectedStyle, setSelectedStyle] = useState("default");
  const [defaultAnimationStyle, setDefaultAnimationStyle] = useState<CaptionAnimationStyle>("word-highlight");
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number | null>(null);

  const lastSelectedRef = useRef<string | null>(null);

  // Sync state with timeline selection
  useEffect(() => {
    if (selectedClipIdFromTimeline && selectedClipIdFromTimeline !== lastSelectedRef.current) {
      setSelectedClipId(selectedClipIdFromTimeline);
      lastSelectedRef.current = selectedClipIdFromTimeline;
    } else if (timelineClips.length > 0 && !selectedClipId) {
      setSelectedClipId(timelineClips[0].id);
    }
  }, [selectedClipIdFromTimeline, timelineClips, selectedClipId]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      disposeTranscriptionService();
    };
  }, []);

  const handleGenerateCaptions = useCallback(async () => {
    if (!selectedClipId || isTranscribing) return;
    setError(null);
    setSuccessCount(null);

    const clip = getClip(selectedClipId);
    if (!clip) {
      setError("Selected clip not found");
      return;
    }

    const mediaItem = getMediaItem(clip.mediaId);
    if (!mediaItem) {
      setError("Media source file not found for the selected clip");
      return;
    }

    setIsTranscribing(true);
    setProgress({
      phase: "extracting",
      progress: 0,
      message: "Extracting audio from clip...",
    });

    try {
      const transcriptionService = initializeTranscriptionService({
        apiEndpoint: `${OPENREEL_TRANSCRIBE_URL}/transcribe`,
        language: selectedLanguage !== "auto" ? selectedLanguage : undefined,
        targetLanguage: targetLanguage !== "none" ? targetLanguage : undefined,
      });

      const subtitles = await transcriptionService.transcribeClip(
        clip,
        mediaItem,
        setProgress,
      );

      for (const subtitle of subtitles) {
        addSubtitle({
          ...subtitle,
          animationStyle: defaultAnimationStyle,
        });
      }

      if (selectedStyle !== "default") {
        await applySubtitleStylePreset(selectedStyle);
      }

      setSuccessCount(subtitles.length);
      setProgress({
        phase: "complete",
        progress: 100,
        message: `Generated ${subtitles.length} subtitles`,
      });

      setTimeout(() => {
        setProgress(null);
        setIsTranscribing(false);
      }, 3000);

    } catch (err) {
      console.error("[AutoCaptionPanel] Transcription failed:", err);
      setError(err instanceof Error ? err.message : "Transcription failed");
      setProgress({
        phase: "error",
        progress: 0,
        message: err instanceof Error ? err.message : "Transcription failed",
      });
      setTimeout(() => {
        setProgress(null);
        setIsTranscribing(false);
      }, 4000);
    } finally {
      disposeTranscriptionService();
    }
  }, [
    selectedClipId,
    isTranscribing,
    selectedLanguage,
    targetLanguage,
    defaultAnimationStyle,
    selectedStyle,
    getClip,
    getMediaItem,
    addSubtitle,
    applySubtitleStylePreset,
  ]);

  if (timelineClips.length === 0) {
    return (
      <div className="p-5 text-center space-y-4 bg-background-tertiary rounded-xl border border-border">
        <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
          <Volume2 size={24} />
        </div>
        <div className="space-y-1">
          <span className="text-[12px] font-semibold text-text-primary block">
            No Audio/Video Clips Found
          </span>
          <p className="text-[10px] text-text-muted max-w-xs mx-auto leading-relaxed">
            Auto-captioning requires at least one video or audio clip on the timeline. Upload and drag media files to the timeline first.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full">
      {/* Header Banner */}
      <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent rounded-lg border border-primary/20">
        <div className="p-1.5 bg-primary/10 rounded-md">
          <Captions size={16} className="text-primary" />
        </div>
        <div>
          <span className="text-[11px] font-semibold text-text-primary block">
            AI Auto-Captions
          </span>
          <p className="text-[9px] text-text-muted">
            Transcribe media clips into animated subtitles
          </p>
        </div>
      </div>

      <div className="space-y-3 p-3 bg-background-tertiary rounded-lg border border-border/50">
        {/* Select Clip */}
        <div className="space-y-1">
          <div className="flex justify-between items-center">
            <label className="text-[10px] font-medium text-text-secondary">
              Select Timeline Clip
            </label>
            {selectedClipIdFromTimeline && (
              <span className="text-[9px] bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">
                Active Selection
              </span>
            )}
          </div>
          <Select
            value={selectedClipId}
            onValueChange={setSelectedClipId}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-full bg-background-secondary border-border text-text-primary text-[10px] h-8">
              <SelectValue placeholder="Select a clip to transcribe" />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {timelineClips.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  <div className="flex items-center gap-1.5 truncate">
                    {c.type === "video" ? (
                      <Video size={11} className="text-primary shrink-0" />
                    ) : (
                      <Volume2 size={11} className="text-blue-400 shrink-0" />
                    )}
                    <span className="truncate">{c.name}</span>
                    <span className="text-[9px] text-text-muted">({c.duration.toFixed(1)}s)</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Original Language */}
        <div className="flex items-center justify-between gap-4 pt-1">
          <div className="flex items-center gap-1.5">
            <Languages size={13} className="text-text-secondary" />
            <span className="text-[10px] text-text-secondary">Original Lang</span>
          </div>
          <Select
            value={selectedLanguage}
            onValueChange={setSelectedLanguage}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-auto min-w-[130px] bg-background-secondary border-border text-text-primary text-[10px] h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {WHISPER_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Target Language */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-text-secondary" />
            <span className="text-[10px] text-text-secondary">Translation</span>
          </div>
          <Select
            value={targetLanguage}
            onValueChange={setTargetLanguage}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-auto min-w-[130px] bg-background-secondary border-border text-text-primary text-[10px] h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {TARGET_LANGUAGES.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>
                  {lang.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Caption Style */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <FileText size={13} className="text-text-secondary" />
            <span className="text-[10px] text-text-secondary">Style Preset</span>
          </div>
          <Select
            value={selectedStyle}
            onValueChange={setSelectedStyle}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-auto min-w-[130px] bg-background-secondary border-border text-text-primary text-[10px] h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {CAPTION_STYLE_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Animation Style */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <Sparkles size={13} className="text-text-secondary" />
            <span className="text-[10px] text-text-secondary">Animation</span>
          </div>
          <Select
            value={defaultAnimationStyle}
            onValueChange={(v) => setDefaultAnimationStyle(v as CaptionAnimationStyle)}
            disabled={isTranscribing}
          >
            <SelectTrigger className="w-auto min-w-[130px] bg-background-secondary border-border text-text-primary text-[10px] h-7">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {CAPTION_ANIMATION_STYLES.map((style) => (
                <SelectItem key={style} value={style}>
                  {getAnimationStyleDisplayName(style)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-2.5 bg-red-500/10 border border-red-500/20 rounded-lg">
          <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
          <span className="text-[9px] text-red-400 leading-normal">{error}</span>
        </div>
      )}

      {/* Success Message */}
      {successCount !== null && (
        <div className="flex items-center gap-2 p-2.5 bg-green-500/10 border border-green-500/20 rounded-lg">
          <CheckCircle size={14} className="text-green-400 shrink-0" />
          <span className="text-[9px] text-green-400">
            Successfully generated and added {successCount} subtitles to timeline!
          </span>
        </div>
      )}

      {/* Progress Indicator */}
      {isTranscribing && progress && (
        <div className="space-y-2 p-3 bg-background-tertiary rounded-lg border border-border/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Loader2 size={12} className="animate-spin text-primary" />
              <span className="text-[10px] text-text-primary font-medium">
                {progress.message}
              </span>
            </div>
            <span className="text-[10px] text-text-muted font-mono">{progress.progress}%</span>
          </div>
          <div className="h-1.5 bg-background-secondary rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                progress.phase === "error"
                  ? "bg-red-500"
                  : progress.phase === "complete"
                    ? "bg-green-500"
                    : "bg-primary"
              }`}
              style={{ width: `${progress.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Trigger Button */}
      <button
        onClick={handleGenerateCaptions}
        disabled={isTranscribing || !selectedClipId}
        className="w-full py-2.5 bg-primary hover:bg-primary/80 disabled:bg-primary/50 text-black rounded-lg text-[11px] font-semibold transition-all flex items-center justify-center gap-2 disabled:cursor-not-allowed"
      >
        {isTranscribing ? (
          <>
            <Loader2 size={14} className="animate-spin" />
            Generating Captions...
          </>
        ) : (
          <>
            <Captions size={14} />
            Generate Subtitles from Clip
          </>
        )}
      </button>
    </div>
  );
};

export default AutoCaptionPanel;
