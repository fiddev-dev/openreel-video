import React, { useState, useCallback, useRef, useEffect } from "react";
import { Sparkles, Loader2, Play, Plus, Volume2, VolumeX } from "lucide-react";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { toast } from "../../../stores/notification-store";
import {
  getTranscriptionService,
  initializeTranscriptionService,
  type Subtitle,
} from "@openreel/core";
import { OPENREEL_TRANSCRIBE_URL } from "../../../config/api-endpoints";

interface SmartBrollPanelProps {
  clipId: string;
}

interface BrollConcept {
  query: string;
  startTime: number;
  endTime: number;
  reason: string;
  videos?: PexelsVideo[];
}

interface PexelsVideo {
  id: number;
  image: string;
  link: string;
}

// Module-level cache to store B-Roll concepts per clipId to survive unmounts/selection changes
const conceptsCache = new Map<string, BrollConcept[]>();

export const SmartBrollPanel: React.FC<SmartBrollPanelProps> = ({ clipId }) => {
  const clipIdRef = useRef(clipId);
  useEffect(() => {
    clipIdRef.current = clipId;
  }, [clipId]);

  const [concepts, setConceptsInternal] = useState<BrollConcept[]>(() => {
    return conceptsCache.get(clipId) || [];
  });

  const setConcepts = useCallback((newVal: BrollConcept[] | ((prev: BrollConcept[]) => BrollConcept[])) => {
    setConceptsInternal((prev) => {
      const next = typeof newVal === "function" ? newVal(prev) : newVal;
      conceptsCache.set(clipIdRef.current, next);
      return next;
    });
  }, []);

  useEffect(() => {
    setConceptsInternal(conceptsCache.get(clipId) || []);
  }, [clipId]);

  const [isScanning, setIsScanning] = useState(false);
  const [phase, setPhase] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [insertingId, setInsertingId] = useState<number | null>(null);
  const [isApplyingAll, setIsApplyingAll] = useState(false);
  const [applyProgress, setApplyProgress] = useState("");

  const [geminiApiKey, setGeminiApiKey] = useState(
    () => localStorage.getItem("openreel:gemini_api_key") || ""
  );
  const [pexelsApiKey, setPexelsApiKey] = useState(
    () => localStorage.getItem("openreel:pexels_api_key") || ""
  );
  const [density, setDensity] = useState<"low" | "medium" | "high">(
    () => (localStorage.getItem("openreel:broll_density") as any) || "medium"
  );

  const project = useProjectStore((s) => s.project);
  const getMediaItem = useProjectStore((s) => s.getMediaItem);
  const setPlayheadPosition = useTimelineStore((s) => s.setPlayheadPosition);

  // Helper to get selected clip from timeline
  const getSelectedClip = useCallback(() => {
    if (!project) return null;
    return project.timeline.tracks
      .flatMap((t) => t.clips)
      .find((c) => c.id === clipId);
  }, [project, clipId]);

  const clip = getSelectedClip();

  // Find if B-Roll track exists and its muted state
  const brollTrack = project?.timeline.tracks.find(
    (t) => t.type === "video" && t.name === "B-Roll"
  );

  const handleMuteToggle = async () => {
    if (!brollTrack || !project) return;
    const store = useProjectStore.getState();
    try {
      await store.muteTrack(brollTrack.id, !brollTrack.muted);
      toast.success(
        brollTrack.muted ? "Track Unmuted" : "Track Muted",
        `B-Roll track has been ${brollTrack.muted ? "unmuted" : "muted"}`
      );
    } catch (err) {
      toast.error("Track Action Failed", "Could not toggle mute state of B-Roll track");
    }
  };

  const handleScan = async () => {
    if (!project || !clip) return;

    if (!geminiApiKey.trim()) {
      setError("Please enter your Gemini API Key first.");
      return;
    }
    if (!pexelsApiKey.trim()) {
      setError("Please enter your Pexels API Key first.");
      return;
    }

    setIsScanning(true);
    setError(null);
    setConcepts([]);

    try {
      // 1. Get clip subtitles
      setPhase("Retrieving subtitles...");
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

      const clipSubtitles = allSubtitles
        .filter(
          (sub: Subtitle) =>
            sub.startTime < clip.startTime + clip.duration - 0.05 &&
            sub.endTime > clip.startTime + 0.05
        )
        .sort((a, b) => a.startTime - b.startTime);

      let finalSubtitles = clipSubtitles;
      if (finalSubtitles.length === 0) {
        setPhase("Transcribing audio for B-Roll...");
        const transcriptionService = getTranscriptionService() || initializeTranscriptionService({
          apiEndpoint: `${OPENREEL_TRANSCRIBE_URL}/transcribe`,
        });
        const mediaItem = getMediaItem(clip.mediaId);
        if (!mediaItem?.blob) {
          throw new Error("Media source file not found or not loaded");
        }
        
        finalSubtitles = await transcriptionService.transcribeClip(
          clip,
          mediaItem,
          (p) => setPhase(`${p.message} (${p.progress}%)`)
        );
      }

      if (finalSubtitles.length === 0) {
        throw new Error("No transcript generated. Ensure the video contains audio.");
      }

      // 2. Format subtitles for Gemini
      const formattedTranscript = finalSubtitles
        .map((sub: Subtitle) => {
          const startRel = Math.max(clip.inPoint, sub.startTime - clip.startTime + clip.inPoint);
          const endRel = Math.min(clip.inPoint + clip.duration, sub.endTime - clip.startTime + clip.inPoint);
          return `[${startRel.toFixed(1)}s - ${endRel.toFixed(1)}s]: "${sub.text}"`;
        })
        .join("\n");

      // 3. Ask Gemini for visual B-Roll concepts
      setPhase("Analyzing concepts with Gemini 3.1 Flash Lite...");

      let densityGuideline = "";
      if (density === "low") {
        densityGuideline = "Suggest B-roll concepts extremely sparingly (covers about 20-30% of total video duration). Only suggest B-roll for highly concrete visual actions or objects mentioned in the transcript. Keep significant gaps (several seconds) between B-roll clips so the original speaker (talking head) is visible for the majority of the video.";
      } else if (density === "medium") {
        densityGuideline = "Suggest B-roll concepts selectively (covers about 45-55% of total video duration). Balance B-roll overlays with original speaker footage. Only suggest B-roll for key visual points, ensuring there are clear gaps where no B-roll is recommended so the original talking head is displayed.";
      } else {
        densityGuideline = "Suggest B-roll concepts frequently (covers about 75-85% of total video duration). Cover most topics or abstract concepts with relevant overlays, with only brief moments showing the original speaker.";
      }

      const prompt = `You are a professional video editor and B-Roll coordinator.
Analyze the following video transcript segments (which are 0-indexed relative to the video file starting at 0.0 seconds).

Pacing and Density Guidelines:
${densityGuideline}

Identify key moments that would benefit significantly from visual overlays based on the guideline above. For each recommended B-Roll segment, suggest a stock footage concept.
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

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${geminiApiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }],
              },
            ],
            generationConfig: {
              responseMimeType: "application/json",
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }

      const rawData = await response.json();
      const textResponse = rawData.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!textResponse) {
        throw new Error("Empty response from Gemini API");
      }

      const startIndex = textResponse.indexOf("[");
      const endIndex = textResponse.lastIndexOf("]");
      
      let jsonText = textResponse;
      if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
        jsonText = textResponse.substring(startIndex, endIndex + 1);
      } else {
        jsonText = textResponse
          .replace(/```json/g, "")
          .replace(/```/g, "")
          .trim();
      }

      const parsedConcepts: BrollConcept[] = JSON.parse(jsonText);
      if (!Array.isArray(parsedConcepts)) {
        throw new Error("Gemini response is not a valid JSON array");
      }

      // 4. Query Pexels Video API for each concept
      setPhase("Searching Pexels Stock Library...");
      const finalConcepts: BrollConcept[] = [];

      for (let i = 0; i < parsedConcepts.length; i++) {
        const c = parsedConcepts[i];
        setPhase(`Searching Pexels for "${c.query}" (${i + 1}/${parsedConcepts.length})...`);

        try {
          const pexResponse = await fetch(
            `https://api.pexels.com/videos/search?query=${encodeURIComponent(
              c.query
            )}&per_page=3&orientation=landscape`,
            {
              headers: {
                Authorization: pexelsApiKey,
              },
            }
          );

          if (pexResponse.ok) {
            const pexData = await pexResponse.json();
            const pexelsVideos = (pexData.videos || []).map((v: any) => {
              const file =
                v.video_files.find((f: any) => f.quality === "hd") ||
                v.video_files[0];
              return {
                id: v.id,
                image: v.image,
                link: file?.link || "",
              };
            });
            c.videos = pexelsVideos.filter((v: any) => v.link !== "");
          } else {
            c.videos = [];
          }
        } catch (e) {
          console.warn(`Pexels search failed for query "${c.query}":`, e);
          c.videos = [];
        }
        finalConcepts.push(c);
      }

      setConcepts(finalConcepts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "B-Roll Scan failed");
    } finally {
      setIsScanning(false);
      setPhase("");
    }
  };

  const handleInsertOverlay = async (concept: BrollConcept, video: PexelsVideo) => {
    if (!project || !clip) return;
    setInsertingId(video.id);

    try {
      // 1. Fetch stock video URL as a blob
      const res = await fetch(video.link);
      if (!res.ok) throw new Error("Failed to download video file from Pexels");
      const blob = await res.blob();
      const file = new File([blob], `broll-${video.id}.mp4`, {
        type: "video/mp4",
      });

      // 2. Import into project media library
      const store = useProjectStore.getState();
      const importRes = await store.importMedia(file);
      if (!importRes.success || !importRes.actionId) {
        throw new Error(importRes.error?.message || "Failed to import video into project");
      }
      const newMediaId = importRes.actionId;

      // 3. Create "B-Roll" track if it doesn't exist
      let targetTrack = project.timeline.tracks.find(
        (t) => t.type === "video" && t.name === "B-Roll"
      );

      if (!targetTrack) {
        const oldTracks = [...project.timeline.tracks];
        const addTrackRes = await store.addTrack("video");
        if (!addTrackRes.success) {
          throw new Error("Failed to create B-Roll overlay track");
        }
        const updatedProject = useProjectStore.getState().project;
        const newTrack = updatedProject.timeline.tracks.find(
          (t) => !oldTracks.some((ot) => ot.id === t.id)
        );
        if (!newTrack) {
          throw new Error("Failed to register new video track");
        }
        store.renameTrack(newTrack.id, "B-Roll");
        targetTrack = { ...newTrack, name: "B-Roll" };
      }

      // 4. Calculate start time on the timeline (relative to global timeline)
      // timelineStartTime = clip.startTime + (concept.startTime - clip.inPoint)
      const timelineStartTime = clip.startTime + (concept.startTime - clip.inPoint);

      // 5. Add clip to the track
      const addClipRes = await store.addClip(targetTrack.id, newMediaId, timelineStartTime);
      if (!addClipRes.success) {
        throw new Error(addClipRes.error?.message || "Failed to add B-roll clip onto track");
      }

      // 6. Retrieve the new clip to trim it and mute its volume
      const finalProject = useProjectStore.getState().project;
      const trackAfterAdd = finalProject.timeline.tracks.find(
        (t) => t.id === targetTrack!.id
      );
      const newClip = trackAfterAdd?.clips.find(
        (c) => c.mediaId === newMediaId && Math.abs(c.startTime - timelineStartTime) < 0.01
      );

      if (!newClip) {
        throw new Error("Failed to locate B-roll clip on timeline");
      }

      // Trim the B-roll overlay clip duration to match the concept's duration
      const conceptDuration = concept.endTime - concept.startTime;
      const trimRes = await store.trimClip(newClip.id, 0, conceptDuration);
      if (!trimRes.success) {
        throw new Error(trimRes.error?.message || "Failed to trim overlay clip");
      }

      // Mute the B-roll audio by executing audio/setVolume with volume: 0
      const muteAction = {
        type: "audio/setVolume" as const,
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        params: { clipId: newClip.id, volume: 0 },
      };
      const muteRes = await store.actionExecutor.execute(muteAction, finalProject);
      if (muteRes.success) {
        useProjectStore.setState({
          project: {
            ...useProjectStore.getState().project,
            modifiedAt: Date.now(),
          },
        });
      }

      toast.success(
        "B-Roll Inserted",
        `Stock video overlays segment at ${formatTime(concept.startTime)} - ${formatTime(
          concept.endTime
        )}`
      );
    } catch (err) {
      toast.error(
        "Insertion Failed",
        err instanceof Error ? err.message : "Failed to insert stock B-roll overlay"
      );
    } finally {
      setInsertingId(null);
    }
  };

  const handleAutoApplyAll = async () => {
    if (!project || !clip) return;
    const validConcepts = concepts.filter((c) => c.videos && c.videos.length > 0);
    if (validConcepts.length === 0) {
      toast.error("No Videos Found", "There are no suggested videos to apply.");
      return;
    }

    setIsApplyingAll(true);
    setError(null);

    try {
      const store = useProjectStore.getState();

      // 1. Ensure B-Roll track exists first
      let targetTrack = project.timeline.tracks.find(
        (t) => t.type === "video" && t.name === "B-Roll"
      );

      if (!targetTrack) {
        setApplyProgress("Creating B-Roll track...");
        const oldTracks = [...project.timeline.tracks];
        const addTrackRes = await store.addTrack("video");
        if (!addTrackRes.success) {
          throw new Error("Failed to create B-Roll overlay track");
        }
        const updatedProject = useProjectStore.getState().project;
        const newTrack = updatedProject.timeline.tracks.find(
          (t) => !oldTracks.some((ot) => ot.id === t.id)
        );
        if (!newTrack) {
          throw new Error("Failed to register new video track");
        }
        store.renameTrack(newTrack.id, "B-Roll");
        targetTrack = { ...newTrack, name: "B-Roll" };
      }

      // 2. Loop through each concept and apply it
      for (let i = 0; i < validConcepts.length; i++) {
        const concept = validConcepts[i];
        const video = concept.videos![0]; // Pick the first video suggestion
        setApplyProgress(`Applying B-Roll ${i + 1}/${validConcepts.length}: "${concept.query}"...`);

        // Fetch stock video URL as a blob
        const res = await fetch(video.link);
        if (!res.ok) {
          console.warn(`Failed to download video for concept "${concept.query}"`);
          continue;
        }
        const blob = await res.blob();
        const file = new File([blob], `broll-${video.id}.mp4`, {
          type: "video/mp4",
        });

        // Import into project media library
        const importRes = await store.importMedia(file);
        if (!importRes.success || !importRes.actionId) {
          console.warn(`Failed to import video for concept "${concept.query}"`);
          continue;
        }
        const newMediaId = importRes.actionId;

        // Calculate start time relative to global timeline
        const timelineStartTime = clip.startTime + (concept.startTime - clip.inPoint);

        // Add clip to the track
        const addClipRes = await store.addClip(targetTrack.id, newMediaId, timelineStartTime);
        if (!addClipRes.success) {
          console.warn(`Failed to add clip for concept "${concept.query}"`);
          continue;
        }

        // Retrieve clip to trim and mute
        const currentProject = useProjectStore.getState().project;
        const trackAfterAdd = currentProject.timeline.tracks.find(
          (t) => t.id === targetTrack!.id
        );
        const newClip = trackAfterAdd?.clips.find(
          (c) => c.mediaId === newMediaId && Math.abs(c.startTime - timelineStartTime) < 0.01
        );

        if (!newClip) continue;

        // Trim
        const conceptDuration = concept.endTime - concept.startTime;
        const trimRes = await store.trimClip(newClip.id, 0, conceptDuration);
        if (!trimRes.success) continue;

        // Mute
        const muteAction = {
          type: "audio/setVolume" as const,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          params: { clipId: newClip.id, volume: 0 },
        };
        await store.actionExecutor.execute(muteAction, currentProject);
      }

      // Update UI state
      useProjectStore.setState({
        project: {
          ...useProjectStore.getState().project,
          modifiedAt: Date.now(),
        },
      });

      toast.success("B-Roll Completed", `Successfully inserted ${validConcepts.length} stock video overlays`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Auto-applying B-Roll failed");
    } finally {
      setIsApplyingAll(false);
      setApplyProgress("");
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  if (!clip) {
    return (
      <div className="text-[10px] text-text-muted text-center py-4">
        No active clip selected. Please select a clip.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* API Keys Configuration */}
      <div className="space-y-2 border-b border-border pb-3">
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
        <div className="space-y-1">
          <label className="text-[10px] text-text-secondary block">Pexels API Key</label>
          <input
            type="password"
            placeholder="Enter Pexels API Key..."
            value={pexelsApiKey}
            onChange={(e) => {
              const val = e.target.value;
              setPexelsApiKey(val);
              localStorage.setItem("openreel:pexels_api_key", val);
            }}
            className="w-full px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-text-primary placeholder:text-text-muted"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[10px] text-text-secondary block">B-Roll Density</label>
          <select
            value={density}
            onChange={(e) => {
              const val = e.target.value as any;
              setDensity(val);
              localStorage.setItem("openreel:broll_density", val);
            }}
            className="w-full px-2 py-1 text-[10px] bg-background-secondary border border-border rounded text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="low">Low (Sparse - original video visible, ~25% coverage)</option>
            <option value="medium">Medium (Balanced - mix original & B-roll, ~50% coverage)</option>
            <option value="high">High (Frequent - cover most topics, ~80% coverage)</option>
          </select>
        </div>
      </div>

      {/* Control Buttons */}
      <div className="space-y-2">
        <button
          onClick={handleScan}
          disabled={isScanning || isApplyingAll}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-primary hover:bg-primary/90 text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50"
        >
          {isScanning ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              {phase}
            </>
          ) : (
            <>
              <Sparkles size={14} />
              Scan for B-Roll Concepts
            </>
          )}
        </button>

        {concepts.length > 0 && (
          <button
            onClick={handleAutoApplyAll}
            disabled={isApplyingAll || isScanning}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded text-[11px] font-medium transition-colors disabled:opacity-50"
          >
            {isApplyingAll ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {applyProgress}
              </>
            ) : (
              <>
                <Plus size={14} />
                Auto-Apply All B-Rolls
              </>
            )}
          </button>
        )}

        {error && (
          <p className="text-[10px] text-red-400 bg-red-500/10 p-2 rounded">{error}</p>
        )}
      </div>

      {/* Concept results with video selections */}
      {concepts.length > 0 && (
        <div className="space-y-3 pt-2">
          <h4 className="text-[11px] font-bold text-text-primary uppercase tracking-wider">
            Suggested Overlays
          </h4>

          {concepts.map((concept, index) => (
            <div
              key={index}
              className="p-3 bg-background-tertiary border border-border rounded-xl space-y-2.5"
            >
              <div className="flex items-start justify-between">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-primary block">
                    Concept {index + 1}: "{concept.query}"
                  </span>
                  <span className="text-[9px] text-text-muted font-mono block">
                    Range: {formatTime(concept.startTime)} - {formatTime(concept.endTime)}
                  </span>
                </div>
                <button
                  onClick={() => setPlayheadPosition(clip.startTime + (concept.startTime - clip.inPoint))}
                  className="p-1 hover:bg-background-secondary rounded text-text-muted hover:text-text-primary"
                  title="Go to timing"
                >
                  <Play size={10} />
                </button>
              </div>

              <p className="text-[9px] text-text-secondary leading-relaxed bg-background-secondary/50 p-2 rounded-lg border border-border/30">
                {concept.reason}
              </p>

              {/* Video Grid */}
              <div className="space-y-1">
                <span className="text-[8px] text-text-muted font-semibold uppercase tracking-wider block">
                  Pexels Videos (Orientation: Landscape)
                </span>
                {concept.videos && concept.videos.length > 0 ? (
                  <div className="grid grid-cols-3 gap-1.5 pt-1">
                    {concept.videos.map((vid) => (
                      <div
                        key={vid.id}
                        className="group relative aspect-video bg-black/40 rounded-lg overflow-hidden border border-border/50 hover:border-primary/50 transition-all cursor-pointer"
                        onClick={() => handleInsertOverlay(concept, vid)}
                      >
                        <img
                          src={vid.image}
                          alt={concept.query}
                          className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          {insertingId === vid.id ? (
                            <Loader2 size={12} className="animate-spin text-white" />
                          ) : (
                            <div className="p-1 bg-primary text-white rounded-full">
                              <Plus size={10} />
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-[9px] text-text-muted italic block py-1">
                    No videos found or search failed.
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Helper Track mute controller */}
      {brollTrack && (
        <div className="border border-border/40 bg-background-secondary/40 p-3 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-2">
            {brollTrack.muted ? (
              <VolumeX size={14} className="text-red-400" />
            ) : (
              <Volume2 size={14} className="text-green-400" />
            )}
            <span className="text-[10px] font-bold text-text-primary">
              B-Roll Track: {brollTrack.muted ? "Muted" : "Active"}
            </span>
          </div>
          <button
            onClick={handleMuteToggle}
            className="px-2 py-1 text-[9px] bg-background-tertiary hover:bg-background-tertiary/80 border border-border rounded-lg text-text-secondary transition-colors"
          >
            {brollTrack.muted ? "Unmute Track" : "Mute Track"}
          </button>
        </div>
      )}
    </div>
  );
};

export default SmartBrollPanel;
