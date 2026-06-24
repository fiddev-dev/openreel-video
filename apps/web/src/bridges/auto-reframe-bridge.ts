import {
  initializeAutoReframeEngine,
  type ReframeSettings,
  type ReframeResult,
  type Keyframe,
} from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import { loadMediaBlob } from "../services/media-storage";

export type ReframeProgressCallback = (progress: number, message: string) => void;

export class AutoReframeBridge {
  async runAutoReframe(
    clipId: string,
    settings: ReframeSettings,
    onProgress?: ReframeProgressCallback
  ): Promise<ReframeResult> {
    const store = useProjectStore.getState();
    const clip = store.getClip(clipId);

    if (!clip) {
      throw new Error("Clip not found");
    }

    const mediaItem = store.getMediaItem(clip.mediaId);
    if (!mediaItem) {
      throw new Error("Media item not found");
    }

    // 1. Initialize Auto Reframe Engine
    onProgress?.(5, "Initializing auto-reframe engine...");
    const engine = initializeAutoReframeEngine();
    await engine.initialize((p, msg) => {
      onProgress?.(5 + p * 0.15, `Engine: ${msg}`);
    });

    // 2. Load the media blob
    onProgress?.(20, "Loading video source...");
    const blob = await loadMediaBlob(clip.mediaId);
    if (!blob) {
      throw new Error("Failed to load media source file");
    }

    // 3. Extract frames in browser using HTML5 Video Element
    onProgress?.(25, "Extracting video frames for analysis...");
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.src = url;
    video.muted = true;
    video.playsInline = true;
    video.preload = "metadata";

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Failed to load video metadata"));
      });

      const duration = video.duration || 10;
      // Extract at 2 fps to balance accuracy and speed/memory
      const fps = 2;
      const step = 1 / fps;
      const frames: ImageBitmap[] = [];
      const canvas = document.createElement("canvas");
      
      // Limit resolution of analysis frames to speed up detection
      const scale = Math.min(1, 640 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      const totalFrames = Math.ceil(duration * fps);
      let frameIdx = 0;

      for (let time = 0; time < duration; time += step) {
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const bitmap = await createImageBitmap(canvas);
        frames.push(bitmap);

        frameIdx++;
        const extractProgress = 25 + Math.round((frameIdx / totalFrames) * 25);
        onProgress?.(extractProgress, `Extracting frames (${frameIdx}/${totalFrames})...`);
      }

      // 4. Run auto-reframe engine analysis
      onProgress?.(50, "Running AI face tracking...");
      const result = await engine.analyzeClip(frames, fps, settings, (p, msg) => {
        onProgress?.(50 + p * 0.45, `AI: ${msg}`);
      });

      // Cleanup frames in memory
      frames.forEach((f) => f.close());

      if (result.success && result.keyframes.length > 0) {
        // Map engine keyframes to timeline keyframes
        const timelineKeyframes: Keyframe[] = [];

        result.keyframes.forEach((kf) => {
          const scaleX = video.videoWidth / kf.cropWidth;
          const scaleY = video.videoHeight / kf.cropHeight;

          // Position Keyframe
          timelineKeyframes.push({
            id: `kf-pos-${Math.random().toString(36).substring(2, 9)}-${kf.time}`,
            time: kf.time,
            property: "position",
            value: {
              x: (video.videoWidth / 2 - (kf.cropX + kf.cropWidth / 2)) * scaleX,
              y: (video.videoHeight / 2 - (kf.cropY + kf.cropHeight / 2)) * scaleY,
            },
            easing: "linear",
          });

          // Scale Keyframe
          timelineKeyframes.push({
            id: `kf-scale-${Math.random().toString(36).substring(2, 9)}-${kf.time}`,
            time: kf.time,
            property: "scale",
            value: {
              x: scaleX,
              y: scaleY,
            },
            easing: "linear",
          });
        });

        // 5. Apply keyframes to project-store
        onProgress?.(98, "Applying crop settings...");
        store.updateClipKeyframes(clip.id, timelineKeyframes);
      }

      onProgress?.(100, "Reframing complete!");
      return result;
    } finally {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }
}

let autoReframeBridgeInstance: AutoReframeBridge | null = null;

export function getAutoReframeBridge(): AutoReframeBridge {
  if (!autoReframeBridgeInstance) {
    autoReframeBridgeInstance = new AutoReframeBridge();
  }
  return autoReframeBridgeInstance;
}
