import { create } from "zustand";
import {
  extractHighlights,
  type HighlightResult,
  type HighlightPreferences,
} from "../services/highlight-service";
import type { TranscriptWord } from "@openreel/core";

interface ViralClipState {
  highlights: HighlightResult[];
  isAnalyzing: boolean;
  progress: { phase: string; percent: number; message: string } | null;
  error: string | null;
  preferences: HighlightPreferences;
  isDialogOpen: boolean;
  setDialogOpen: (open: boolean) => void;
  setPreferences: (prefs: Partial<HighlightPreferences>) => void;
  clearResults: () => void;
  runAnalysis: (audioBuffer: AudioBuffer, transcript: TranscriptWord[]) => Promise<void>;
}

const DEFAULT_PREFERENCES: HighlightPreferences = {
  targetClipCount: 5,
  minClipDuration: 5,
  maxClipDuration: 60,
  contentType: "video",
};

export const useViralClipStore = create<ViralClipState>((set, get) => ({
  highlights: [],
  isAnalyzing: false,
  progress: null,
  error: null,
  preferences: DEFAULT_PREFERENCES,
  isDialogOpen: false,

  setDialogOpen: (open) => set({ isDialogOpen: open }),

  setPreferences: (prefs) =>
    set((state) => ({
      preferences: { ...state.preferences, ...prefs },
    })),

  clearResults: () => set({ highlights: [], error: null, progress: null }),

  runAnalysis: async (audioBuffer, transcript) => {
    set({ isAnalyzing: true, error: null, progress: null, highlights: [] });

    try {
      const results = await extractHighlights(
        audioBuffer,
        transcript,
        get().preferences,
        (phase, percent, message) => {
          set({ progress: { phase, percent, message } });
        }
      );

      set({ highlights: results, isAnalyzing: false, progress: null });
    } catch (err) {
      console.error("[ViralClipStore] Highlight extraction failed:", err);
      set({
        error: err instanceof Error ? err.message : "Failed to analyze highlights",
        isAnalyzing: false,
        progress: null,
      });
    }
  },
}));
