import {
  analyzeAudioForHighlights,
  type TranscriptWord,
  type AudioSegmentMetrics,
} from "@openreel/core";

export interface HighlightResult {
  start: number;
  end: number;
  score: number;
  title: string;
  reason: string;
}

export interface HighlightPreferences {
  targetClipCount: number;
  minClipDuration: number;
  maxClipDuration: number;
  contentType: string;
}

const DEFAULT_PREFERENCES: HighlightPreferences = {
  targetClipCount: 5,
  minClipDuration: 5,
  maxClipDuration: 60,
  contentType: "video",
};

type ProgressCallback = (phase: string, progress: number, message: string) => void;

const API_BASE = import.meta.env.VITE_CLOUD_API_URL || "https://openreel-cloud.niiyeboah1996.workers.dev";

export async function extractHighlights(
  audioBuffer: AudioBuffer,
  transcript: TranscriptWord[],
  preferences: Partial<HighlightPreferences> = {},
  onProgress?: ProgressCallback,
): Promise<HighlightResult[]> {
  const prefs = { ...DEFAULT_PREFERENCES, ...preferences };

  onProgress?.("analyze", 10, "Analyzing audio energy...");
  const analysis = analyzeAudioForHighlights(audioBuffer, transcript);

  onProgress?.("analyze", 30, "Preparing data for AI...");
  const energyData = analysis.segments
    .filter((seg) => !seg.isSilence)
    .map((seg: AudioSegmentMetrics) => ({
      start: seg.start,
      end: seg.end,
      rmsDb: seg.rmsDb,
      peakDb: seg.peakDb,
    }));

  onProgress?.("ai", 40, "Sending to AI for highlight detection...");

  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 30000); // 30s timeout

  let attempt = 0;
  const maxAttempts = 3;
  let lastError: Error | null = null;

  while (attempt < maxAttempts) {
    try {
      if (attempt > 0) {
        onProgress?.("ai", 40 + attempt * 10, `Retrying AI connection (attempt ${attempt + 1}/${maxAttempts})...`);
      }
      const response = await fetch(`${API_BASE}/highlights`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: transcript.map((w) => ({
            text: w.text,
            start: w.start,
            end: w.end,
          })),
          energy: energyData,
          duration: analysis.duration,
          preferences: prefs,
        }),
        signal: controller.signal,
      });

      clearTimeout(id);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error((errorData as { error?: string }).error || `API error: ${response.status}`);
      }

      onProgress?.("ai", 80, "Processing AI response...");
      const data = (await response.json()) as { highlights: HighlightResult[] };

      onProgress?.("done", 100, "Highlights ready");
      return data.highlights;
    } catch (err) {
      lastError = err as Error;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error("Highlight detection request timed out. Please check your internet connection.");
      }
      attempt++;
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  clearTimeout(id);
  throw lastError || new Error("Failed to detect highlights after multiple attempts.");
}

export async function extractHighlightsWithGemini(
  transcript: { text: string; start: number; end: number }[],
  apiKey: string,
  preferences: HighlightPreferences,
  onProgress?: ProgressCallback,
): Promise<HighlightResult[]> {
  onProgress?.("ai", 20, "Preparing transcript for Gemini...");
  
  const formattedTranscript = transcript.map((w, idx) => 
    `[${w.start.toFixed(1)}s - ${w.end.toFixed(1)}s] Word #${idx}: "${w.text}"`
  ).join("\n");

  const prompt = `You are an expert AI Video Editor. Your job is to analyze this video transcription text and its timestamps to identify the most engaging, hook-heavy, and high-viral-potential segments for short-form clips (like TikToks, Instagram Reels, or YouTube Shorts).

Analyze the semantic structure, topics, hooks, and climax of the following transcript:
${formattedTranscript}

Preferences:
- Target number of clips: ${preferences.targetClipCount}
- Minimum clip duration: ${preferences.minClipDuration} seconds
- Maximum clip duration: ${preferences.maxClipDuration} seconds
- Content Type: ${preferences.contentType}

For each recommended viral clip, you must identify:
1. A creative, catchy title.
2. The start time (in seconds) of the segment.
3. The end time (in seconds) of the segment.
4. A rating or viral score from 0 to 100.
5. A detailed reason explaining why this segment is viral (e.g. powerful hook, complete thought, climax).

Respond ONLY with a valid JSON array matching this schema:
[
  {
    "title": "Creative Hook Title",
    "start": 12.5,
    "end": 45.0,
    "score": 95,
    "reason": "Explain why this segment is viral."
  }
]

Do not include any markdown tags, markdown blocks (like \`\`\`json), or additional text. Just output the raw JSON array.`;

  onProgress?.("ai", 50, "Calling Gemini 3.1 Flash Lite...");

  const model = "gemini-3.1-flash-lite";
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: prompt,
              },
            ],
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

  onProgress?.("ai", 85, "Parsing highlights response...");
  const data = await response.json();
  
  try {
    const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!textResponse) {
      throw new Error("Empty response from Gemini API");
    }
    
    // Clean up response if there are markdown blocks
    const cleanedText = textResponse
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const highlightsList = JSON.parse(cleanedText);
    if (!Array.isArray(highlightsList)) {
      throw new Error("Gemini response is not a valid array");
    }

    onProgress?.("done", 100, "Highlights parsed successfully");
    return highlightsList.map((hl: any) => ({
      start: Number(hl.start) || 0,
      end: Number(hl.end) || 0,
      score: Number(hl.score) || 80,
      title: String(hl.title) || "Untitled Highlight",
      reason: String(hl.reason) || "Identified as a high engagement topic by AI.",
    }));
  } catch (err) {
    console.error("[Gemini Highlights] Parse failed. Raw response:", data);
    throw new Error(`Failed to parse highlights from Gemini: ${err instanceof Error ? err.message : String(err)}`);
  }
}
