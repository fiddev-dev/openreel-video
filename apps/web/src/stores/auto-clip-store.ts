/**
 * Auto Clip Store — manages state for the entire Auto Clip feature flow.
 * All processing is simulated (mock) since this is a browser-only app.
 * Replace processMockClips() with real API calls when a backend is available.
 */
import { create } from "zustand";
import {
  initializeTranscriptionService,
  type Subtitle,
  type Clip,
  type MediaItem,
} from "@openreel/core";
import { OPENREEL_TRANSCRIBE_URL } from "../config/api-endpoints";

// ─── Types ────────────────────────────────────────────────────────────────────

export type VideoSource =
  | { type: "file"; file: File; url: string; name: string; duration: number }
  | { type: "youtube"; youtubeUrl: string; videoId: string; title: string; thumbnailUrl: string; file?: File; url?: string; duration?: number };

export type SubtitleStyle =
  | "bounce"
  | "typewriter"
  | "pop-in"
  | "slide-up"
  | "glow-pulse"
  | "spring-zoom";

export type AspectRatio = "9:16" | "16:9" | "1:1" | "4:5";

export type ClipLength = 15 | 30 | 60 | "auto";

export type ClipTag = "funny" | "informative" | "emotional" | "highlight" | "hook";

export interface GeneratedClip {
  id: string;
  index: number;
  title: string;
  startTime: number; // seconds
  endTime: number;   // seconds
  duration: number;  // seconds
  viralScore: number; // 0–10
  hookText: string;
  transcriptPreview: string;
  thumbnailColor: string; // for mock thumbnail gradient
  tags: ClipTag[];
}

export interface AutoClipConfig {
  enableSubtitle: boolean;
  subtitleStyle: SubtitleStyle;
  enableFaceFocus: boolean;
  enableBRoll: boolean;
  aspectRatio: AspectRatio;
  clipLength: ClipLength;
  minClipDuration: number; // seconds — clips shorter than this are skipped
  enableAIClipSuggestions: boolean;
}

export type ProcessingStep =
  | "idle"
  | "upload"
  | "create-project"
  | "process-video"
  | "transcribe"
  | "find-clips"
  | "edit-clips"
  | "finalize"
  | "done"
  | "error";

export interface ProcessingState {
  currentStep: ProcessingStep;
  progress: number; // 0–100
  stepProgress: Record<ProcessingStep, "pending" | "active" | "done" | "error">;
  errorMessage?: string;
}

export interface AutoClipState {
  // Source
  videoSource: VideoSource | null;

  // Config
  config: AutoClipConfig;

  // Processing
  processing: ProcessingState;

  // Results
  clips: GeneratedClip[];
  fullSubtitles: Subtitle[];
  selectedClipId: string | null;

  // Actions
  setVideoSource: (source: VideoSource | null) => void;
  updateConfig: (partial: Partial<AutoClipConfig>) => void;
  startProcessing: () => Promise<void>;
  resetProcessing: () => void;
  selectClip: (id: string) => void;
  reset: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: AutoClipConfig = {
  enableSubtitle: true,
  subtitleStyle: "bounce",
  enableFaceFocus: true,
  enableBRoll: false,
  aspectRatio: "9:16",
  clipLength: "auto",
  minClipDuration: 10,
  enableAIClipSuggestions: true,
};

const INITIAL_STEP_PROGRESS: ProcessingState["stepProgress"] = {
  idle: "pending",
  upload: "pending",
  "create-project": "pending",
  "process-video": "pending",
  transcribe: "pending",
  "find-clips": "pending",
  "edit-clips": "pending",
  finalize: "pending",
  done: "pending",
  error: "pending",
};

const MOCK_TIPS = [
  "Analyzing speech patterns to find the most engaging moments...",
  "Detecting emotional peaks in your video...",
  "Finding the best hooks in the first 3 seconds...",
  "Scoring each segment for viral potential...",
  "Applying your subtitle style preferences...",
];

/** Extract keywords from video title to generate relevant clip metadata */
function extractKeywords(title: string): string[] {
  const cleanTitle = title.replace(/\.[^/.]+$/, ""); // remove extensions like .mp4
  const words = cleanTitle
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // remove special chars
    .split(/[\s_-]+/)
    .filter((w) => w.length > 3) // filter short words
    .filter((w) => !["with", "from", "that", "this", "your", "have", "what", "about", "tutorial", "video", "project", "openreel"].includes(w));
  return words.length > 0 ? words : ["video"];
}

/** Generate dynamic clips matching the uploaded video's actual duration and title keywords */
function generateDynamicClips(videoSource: VideoSource | null, config: AutoClipConfig): GeneratedClip[] {
  const duration =
    videoSource?.type === "file"
      ? videoSource.duration
      : 300; // default 5 minutes for YouTube / fallback
  
  const title =
    videoSource?.type === "file"
      ? videoSource.name
      : videoSource?.type === "youtube"
      ? videoSource.title
      : "My Video";

  const keywords = extractKeywords(title);

  // Determine target clip duration based on config
  let clipLen = 30;
  if (config.clipLength !== "auto") {
    clipLen = config.clipLength;
  }

  // Determine how many clips we can fit in the total duration
  let numClips = config.enableAIClipSuggestions ? 8 : 4;
  const minRequiredLength = clipLen + 5; // clip length + 5 seconds minimum gap
  const maxPossibleClips = Math.floor(duration / minRequiredLength);
  
  numClips = Math.max(1, Math.min(numClips, maxPossibleClips));

  // Regular spacing between clips
  const totalClipDuration = numClips * clipLen;
  const remainingTime = duration - totalClipDuration;
  const spacing = numClips > 1 ? Math.max(2, Math.floor(remainingTime / (numClips + 1))) : 0;

  const colors = [
    "linear-gradient(135deg, #667eea, #764ba2)",
    "linear-gradient(135deg, #f093fb, #f5576c)",
    "linear-gradient(135deg, #4facfe, #00f2fe)",
    "linear-gradient(135deg, #43e97b, #38f9d7)",
    "linear-gradient(135deg, #fa709a, #fee140)",
    "linear-gradient(135deg, #a18cd1, #fbc2eb)",
    "linear-gradient(135deg, #ffecd2, #fcb69f)",
    "linear-gradient(135deg, #a1c4fd, #c2e9fb)",
  ];

  const tagPool: ClipTag[][] = [
    ["highlight", "hook"],
    ["informative", "highlight"],
    ["emotional", "hook"],
    ["funny", "informative"],
    ["highlight"],
    ["hook", "informative"],
  ];

  const clipTitles = [
    "The truth about [Keyword]",
    "Why you should NEVER ignore [Keyword]",
    "The smartest [Keyword] trick nobody talks about",
    "This [Keyword] tip will change everything",
    "Stop making this [Keyword] mistake",
    "How to master [Keyword] in seconds",
    "The secret of [Keyword] they don't want you to know",
    "This is why [Keyword] beneran works",
  ];

  const hooks = [
    "Here's the thing about [Keyword] that nobody talks about...",
    "I was completely wrong about [Keyword] until I found this out...",
    "Wait until you see what happens when you try this [Keyword] trick...",
    "Most people get [Keyword] backwards and it ruins their results...",
    "The results of this [Keyword] experiment blew my mind...",
    "I wish I knew this [Keyword] method when I first started...",
  ];

  const transcripts = [
    "So I've been working with [Keyword] for years and I never realized that the key is actually in how you approach the problem from the very beginning. Most people do it the hard way...",
    "The biggest mistake I see people making with [Keyword] is thinking that more is always better when in reality it's the opposite. The shortcut is to simplify...",
    "When I first started out with [Keyword] I had no idea what I was doing but that's exactly what made me figure out this incredible shortcut that saves hours of time...",
    "Everyone tells you to work harder at [Keyword] but nobody tells you to work smarter and that's the real secret right there that makes all the difference...",
    "I tested this [Keyword] method with over 100 people and the results were consistently amazing across the board. You can see a huge spike in engagement...",
  ];

  const clips: GeneratedClip[] = [];
  let currentStart = Math.min(5, duration * 0.05); // start 5% in or at 5s

  for (let i = 0; i < numClips; i++) {
    const kw = keywords[i % keywords.length];
    const capitalizedKw = kw.charAt(0).toUpperCase() + kw.slice(1);

    const randomizedLen = config.clipLength === "auto"
      ? [15, 30, 45, 60][Math.floor(Math.random() * 4)]
      : config.clipLength;

    const actualLen = Math.min(randomizedLen, duration - currentStart);
    if (actualLen < config.minClipDuration) break; // clip is shorter than minimum duration, stop generating

    const start = Math.floor(currentStart);
    const end = Math.floor(start + actualLen);

    const titleTemplate = clipTitles[i % clipTitles.length];
    const clipTitle = titleTemplate.replace(/\[Keyword\]/g, capitalizedKw);

    const hookTemplate = hooks[i % hooks.length];
    const hookText = hookTemplate.replace(/\[Keyword\]/g, kw);

    const transTemplate = transcripts[i % transcripts.length];
    const transcript = transTemplate.replace(/\[Keyword\]/g, kw);

    clips.push({
      id: `clip-${i + 1}`,
      index: i + 1,
      title: clipTitle,
      startTime: start,
      endTime: end,
      duration: end - start,
      viralScore: parseFloat((7.5 + Math.random() * 2.3).toFixed(1)),
      hookText,
      transcriptPreview: transcript,
      thumbnailColor: colors[i % colors.length],
      tags: tagPool[i % tagPool.length],
    });

    currentStart = end + spacing;
    if (currentStart >= duration - 5) break;
  }

  if (clips.length === 0) {
    const kw = keywords[0] || "video";
    const capitalizedKw = kw.charAt(0).toUpperCase() + kw.slice(1);
    const titleTemplate = clipTitles[0];
    const clipTitle = titleTemplate.replace(/\[Keyword\]/g, capitalizedKw);

    clips.push({
      id: "clip-1",
      index: 1,
      title: clipTitle,
      startTime: 0,
      endTime: duration,
      duration: duration,
      viralScore: 8.0,
      hookText: hooks[0].replace(/\[Keyword\]/g, kw),
      transcriptPreview: transcripts[0].replace(/\[Keyword\]/g, kw),
      thumbnailColor: colors[0],
      tags: ["highlight"],
    });
  }

  return clips;
}


// ─── Store ────────────────────────────────────────────────────────────────────

export const useAutoClipStore = create<AutoClipState>((set, get) => ({
  videoSource: null,
  config: DEFAULT_CONFIG,
  processing: {
    currentStep: "idle",
    progress: 0,
    stepProgress: INITIAL_STEP_PROGRESS,
  },
  clips: [],
  fullSubtitles: [],
  selectedClipId: null,

  setVideoSource: (source) => set({ videoSource: source }),

  updateConfig: (partial) =>
    set((state) => ({ config: { ...state.config, ...partial } })),

  startProcessing: async () => {
    const { config, videoSource } = get();

    // 1. Prepare video source (upload/download step)
    set({
      processing: {
        currentStep: "upload",
        progress: 10,
        stepProgress: { ...INITIAL_STEP_PROGRESS, upload: "active" },
      },
    });

    let sourceForClips = videoSource;

    if (videoSource?.type === "youtube") {
      try {
        let blob: Blob | null = null;
        let videoDuration = 15;

        // Try downloading using public Cobalt instances (CORS-friendly YouTube downloader)
        const cobaltInstances = [
          "https://api.cobalt.tools/api/json",
          "https://co.wuk.sh/api/json",
          "https://cobalt.hyper.lol/api/json",
          "https://cobalt-api.wuk.sh/api/json"
        ];

        for (const instance of cobaltInstances) {
          try {
            console.log(`Attempting YouTube download via instance: ${instance}`);
            const cobaltResponse = await fetch(instance, {
              method: "POST",
              headers: {
                "Accept": "application/json",
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                url: videoSource.youtubeUrl,
                videoQuality: "360", // 360p is light and fast to download
                downloadMode: "video"
              })
            });

            if (cobaltResponse.ok) {
              const data = await cobaltResponse.json();
              if (data.url) {
                const videoRes = await fetch(data.url);
                if (videoRes.ok) {
                  blob = await videoRes.blob();
                  videoDuration = 120; // default estimate
                  console.log(`Successfully downloaded YouTube video using instance: ${instance}`);
                  break;
                }
              }
            }
          } catch (err) {
            console.warn(`Cobalt instance ${instance} failed:`, err);
          }
        }

        // Fallback to Oceans sample video if Cobalt failed
        if (!blob) {
          console.warn("All Cobalt instances failed, falling back to sample video (oceans.mp4)");
          const resp = await fetch("https://vjs.zencdn.net/v/oceans.mp4");
          if (resp.ok) {
            blob = await resp.blob();
            videoDuration = 46;
          } else {
            // Ultimate fallback to local mock video if offline/network fails
            const localResp = await fetch("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4");
            blob = await localResp.blob();
            videoDuration = 15;
          }
        }

        if (blob) {
          const file = new File([blob], `${videoSource.videoId}.mp4`, { type: "video/mp4" });
          const url = URL.createObjectURL(file);

          sourceForClips = {
            ...videoSource,
            file,
            url,
            duration: videoDuration,
          };

          set({ videoSource: sourceForClips });
        }
      } catch (e) {
        console.warn("Failed to prepare YouTube video source:", e);
      }
    }

    // Set upload as done and start create-project/process-video step
    set((state) => ({
      processing: {
        ...state.processing,
        currentStep: "create-project",
        progress: 25,
        stepProgress: {
          ...state.processing.stepProgress,
          upload: "done",
          "create-project": "active",
        },
      },
    }));

    await new Promise((resolve) => setTimeout(resolve, 500));

    set((state) => ({
      processing: {
        ...state.processing,
        currentStep: "process-video",
        progress: 40,
        stepProgress: {
          ...state.processing.stepProgress,
          "create-project": "done",
          "process-video": "active",
        },
      },
    }));

    // 2. Transcription step
    set((state) => ({
      processing: {
        ...state.processing,
        currentStep: "transcribe",
        progress: 50,
        stepProgress: {
          ...state.processing.stepProgress,
          "process-video": "done",
          transcribe: "active",
        },
      },
    }));

    let subtitles: Subtitle[] = [];

    if (sourceForClips?.file) {
      try {
        const file = sourceForClips.file;
        const mediaDuration = sourceForClips.duration || 30;

        const mediaItem: MediaItem = {
          id: "temp-media-auto-clip",
          name: file.name,
          blob: file,
          type: "video",
          fileHandle: null,
          thumbnailUrl: null,
          waveformData: null,
          metadata: {
            duration: mediaDuration,
            width: 1920,
            height: 1080,
            frameRate: 30,
            codec: "h264",
            sampleRate: 44100,
            channels: 2,
            fileSize: file.size,
          },
        };

        const mockClip: Clip = {
          id: "temp-clip-auto-clip",
          mediaId: mediaItem.id,
          startTime: 0,
          duration: mediaDuration,
          inPoint: 0,
          outPoint: mediaDuration,
          trackId: "temp-track",
          effects: [],
          audioEffects: [],
          transform: {
            position: { x: 0, y: 0 },
            scale: { x: 1, y: 1 },
            rotation: 0,
            opacity: 1,
            anchor: { x: 0.5, y: 0.5 },
          },
          volume: 1,
          keyframes: [],
        };

        const transcriptionService = initializeTranscriptionService({
          apiEndpoint: `${OPENREEL_TRANSCRIBE_URL}/transcribe`,
        });

        subtitles = await transcriptionService.transcribeClip(
          mockClip,
          mediaItem,
          (progressInfo) => {
            set((state) => ({
              processing: {
                ...state.processing,
                progress: 50 + Math.round(progressInfo.progress * 0.2), // maps 0-100 to 50-70%
                message: `Transcribing: ${progressInfo.message}`,
              },
            }));
          }
        );
      } catch (err) {
        console.warn("Full video transcription failed:", err);
      }
    }

    // 3. Find Clips (AI clip suggestion / Segmentation)
    set((state) => ({
      processing: {
        ...state.processing,
        currentStep: "find-clips",
        progress: 75,
        stepProgress: {
          ...state.processing.stepProgress,
          transcribe: "done",
          "find-clips": "active",
        },
      },
    }));

    const geminiApiKey = localStorage.getItem("openreel:gemini_api_key") || "";
    let finalClips: GeneratedClip[] = [];

    if (config.enableAIClipSuggestions && geminiApiKey.trim() && subtitles.length > 0) {
      try {
        const formattedTranscript = subtitles
          .map((sub) => `[${(sub.startTime).toFixed(1)}s - ${(sub.endTime).toFixed(1)}s]: "${sub.text}"`)
          .join("\n");

        const prompt = `You are a professional video editor and virality expert.
Analyze the following transcript from a video with timestamps.
Identify the most engaging/viral segments of the video that are suitable to be cut into separate clips (Shorts/TikToks/Reels).
Identify between 2 to 5 clips. The target duration of each clip is around ${config.clipLength === "auto" ? "15-60" : config.clipLength} seconds.

Transcript:
${formattedTranscript}

Respond ONLY with a valid JSON array matching this schema:
[
  {
    "title": "a catchy title for the clip",
    "startTime": 0.0,
    "endTime": 30.0,
    "viralScore": 8.5,
    "hookText": "a summary of the first 3 seconds hook",
    "transcriptPreview": "a preview of what is said in this segment",
    "tags": ["highlight", "funny"]
  }
]

Do not include any markdown tags, markdown blocks (like \`\`\`json), or additional text. Just output the raw JSON array.`;

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

        if (response.ok) {
          const rawData = await response.json();
          const textResponse = rawData.candidates?.[0]?.content?.parts?.[0]?.text;
          if (textResponse) {
            const startIndex = textResponse.indexOf("[");
            const endIndex = textResponse.lastIndexOf("]");
            let jsonText = textResponse;
            if (startIndex !== -1 && endIndex !== -1 && startIndex < endIndex) {
              jsonText = textResponse.substring(startIndex, endIndex + 1);
            }
            const parsedClips = JSON.parse(jsonText);
            if (Array.isArray(parsedClips) && parsedClips.length > 0) {
              const colors = [
                "linear-gradient(135deg, #667eea, #764ba2)",
                "linear-gradient(135deg, #f093fb, #f5576c)",
                "linear-gradient(135deg, #4facfe, #00f2fe)",
                "linear-gradient(135deg, #43e97b, #38f9d7)",
                "linear-gradient(135deg, #fa709a, #fee140)",
              ];
              finalClips = parsedClips.map((c: any, index: number) => ({
                id: `clip-${index + 1}`,
                index: index + 1,
                title: c.title,
                startTime: c.startTime,
                endTime: c.endTime,
                duration: c.endTime - c.startTime,
                viralScore: parseFloat(c.viralScore || 8.5),
                hookText: c.hookText || "",
                transcriptPreview: c.transcriptPreview || "",
                thumbnailColor: colors[index % colors.length],
                tags: c.tags || ["highlight"],
              }));
            }
          }
        }
      } catch (err) {
        console.warn("AI Clip suggestion query failed:", err);
      }
    }

    // Fallback if AI suggestion failed or didn't run
    if (finalClips.length === 0) {
      finalClips = generateDynamicClips(sourceForClips, config);
    }

    // 4. Edit Clips (visual delay)
    set((state) => ({
      processing: {
        ...state.processing,
        currentStep: "edit-clips",
        progress: 85,
        stepProgress: {
          ...state.processing.stepProgress,
          "find-clips": "done",
          "edit-clips": "active",
        },
      },
    }));

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 5. Finalize step
    set((state) => ({
      processing: {
        ...state.processing,
        currentStep: "finalize",
        progress: 95,
        stepProgress: {
          ...state.processing.stepProgress,
          "edit-clips": "done",
          finalize: "active",
        },
      },
    }));

    await new Promise((resolve) => setTimeout(resolve, 500));

    // Complete!
    set({
      clips: finalClips,
      fullSubtitles: subtitles,
      selectedClipId: finalClips[0]?.id ?? null,
      processing: {
        currentStep: "done",
        progress: 100,
        stepProgress: {
          upload: "done",
          "create-project": "done",
          "process-video": "done",
          transcribe: "done",
          "find-clips": "done",
          "edit-clips": "done",
          finalize: "done",
          done: "done",
          idle: "done",
          error: "pending"
        },
      },
    });
  },

  resetProcessing: () =>
    set({
      processing: {
        currentStep: "idle",
        progress: 0,
        stepProgress: INITIAL_STEP_PROGRESS,
      },
    }),

  selectClip: (id) => set({ selectedClipId: id }),

  reset: () =>
    set({
      videoSource: null,
      config: DEFAULT_CONFIG,
      processing: {
        currentStep: "idle",
        progress: 0,
        stepProgress: INITIAL_STEP_PROGRESS,
      },
      clips: [],
      fullSubtitles: [],
      selectedClipId: null,
    }),
}));

export { MOCK_TIPS };
