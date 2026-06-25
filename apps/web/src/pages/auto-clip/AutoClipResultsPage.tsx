/**
 * AutoClipResultsPage — Step 4: Browse, preview, and edit generated clips.
 * Left sidebar: numbered clip list. Right panel: selected clip detail.
 */
import { useState, useCallback, useEffect, useRef } from "react";
import {
  Star,
  Pencil,
  Download,
  Share2,
  Zap,
  Clock,
  Scissors,
  ChevronRight,
  RotateCcw,
  Sparkles,
  Loader2,
  KeyRound,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { AutoClipLayout } from "../../components/auto-clip/AutoClipLayout";
import { ClipCard } from "../../components/auto-clip/ClipCard";
import { useAutoClipStore } from "../../stores/auto-clip-store";
import { useRouter } from "../../hooks/use-router";
import { useProjectStore } from "../../stores/project-store";
import { useUIStore } from "../../stores/ui-store";
import { toast } from "../../stores/notification-store";
import {
  SOCIAL_MEDIA_PRESETS,
  type CaptionAnimationStyle,
  type Subtitle,
} from "@openreel/core";
import { getAutoReframeBridge } from "../../bridges/auto-reframe-bridge";
import { getFaceSplitterBridge } from "../../bridges/face-splitter-bridge";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function splitTextIntoSubtitles(
  text: string,
  startTime: number,
  endTime: number,
  animationStyle: CaptionAnimationStyle
): Subtitle[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  const maxWords = 5;
  const subtitles: Subtitle[] = [];
  const duration = endTime - startTime;
  const durationPerWord = duration / words.length;

  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords);
    const chunkStart = startTime + i * durationPerWord;
    const chunkEnd = startTime + (i + chunk.length) * durationPerWord;

    let chunkText = "";
    if (chunk.length <= 3) {
      chunkText = chunk.join(" ");
    } else {
      const line1 = chunk.slice(0, 3).join(" ");
      const line2 = chunk.slice(3).join(" ");
      chunkText = `${line1}\n${line2}`;
    }

    const chunkWords = chunk.map((w, idx) => ({
      text: w,
      startTime: chunkStart + idx * durationPerWord,
      endTime: chunkStart + (idx + 1) * durationPerWord,
    }));

    subtitles.push({
      id: Math.random().toString(36).substring(2, 9),
      text: chunkText,
      startTime: chunkStart,
      endTime: chunkEnd,
      animationStyle,
      style: {
        fontFamily: "Arial",
        fontSize: 38,
        color: "#ffffff",
        backgroundColor: "transparent",
        position: "bottom" as const,
      },
      words: chunkWords,
    });
  }

  return subtitles;
}

const ScoreMeter: React.FC<{ score: number }> = ({ score }) => {
  const pct = (score / 10) * 100;
  const color =
    score >= 9 ? "#22c55e" : score >= 7.5 ? "#eab308" : "#f97316";
  return (
    <div className="flex items-center gap-3">
      <span className="text-4xl font-black" style={{ color }}>
        {score.toFixed(1)}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-1 mb-1.5">
          <Star size={12} fill={color} style={{ color }} />
          <span className="text-xs font-semibold" style={{ color }}>
            Viral Score
          </span>
          <span className="text-xs text-[var(--fg-muted)]">/10</span>
        </div>
        <div className="h-2 bg-[var(--bg-3)] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${pct}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
};

interface EditingProgress {
  step: "importing" | "reframe" | "transcribe" | "broll" | "done" | "error";
  progress: number;
  message: string;
}

// ─── Auto B-Roll Helper ────────────────────────────────────────────────────────
async function applyAutoBRoll(
  _addedClip: any,
  _mediaId: string,
  store: any,
  setEditProgress: (prog: EditingProgress) => void,
  subtitles: Subtitle[]
) {
  const geminiApiKey = localStorage.getItem("openreel:gemini_api_key") || "";
  const pexelsApiKey = localStorage.getItem("openreel:pexels_api_key") || "";

  if (!geminiApiKey.trim() || !pexelsApiKey.trim()) {
    console.warn("Skipping auto B-Roll because API keys are not configured.");
    return;
  }

  if (subtitles.length === 0) {
    console.warn("No subtitles found to generate B-Roll concepts.");
    return;
  }

  // Format subtitles for Gemini API
  const formattedTranscript = subtitles
    .map((sub) => `[${(sub.startTime).toFixed(1)}s - ${(sub.endTime).toFixed(1)}s]: "${sub.text}"`)
    .join("\n");

  setEditProgress({
    step: "broll",
    progress: 10,
    message: "AI analyzing concepts from transcript...",
  });

  const prompt = `You are a professional video editor and B-Roll coordinator.
Analyze the following video transcript segments (which are 0-indexed relative to the video file starting at 0.0 seconds).

Identify key moments that would benefit significantly from visual overlays. Suggest B-roll concepts selectively (covers about 45-55% of total video duration).
Each concept must have:
1. A search query (1-3 words) to query a stock video engine (e.g. "aerial view forest", "man typing laptop", "coffee pouring"). Make it highly descriptive but simple.
2. The start time (in seconds, matching the transcript timestamps) where this visual B-Roll segment should begin.
3. The end time (in seconds, matching the transcript timestamps) where this visual B-Roll segment should end.
4. A reason describing why this stock video is suitable for the voiceover.

Transcript:
${formattedTranscript}

Respond ONLY with a valid JSON array matching this schema:
[
  {
    "query": "search query",
    "startTime": 0.0,
    "endTime": 5.0,
    "reason": "why this matches the transcript text"
  }
]

Do not include any markdown tags, markdown blocks (like \`\`\`json), or additional text. Just output the raw JSON array.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json" },
        }),
      }
    );

    if (!response.ok) throw new Error("Gemini API request failed");

    const rawData = await response.json();
    const textResponse = rawData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) throw new Error("Empty response from Gemini API");

    const startIndex = textResponse.indexOf("[");
    const endIndex = textResponse.lastIndexOf("]");
    let jsonText = textResponse;
    if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
      jsonText = textResponse.substring(startIndex, endIndex + 1);
    }
    const parsedConcepts = JSON.parse(jsonText);
    if (!Array.isArray(parsedConcepts) || parsedConcepts.length === 0) return;

    setEditProgress({
      step: "broll",
      progress: 30,
      message: `Searching Pexels for ${parsedConcepts.length} overlay clips...`,
    });

    // Create B-Roll track if it doesn't exist
    let targetTrack = store.project.timeline.tracks.find(
      (t: any) => t.type === "video" && t.name === "B-Roll"
    );

    if (!targetTrack) {
      const oldTracks = [...store.project.timeline.tracks];
      const addTrackRes = await store.addTrack("video");
      if (!addTrackRes.success) throw new Error("Failed to create B-Roll track");
      const currentProject = store.project;
      const newTrack = currentProject.timeline.tracks.find(
        (t: any) => !oldTracks.some((ot: any) => ot.id === t.id)
      );
      if (!newTrack) throw new Error("Failed to find new track");
      store.renameTrack(newTrack.id, "B-Roll");
      targetTrack = { ...newTrack, name: "B-Roll" };
    }

    // Loop through concepts, search Pexels and download
    for (let i = 0; i < parsedConcepts.length; i++) {
      const concept = parsedConcepts[i];
      setEditProgress({
        step: "broll",
        progress: 30 + Math.round((i / parsedConcepts.length) * 60),
        message: `Applying B-Roll ${i + 1}/${parsedConcepts.length}: "${concept.query}"...`,
      });

      try {
        const pexResponse = await fetch(
          `https://api.pexels.com/videos/search?query=${encodeURIComponent(
            concept.query
          )}&per_page=1&orientation=landscape`,
          { headers: { Authorization: pexelsApiKey } }
        );

        if (!pexResponse.ok) continue;
        const pexData = await pexResponse.json();
        const video = pexData.videos?.[0];
        if (!video) continue;

        const fileLink =
          video.video_files.find((f: any) => f.quality === "hd")?.link ||
          video.video_files[0]?.link;
        if (!fileLink) continue;

        // Fetch video blob
        const videoRes = await fetch(fileLink);
        if (!videoRes.ok) continue;
        const videoBlob = await videoRes.blob();
        const brollFile = new File([videoBlob], `broll-${video.id}.mp4`, { type: "video/mp4" });

        // Import
        const importRes = await store.importMedia(brollFile);
        if (!importRes.success || !importRes.actionId) continue;
        const brollMediaId = importRes.actionId;

        // Add clip (at segment time)
        const addClipRes = await store.addClip(targetTrack.id, brollMediaId, concept.startTime);
        if (!addClipRes.success) continue;

        // Retrieve added B-Roll clip to trim and mute
        const updatedProj = store.project;
        const trackAfterAdd = updatedProj.timeline.tracks.find((t: any) => t.id === targetTrack.id);
        const newClip = trackAfterAdd?.clips.find(
          (c: any) =>
            c.mediaId === brollMediaId &&
            Math.abs(c.startTime - concept.startTime) < 0.01
        );

        if (!newClip) continue;

        // Trim
        const conceptDuration = concept.endTime - concept.startTime;
        await store.trimClip(newClip.id, 0, conceptDuration);

        // Mute volume
        const muteAction = {
          type: "audio/setVolume" as const,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          params: { clipId: newClip.id, volume: 0 },
        };
        await store.actionExecutor.execute(muteAction, store.project);
      } catch (err) {
        console.warn(`Failed to process B-Roll concept: "${concept.query}"`, err);
      }
    }
  } catch (err) {
    console.warn("Failed to automatically apply B-Roll:", err);
  }
}

export const AutoClipResultsPage: React.FC = () => {
  const { navigate } = useRouter();
  const { clips, selectedClipId, selectClip, videoSource, config, reset } = useAutoClipStore();
  const createNewProject = useProjectStore((state) => state.createNewProject);
  const setSkipWelcomeScreen = useUIStore((state) => state.setSkipWelcomeScreen);

  // States for integration process
  const [editProgress, setEditProgress] = useState<EditingProgress | null>(null);
  const [showKeysModal, setShowKeysModal] = useState(false);
  const [tempGeminiKey, setTempGeminiKey] = useState("");
  const [tempPexelsKey, setTempPexelsKey] = useState("");

  const selectedClip = clips.find((c) => c.id === selectedClipId) ?? clips[0];

  // ─── Thumbnail extraction ──────────────────────────────────────────────────
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const thumbnailVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (!selectedClip || !videoSource?.url) {
      setThumbnailUrl(null);
      return;
    }

    let cancelled = false;
    const vid = document.createElement("video");
    thumbnailVideoRef.current = vid;
    vid.src = videoSource.url;
    vid.muted = true;
    vid.playsInline = true;
    vid.preload = "metadata";
    vid.crossOrigin = "anonymous";

    const cleanup = () => {
      vid.removeAttribute("src");
      vid.load();
    };

    vid.onloadedmetadata = () => {
      // Seek to clip start time (clamp to video duration)
      const seekTime = Math.min(selectedClip.startTime + 0.5, vid.duration - 0.1);
      vid.currentTime = Math.max(0, seekTime);
    };

    vid.onseeked = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        // Use 9:16 aspect for thumbnail
        canvas.width = 280;
        canvas.height = 498;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          // Fill + center-crop the video frame
          const vAR = vid.videoWidth / vid.videoHeight;
          const cAR = canvas.width / canvas.height;
          let sx = 0, sy = 0, sw = vid.videoWidth, sh = vid.videoHeight;
          if (vAR > cAR) {
            sw = vid.videoHeight * cAR;
            sx = (vid.videoWidth - sw) / 2;
          } else {
            sh = vid.videoWidth / cAR;
            sy = (vid.videoHeight - sh) / 2;
          }
          ctx.drawImage(vid, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
          setThumbnailUrl(canvas.toDataURL("image/jpeg", 0.8));
        }
      } catch {
        setThumbnailUrl(null);
      }
      cleanup();
    };

    vid.onerror = () => {
      if (!cancelled) setThumbnailUrl(null);
      cleanup();
    };

    return () => {
      cancelled = true;
      cleanup();
    };
  }, [selectedClip?.id, videoSource?.url]);

  // Redirect if no clips
  if (clips.length === 0) {
    navigate("upload");
    return null;
  }

  // ─── Process Pipeline ────────────────────────────────────────────────────────
  const proceedWithEditing = useCallback(async (overrideDisableBRoll = false) => {
    if (!selectedClip) return;

    setEditProgress({
      step: "importing",
      progress: 5,
      message: "Creating project on timeline...",
    });

    const presetMap: Record<string, string> = {
      "9:16": "tiktok",
      "16:9": "youtube-video",
      "1:1": "instagram-post",
      "4:5": "instagram-reels",
    };
    const presetKey = presetMap[config.aspectRatio] ?? "tiktok";
    const preset = SOCIAL_MEDIA_PRESETS[presetKey as keyof typeof SOCIAL_MEDIA_PRESETS];

    // 1. Create a blank project
    createNewProject(selectedClip.title, {
      width: preset?.width ?? 1080,
      height: preset?.height ?? 1920,
      frameRate: preset?.frameRate ?? 30,
    });
    setSkipWelcomeScreen(true);

    const store = useProjectStore.getState();
    let mediaId: string | null = null;
    let addedClipId: string | null = null;

    // 2. Import file & place/trim on timeline
    if (videoSource?.file) {
      setEditProgress({
        step: "importing",
        progress: 15,
        message: "Importing video to project library...",
      });

      const importResult = await store.importMedia(videoSource.file);
      if (importResult.success && importResult.actionId) {
        mediaId = importResult.actionId;

        setEditProgress({
          step: "importing",
          progress: 30,
          message: "Adding video clip to track...",
        });

        const clipResult = await store.addClipToNewTrack(mediaId, 0);
        if (clipResult.success) {
          const updatedProject = useProjectStore.getState().project;
          const addedClip = updatedProject.timeline.tracks
            .flatMap((t) => t.clips)
            .find((c) => c.mediaId === mediaId);

          if (addedClip) {
            addedClipId = addedClip.id;

            // Trim clip - clamp values to avoid out-of-bounds errors on mock/shorter videos
            const mediaItem = store.getMediaItem(mediaId);
            const actualDuration = mediaItem?.metadata.duration || 15;
            const trimStart = Math.max(0, Math.min(selectedClip.startTime, actualDuration - 0.5));
            const trimEnd = Math.max(trimStart + 0.5, Math.min(selectedClip.endTime, actualDuration));
            await store.trimClip(addedClip.id, trimStart, trimEnd);
            // Move clip to start at 0
            await store.moveClip(addedClip.id, 0);
          }
        }
      }
    }

    if (!addedClipId) {
      setEditProgress({
        step: "error",
        progress: 100,
        message: "Failed to place video clip on timeline.",
      });
      return;
    }

    // 3. AI Face Scene Splitter (same as editor "AI Face Scene Splitter" panel)
    if (config.enableFaceFocus) {
      setEditProgress({
        step: "reframe",
        progress: 0,
        message: "Initializing AI Face Scene Splitter...",
      });

      try {
        const faceSplitterBridge = getFaceSplitterBridge();
        const trackId = (() => {
          const proj = useProjectStore.getState().project;
          return proj.timeline.tracks.find((t) =>
            t.clips.some((c) => c.id === addedClipId)
          )?.id;
        })();

        const clipRangeStart = (() => {
          const proj = useProjectStore.getState().project;
          return proj.timeline.tracks
            .flatMap((t) => t.clips)
            .find((c) => c.id === addedClipId)?.startTime ?? 0;
        })();

        const clipRangeEnd = (() => {
          const proj = useProjectStore.getState().project;
          const c = proj.timeline.tracks
            .flatMap((t) => t.clips)
            .find((c) => c.id === addedClipId);
          return c ? c.startTime + c.duration : 0;
        })();

        const originalMediaId = (() => {
          const proj = useProjectStore.getState().project;
          return proj.timeline.tracks
            .flatMap((t) => t.clips)
            .find((c) => c.id === addedClipId)?.mediaId ?? "";
        })();

        // Step A: Split clip by face orientation
        const splitResult = await faceSplitterBridge.runFaceSplitter(
          addedClipId,
          2.0, // minimum segment duration in seconds
          (prog, msg) => {
            setEditProgress({
              step: "reframe",
              progress: Math.round(prog * 0.8),
              message: `[Face Split] ${msg}`,
            });
          }
        );

        // Step B: After splitting, apply Auto Focus Face (centering) on each sub-clip
        if (splitResult.success && trackId) {
          const splitClips = useProjectStore.getState().project.timeline.tracks
            .find((t) => t.id === trackId)
            ?.clips.filter(
              (c) =>
                c.mediaId === originalMediaId &&
                c.startTime >= clipRangeStart - 0.01 &&
                c.startTime + c.duration <= clipRangeEnd + 0.01
            ) ?? [];

          const sortedSplitClips = [...splitClips].sort(
            (a, b) => a.startTime - b.startTime
          );

          if (sortedSplitClips.length > 0) {
            const autoReframeBridge = getAutoReframeBridge();
            for (let i = 0; i < sortedSplitClips.length; i++) {
              const sc = sortedSplitClips[i];
              try {
                await autoReframeBridge.runAutoFocusFace(sc.id, (prog, msg) => {
                  const base = 80 + Math.round((i / sortedSplitClips.length) * 20);
                  const sub = Math.round(
                    (prog / 100) * (20 / sortedSplitClips.length)
                  );
                  setEditProgress({
                    step: "reframe",
                    progress: Math.min(100, base + sub),
                    message: `[Focus ${i + 1}/${sortedSplitClips.length}] ${msg}`,
                  });
                });
              } catch (err) {
                console.warn(`Auto Focus Face failed for sub-clip ${i + 1}:`, err);
              }
            }
          }
        }
      } catch (err) {
        console.warn("AI Face Scene Splitter failed:", err);
      }
    }

    // 4. Transcription & Subtitles
    const animStyleMap: Record<string, CaptionAnimationStyle> = {
      bounce: "bounce",
      typewriter: "typewriter",
      "pop-in": "pop-in",
      "slide-up": "slide-up",
      "glow-pulse": "glow-pulse",
      "spring-zoom": "active-zoom-spring",
    };
    const animationStyle: CaptionAnimationStyle =
      animStyleMap[config.subtitleStyle] || "bounce";

    let subtitlesGenerated: Subtitle[] = [];

    if (config.enableSubtitle) {
      setEditProgress({
        step: "transcribe",
        progress: 30,
        message: "Applying subtitles from pre-calculated transcription...",
      });

      const { fullSubtitles } = useAutoClipStore.getState();

      if (fullSubtitles && fullSubtitles.length > 0) {
        // Filter subtitles that overlap with the clip's segment
        const clipStart = selectedClip.startTime;
        const clipEnd = selectedClip.endTime;

        const filteredSubtitles = fullSubtitles
          .filter((sub) => sub.startTime < clipEnd && sub.endTime > clipStart)
          .map((sub) => {
            // Shift timestamps to match clip start at 0
            const shiftedStart = Math.max(0, sub.startTime - clipStart);
            const shiftedEnd = Math.min(selectedClip.duration, sub.endTime - clipStart);

            const shiftedWords = sub.words?.map((w) => ({
              text: w.text,
              startTime: Math.max(0, w.startTime - clipStart),
              endTime: Math.min(selectedClip.duration, w.endTime - clipStart),
            }));

            return {
              ...sub,
              startTime: shiftedStart,
              endTime: shiftedEnd,
              words: shiftedWords,
              animationStyle,
              style: {
                fontFamily: "Arial",
                fontSize: 38,
                color: "#ffffff",
                backgroundColor: "transparent",
                position: "bottom" as const,
              },
            };
          });

        for (const subtitle of filteredSubtitles) {
          await store.addSubtitle(subtitle);
        }
        subtitlesGenerated = filteredSubtitles;
      } else {
        // Fallback to hook and transcript preview if pre-calculated subtitles are empty
        setEditProgress({
          step: "transcribe",
          progress: 50,
          message: "Adding transcript preview subtitles...",
        });

        // Use our helper to split hookText and transcriptPreview into structured subtitles
        const hookSubtitles = splitTextIntoSubtitles(
          selectedClip.hookText,
          0,
          Math.min(3, selectedClip.duration),
          animationStyle
        );

        const bodySubtitles = selectedClip.duration > 3
          ? splitTextIntoSubtitles(
              selectedClip.transcriptPreview,
              3,
              selectedClip.duration,
              animationStyle
            )
          : [];

        const allFallbackSubtitles = [...hookSubtitles, ...bodySubtitles];

        for (const subtitle of allFallbackSubtitles) {
          await store.addSubtitle(subtitle);
        }
        subtitlesGenerated = allFallbackSubtitles;
      }
    }

    // 5. Auto B-Roll
    if (config.enableBRoll && !overrideDisableBRoll) {
      const currentStore = useProjectStore.getState();
      const mediaItem = currentStore.getMediaItem(mediaId!);
      const addedClip = currentStore.project.timeline.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === addedClipId);

      if (mediaItem && addedClip) {
        setEditProgress({
          step: "broll",
          progress: 0,
          message: "Initializing B-Roll concepts...",
        });
        await applyAutoBRoll(addedClip, mediaId!, currentStore, setEditProgress, subtitlesGenerated);
      }
    }

    setEditProgress({
      step: "done",
      progress: 100,
      message: "Processing complete! Opening editor...",
    });

    setTimeout(() => {
      navigate("editor");
    }, 1000);
  }, [selectedClip, config, videoSource, createNewProject, setSkipWelcomeScreen, navigate]);

  const handleEdit = useCallback(async () => {
    if (!selectedClip) return;

    const geminiKey = localStorage.getItem("openreel:gemini_api_key") || "";
    const pexelsKey = localStorage.getItem("openreel:pexels_api_key") || "";

    // Show API Key modal if B-Roll is enabled but keys are missing
    if (config.enableBRoll && (!geminiKey.trim() || !pexelsKey.trim())) {
      setTempGeminiKey(geminiKey);
      setTempPexelsKey(pexelsKey);
      setShowKeysModal(true);
      return;
    }

    await proceedWithEditing();
  }, [selectedClip, config, proceedWithEditing]);

  const handleSaveKeys = useCallback(async () => {
    localStorage.setItem("openreel:gemini_api_key", tempGeminiKey.trim());
    localStorage.setItem("openreel:pexels_api_key", tempPexelsKey.trim());
    setShowKeysModal(false);
    toast.success("API Keys Saved", "Saved API keys for B-Roll search.");
    await proceedWithEditing();
  }, [tempGeminiKey, tempPexelsKey, proceedWithEditing]);

  const handleSkipBRoll = useCallback(async () => {
    setShowKeysModal(false);
    toast.info("B-Roll Skipped", "Proceeding with transcription & face centering only.");
    await proceedWithEditing(true); // override and disable B-Roll
  }, [proceedWithEditing]);

  const handleNewSession = useCallback(() => {
    reset();
    navigate("upload");
  }, [reset, navigate]);

  const videoLabel =
    videoSource?.type === "file" ? videoSource.name : videoSource?.title ?? "Video";

  return (
    <AutoClipLayout title="Your Clips">
      <div className="flex h-full" style={{ height: "calc(100vh - 56px)" }}>
        {/* ── Sidebar ── */}
        <aside className="w-72 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--bg-1)]">
          {/* Source info */}
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider font-semibold mb-1">
              Source
            </p>
            <p className="text-xs text-[var(--fg-2)] font-medium line-clamp-1">{videoLabel}</p>
            <div className="flex items-center gap-3 mt-2">
              <span className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
                <Scissors size={10} /> {clips.length} clips
              </span>
              <span className="flex items-center gap-1 text-[10px] text-[var(--fg-muted)]">
                📐 {config.aspectRatio}
              </span>
            </div>
          </div>

          {/* Clips list */}
          <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-1">
            {clips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                isSelected={clip.id === selectedClipId}
                onClick={() => selectClip(clip.id)}
              />
            ))}
          </div>

          {/* New session button */}
          <div className="p-3 border-t border-[var(--border)]">
            <button
              onClick={handleNewSession}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--border)] text-xs font-medium text-[var(--fg-3)] hover:text-[var(--fg)] hover:border-[var(--border-strong)] transition-all"
            >
              <RotateCcw size={13} />
              New Auto Clip session
            </button>
          </div>
        </aside>

        {/* ── Detail Panel ── */}
        <main className="flex-1 overflow-y-auto bg-[var(--bg)]">
          {selectedClip ? (
            <div className="max-w-3xl mx-auto px-8 py-8">
              {/* Clip header */}
              <div className="flex items-start justify-between gap-4 mb-6">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-[var(--fg-muted)] font-mono">
                      #{selectedClip.index}
                    </span>
                    {selectedClip.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-[10px] font-bold px-2 py-0.5 rounded bg-[var(--bg-3)] text-[var(--fg-3)] uppercase tracking-wide"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <h2 className="text-xl font-bold text-[var(--fg)] tracking-tight">
                    {selectedClip.title}
                  </h2>
                </div>
                {/* More options */}
                <button className="w-8 h-8 rounded-lg hover:bg-[var(--bg-2)] flex items-center justify-center text-[var(--fg-3)]">
                  ···
                </button>
              </div>

              {/* Preview mock + metadata row */}
              <div className="flex gap-6 mb-8">
                {/* Video preview — real thumbnail when available */}
                <div
                  className="relative rounded-2xl overflow-hidden flex-shrink-0 flex items-center justify-center"
                  style={{
                    width: 140,
                    height: 248,
                    background: thumbnailUrl ? "#000" : selectedClip.thumbnailColor,
                  }}
                >
                  {thumbnailUrl ? (
                    <img
                      src={thumbnailUrl}
                      alt="Clip thumbnail"
                      className="w-full h-full object-cover"
                    />
                  ) : null}
                  {/* Play button overlay */}
                  <button className="absolute w-14 h-14 bg-black/40 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-black/60 transition-colors">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                  {/* Duration badge */}
                  <div className="absolute bottom-2 left-2 right-2 flex justify-between">
                    <span className="text-white text-[10px] font-bold bg-black/50 px-1.5 py-0.5 rounded">
                      {formatTime(selectedClip.duration)}
                    </span>
                    <span className="text-white text-[10px] font-bold bg-black/50 px-1.5 py-0.5 rounded">
                      {config.aspectRatio}
                    </span>
                  </div>
                </div>

                {/* Metadata */}
                <div className="flex-1 flex flex-col gap-4">
                  {/* Viral score */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-1)] border border-[var(--border)]">
                    <ScoreMeter score={selectedClip.viralScore} />
                  </div>

                  {/* Time range */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-1)] border border-[var(--border)]">
                    <p className="text-[10px] font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-2">
                      Time Range
                    </p>
                    <div className="flex items-center gap-2 text-sm text-[var(--fg-2)]">
                      <Clock size={13} className="text-[var(--accent)]" />
                      <span className="font-mono">
                        {formatTime(selectedClip.startTime)} → {formatTime(selectedClip.endTime)}
                      </span>
                      <span className="text-[var(--fg-muted)] text-xs">
                        ({formatTime(selectedClip.duration)})
                      </span>
                    </div>
                  </div>

                  {/* Hook */}
                  <div className="p-4 rounded-2xl bg-[var(--bg-1)] border border-[var(--border)]">
                    <p className="text-[10px] font-semibold text-[var(--fg-muted)] uppercase tracking-wider mb-2 flex items-center gap-1">
                      <Zap size={10} className="text-amber-400" /> Hook (first 3s)
                    </p>
                    <p className="text-sm text-[var(--fg-2)] italic">"{selectedClip.hookText}"</p>
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div className="flex gap-3 mb-8">
                <button
                  id="clip-edit-btn"
                  onClick={handleEdit}
                  className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] font-semibold text-sm hover:opacity-90 transition-all shadow-lg shadow-[var(--accent-glow)]"
                >
                  <Pencil size={16} />
                  Edit in Editor
                  <ChevronRight size={16} />
                </button>
                <button className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--fg-2)] font-medium hover:bg-[var(--bg-2)] transition-all">
                  <Download size={16} />
                  Download
                </button>
                <button className="flex items-center justify-center gap-2 px-5 py-3.5 rounded-2xl border border-[var(--border)] bg-[var(--bg-1)] text-sm text-[var(--fg-2)] font-medium hover:bg-[var(--bg-2)] transition-all">
                  <Share2 size={16} />
                  Share
                </button>
              </div>

              {/* Transcript preview */}
              <div className="p-5 rounded-2xl bg-[var(--bg-1)] border border-[var(--border)]">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={13} className="text-violet-400" />
                  <p className="text-xs font-semibold text-[var(--fg-2)] uppercase tracking-wider">
                    Transcript Preview
                  </p>
                </div>
                <p className="text-sm text-[var(--fg-3)] leading-relaxed">
                  {selectedClip.transcriptPreview}
                </p>
                <button className="mt-3 text-xs text-[var(--accent)] font-medium hover:underline">
                  View full transcript →
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-[var(--fg-muted)] text-sm">
              Select a clip to preview
            </div>
          )}
        </main>
      </div>

      {/* ── API Keys Configuration Modal ── */}
      {showKeysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[var(--bg-2)] border border-[var(--border)] rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <KeyRound size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--fg)]">Auto B-Roll API Keys</h3>
                <p className="text-xs text-[var(--fg-muted)]">Gemini & Pexels keys are required.</p>
              </div>
            </div>

            <p className="text-xs text-[var(--fg-2)] leading-relaxed">
              Auto B-Roll uses Gemini to detect text concepts and Pexels to download matching landscape stock videos. You can skip this step and apply overlays later in the editor.
            </p>

            <div className="space-y-3 pt-1">
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider font-semibold block">
                  Gemini API Key
                </label>
                <input
                  type="password"
                  placeholder="Paste Gemini API Key..."
                  value={tempGeminiKey}
                  onChange={(e) => setTempGeminiKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider font-semibold block">
                  Pexels API Key
                </label>
                <input
                  type="password"
                  placeholder="Paste Pexels API Key..."
                  value={tempPexelsKey}
                  onChange={(e) => setTempPexelsKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)]"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleSaveKeys}
                disabled={!tempGeminiKey.trim() || !tempPexelsKey.trim()}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={14} />
                Save & Apply B-Roll
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleSkipBRoll}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-3)] text-xs font-semibold text-[var(--fg-2)] transition-all"
                >
                  Skip B-Roll
                </button>
                <button
                  onClick={() => setShowKeysModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-3)] text-xs font-semibold text-[var(--fg-muted)] transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Processing Pipeline Status Modal ── */}
      {editProgress && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
          <div className="bg-[var(--bg-2)] border border-[var(--border)] rounded-3xl max-w-sm w-full p-6 shadow-2xl flex flex-col gap-5 text-center">
            {editProgress.step === "done" ? (
              <div className="mx-auto w-12 h-12 bg-green-500/20 text-green-400 rounded-full flex items-center justify-center">
                <CheckCircle2 size={26} />
              </div>
            ) : editProgress.step === "error" ? (
              <div className="mx-auto w-12 h-12 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center">
                <XCircle size={26} />
              </div>
            ) : (
              <div className="mx-auto w-12 h-12 rounded-full flex items-center justify-center relative bg-violet-500/10 text-violet-400">
                <Loader2 size={24} className="animate-spin" />
              </div>
            )}

            <div>
              <h3 className="text-sm font-bold text-[var(--fg)] uppercase tracking-wider">
                {editProgress.step === "done"
                  ? "Editing Setup Done"
                  : editProgress.step === "error"
                  ? "Editing Setup Failed"
                  : "Applying AI Configurations"}
              </h3>
              <p className="text-xs text-[var(--fg-muted)] mt-1">{editProgress.message}</p>
            </div>

            {/* Steps checklist */}
            <div className="text-left bg-[var(--bg-3)] rounded-2xl p-4 border border-[var(--border)] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--fg-3)]">1. Import & Place Video</span>
                <span className="font-semibold text-green-400">✓</span>
              </div>
              {config.enableFaceFocus && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--fg-3)]">2. AI Face Scene Splitter</span>
                  {editProgress.step === "importing" ? (
                    <span className="text-[var(--fg-muted)]">Pending</span>
                  ) : editProgress.step === "reframe" ? (
                    <span className="text-violet-400 animate-pulse font-medium">Processing ({editProgress.progress}%)</span>
                  ) : (
                    <span className="font-semibold text-green-400">✓ Done</span>
                  )}
                </div>
              )}
              {config.enableSubtitle && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--fg-3)]">3. AI Audio Transcription</span>
                  {["importing", "reframe"].includes(editProgress.step) ? (
                    <span className="text-[var(--fg-muted)]">Pending</span>
                  ) : editProgress.step === "transcribe" ? (
                    <span className="text-violet-400 animate-pulse font-medium">Transcribing ({editProgress.progress}%)</span>
                  ) : (
                    <span className="font-semibold text-green-400">✓ Done</span>
                  )}
                </div>
              )}
              {config.enableBRoll && (
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--fg-3)]">4. AI Smart B-Roll Overlays</span>
                  {["importing", "reframe", "transcribe"].includes(editProgress.step) ? (
                    <span className="text-[var(--fg-muted)]">Pending</span>
                  ) : editProgress.step === "broll" ? (
                    <span className="text-violet-400 animate-pulse font-medium">Applying ({editProgress.progress}%)</span>
                  ) : (
                    <span className="font-semibold text-green-400">✓ Done</span>
                  )}
                </div>
              )}
            </div>

            {editProgress.step === "error" && (
              <button
                onClick={() => setEditProgress(null)}
                className="w-full py-2 bg-[var(--accent)] text-[var(--accent-fg)] rounded-xl text-xs font-semibold"
              >
                Close & Retry
              </button>
            )}
          </div>
        </div>
      )}
    </AutoClipLayout>
  );
};

