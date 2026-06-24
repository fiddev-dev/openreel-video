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

    const project = store.project;
    if (!project) {
      throw new Error("Project not found");
    }
    const projectWidth = project.settings.width;
    const projectHeight = project.settings.height;
    const projectRatio = projectWidth / projectHeight;

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

      const inPoint = clip.inPoint ?? 0;
      const outPoint = (clip.outPoint ?? video.duration) || 10;
      const clipDuration = outPoint - inPoint;

      // Extract at 2 fps to balance accuracy and speed/memory
      const fps = 2;
      const step = 1 / fps;
      const frames: ImageBitmap[] = [];
      const canvas = document.createElement("canvas");
      
      // Limit resolution of analysis frames to speed up detection
      const analysisScale = Math.min(1, 1080 / video.videoWidth);
      canvas.width = video.videoWidth * analysisScale;
      canvas.height = video.videoHeight * analysisScale;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      const totalFrames = Math.ceil(clipDuration * fps);
      let frameIdx = 0;

      for (let time = inPoint; time < outPoint; time += step) {
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
        // Calculate base scale for fitting the video onto the project canvas
        const videoAspect = video.videoWidth / video.videoHeight;
        let drawWidth: number;
        if (videoAspect > projectRatio) {
          drawWidth = projectWidth;
        } else {
          drawWidth = projectHeight * videoAspect;
        }
        const baseScale = drawWidth / video.videoWidth;

        // Map engine keyframes to timeline keyframes using correct schemas and clip-local time space
        const timelineKeyframes: Keyframe[] = [];

        result.keyframes.forEach((kf) => {
          // Scale crop coordinates back to the original video pixel space
          const originalCropX = kf.cropX / analysisScale;
          const originalCropY = kf.cropY / analysisScale;
          const originalCropWidth = kf.cropWidth / analysisScale;
          const originalCropHeight = kf.cropHeight / analysisScale;

          const scaleX = video.videoWidth / originalCropWidth;
          const scaleY = video.videoHeight / originalCropHeight;
          const scale = Math.max(scaleX, scaleY);
          
          // Use clip local time, NOT timeline absolute time
          const kfClipTime = kf.time;

          const dx = video.videoWidth / 2 - (originalCropX + originalCropWidth / 2);
          const dy = video.videoHeight / 2 - (originalCropY + originalCropHeight / 2);
          const factor = baseScale * scale;
          const posX = dx * factor;
          const posY = dy * factor;

          // Position X Keyframe
          timelineKeyframes.push({
            id: `kf-posx-${Math.random().toString(36).substring(2, 9)}-${kfClipTime}`,
            time: kfClipTime,
            property: "position.x",
            value: posX,
            easing: "linear",
          });

          // Position Y Keyframe
          timelineKeyframes.push({
            id: `kf-posy-${Math.random().toString(36).substring(2, 9)}-${kfClipTime}`,
            time: kfClipTime,
            property: "position.y",
            value: posY,
            easing: "linear",
          });

          // Scale X Keyframe
          timelineKeyframes.push({
            id: `kf-scalex-${Math.random().toString(36).substring(2, 9)}-${kfClipTime}`,
            time: kfClipTime,
            property: "scale.x",
            value: scale,
            easing: "linear",
          });

          // Scale Y Keyframe
          timelineKeyframes.push({
            id: `kf-scaley-${Math.random().toString(36).substring(2, 9)}-${kfClipTime}`,
            time: kfClipTime,
            property: "scale.y",
            value: scale,
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

  async runAutoFocusFace(
    clipId: string,
    onProgress?: ReframeProgressCallback
  ): Promise<ReframeResult> {
    const store = useProjectStore.getState();
    const project = store.project;
    if (!project) {
      throw new Error("Project not found");
    }

    const projectWidth = project.settings.width;
    const projectHeight = project.settings.height;
    const projectRatio = projectWidth / projectHeight;

    const settings: ReframeSettings = {
      targetAspectRatio: "custom",
      customRatio: projectRatio,
      trackingSpeed: 0.5,
      padding: 0.1,
      smoothing: 0.8,
      followSubject: true,
      centerBias: 0.0, // Put the face exactly in the center
      zoomOnSubject: true,
      subjectScaleMultiplier: 3.5,
      verticalAlign: 0.5, // Center face vertically
    };

    return this.runAutoReframe(clipId, settings, onProgress);
  }
}

let autoReframeBridgeInstance: AutoReframeBridge | null = null;

export function getAutoReframeBridge(): AutoReframeBridge {
  if (!autoReframeBridgeInstance) {
    autoReframeBridgeInstance = new AutoReframeBridge();
  }
  return autoReframeBridgeInstance;
}
