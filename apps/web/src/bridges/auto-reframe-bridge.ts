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
    if (!project) throw new Error("Project not found");

    const clip = store.getClip(clipId);
    if (!clip) throw new Error("Clip not found");

    const projectWidth = project.settings.width;
    const projectHeight = project.settings.height;
    const projectRatio = projectWidth / projectHeight;

    // --- 1. Initialize engine ---
    onProgress?.(5, "Initializing face detection...");
    const engine = initializeAutoReframeEngine();
    await engine.initialize((p, msg) => {
      onProgress?.(5 + p * 0.15, `Engine: ${msg}`);
    });

    // --- 2. Load media blob ---
    onProgress?.(20, "Loading video source...");
    const blob = await loadMediaBlob(clip.mediaId);
    if (!blob) throw new Error("Failed to load media source file");

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
        setTimeout(() => reject(new Error("Video metadata timeout")), 10000);
      });

      const inPoint = clip.inPoint ?? 0;
      const outPoint = (clip.outPoint ?? video.duration) || 10;
      const clipDuration = outPoint - inPoint;

      const videoWidth = video.videoWidth;
      const videoHeight = video.videoHeight;

      // Fit video into project canvas
      const videoAspect = videoWidth / videoHeight;
      let drawWidth: number;
      if (videoAspect > projectRatio) {
        drawWidth = projectWidth;
      } else {
        drawWidth = projectHeight * videoAspect;
      }
      const baseScale = drawWidth / videoWidth;

      // Scale frames for analysis to limit memory usage
      const analysisScale = Math.min(1, 1080 / videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(videoWidth * analysisScale);
      canvas.height = Math.round(videoHeight * analysisScale);
      const ctx = canvas.getContext("2d")!;

      // --- 3. Sample frames — one every 2 seconds, capped at 30 ---
      const SAMPLE_INTERVAL = 2.0; // seconds between keyframes
      const MAX_SAMPLES = 30;
      const sampleTimes: number[] = [];
      for (let t = inPoint; t < outPoint; t += SAMPLE_INTERVAL) {
        sampleTimes.push(t);
        if (sampleTimes.length >= MAX_SAMPLES) break;
      }
      // Always include a mid-point if only 1 sample
      if (sampleTimes.length === 1 && clipDuration > 1) {
        sampleTimes.push(inPoint + clipDuration / 2);
      }

      // --- 4. Detect faces per frame, generate per-frame keyframes ---
      const ZOOM_MULTIPLIER = 3.5;
      const VERTICAL_ALIGN = 0.5; // center face vertically

      // Per-frame results: clip-local time → {posX, posY, scale}
      interface FrameKF {
        clipTime: number;
        posX: number;
        posY: number;
        scale: number;
      }
      const frameKeyframes: FrameKF[] = [];

      for (let i = 0; i < sampleTimes.length; i++) {
        const t = sampleTimes[i];
        // Clip-local time (t relative to inPoint)
        const clipLocalTime = t - inPoint;
        const prog = 25 + Math.round((i / sampleTimes.length) * 55);
        onProgress?.(prog, `Analyzing frame ${i + 1}/${sampleTimes.length} at ${clipLocalTime.toFixed(1)}s...`);

        video.currentTime = t;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
          setTimeout(resolve, 3000); // don't hang forever
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const bitmap = await createImageBitmap(canvas);
        const detections = await engine.detectFacesRaw(bitmap);
        bitmap.close();

        if (detections.length === 0) {
          // No face — will use previous keyframe or fallback (fill in after loop)
          continue;
        }

        // Pick the largest/most confident face
        const best = detections.reduce((a: any, b: any) => {
          const aArea = (a.boundingBox?.width ?? 0) * (a.boundingBox?.height ?? 0) * (a.categories?.[0]?.score ?? 0);
          const bArea = (b.boundingBox?.width ?? 0) * (b.boundingBox?.height ?? 0) * (b.categories?.[0]?.score ?? 0);
          return bArea > aArea ? b : a;
        }, detections[0]);

        const bb = best.boundingBox;
        if (!bb) continue;

        // Scale bbox back to original video pixel space
        const faceX = bb.originX / analysisScale;
        const faceY = bb.originY / analysisScale;
        const faceW = bb.width / analysisScale;
        const faceH = bb.height / analysisScale;

        // Compute ideal crop rectangle centered on the face
        let cropH = Math.max(450, Math.min(videoHeight, faceH * ZOOM_MULTIPLIER));
        let cropW = cropH * projectRatio;
        if (cropW > videoWidth) {
          cropW = videoWidth;
          cropH = cropW / projectRatio;
        }

        const faceCenterX = faceX + faceW / 2;
        const faceCenterY = faceY + faceH / 2;

        let cx = faceCenterX - cropW / 2;
        let cy = faceCenterY - cropH * VERTICAL_ALIGN;

        // Clamp to video bounds
        cx = Math.max(0, Math.min(cx, videoWidth - cropW));
        cy = Math.max(0, Math.min(cy, videoHeight - cropH));

        // Compute scale and position for the timeline keyframe
        const scaleX = videoWidth / cropW;
        const scaleY = videoHeight / cropH;
        const scale = Math.max(scaleX, scaleY);

        const dx = videoWidth / 2 - (cx + cropW / 2);
        const dy = videoHeight / 2 - (cy + cropH / 2);
        const factor = baseScale * scale;
        const posX = dx * factor;
        const posY = dy * factor;

        frameKeyframes.push({ clipTime: clipLocalTime, posX, posY, scale });
      }

      // --- 5. Build timeline keyframes from per-frame detections ---
      onProgress?.(82, "Building face-tracking keyframe segments...");

      const kfId = () => Math.random().toString(36).substring(2, 9);
      const timelineKeyframes: Keyframe[] = [];

      if (frameKeyframes.length === 0) {
        // No faces detected — apply single default position at t=0
        timelineKeyframes.push(
          { id: `kf-posx-${kfId()}`, time: 0, property: "position.x", value: 0, easing: "linear" },
          { id: `kf-posy-${kfId()}`, time: 0, property: "position.y", value: 0, easing: "linear" },
          { id: `kf-scalex-${kfId()}`, time: 0, property: "scale.x", value: 1, easing: "linear" },
          { id: `kf-scaley-${kfId()}`, time: 0, property: "scale.y", value: 1, easing: "linear" },
        );
      } else {
        // Calculate average values to keep the camera completely static (no panning curve/movement)
        let sumPosX = 0;
        let sumPosY = 0;
        let sumScale = 0;
        for (const kf of frameKeyframes) {
          sumPosX += kf.posX;
          sumPosY += kf.posY;
          sumScale += kf.scale;
        }
        const avgPosX = sumPosX / frameKeyframes.length;
        const avgPosY = sumPosY / frameKeyframes.length;
        const avgScale = sumScale / frameKeyframes.length;

        // Apply a single static keyframe at t=0
        timelineKeyframes.push(
          { id: `kf-posx-${kfId()}`, time: 0, property: "position.x", value: avgPosX, easing: "linear" },
          { id: `kf-posy-${kfId()}`, time: 0, property: "position.y", value: avgPosY, easing: "linear" },
          { id: `kf-scalex-${kfId()}`, time: 0, property: "scale.x", value: avgScale, easing: "linear" },
          { id: `kf-scaley-${kfId()}`, time: 0, property: "scale.y", value: avgScale, easing: "linear" },
        );
      }

      // --- 6. Apply keyframes to project store ---
      onProgress?.(95, "Applying static face centering...");
      store.updateClipKeyframes(clip.id, timelineKeyframes);

      onProgress?.(100, "Face centering complete!");

      return {
        keyframes: [],        // empty — we handled them ourselves
        outputWidth: projectWidth,
        outputHeight: projectHeight,
        success: true,
        message: frameKeyframes.length > 0
          ? "Static face centering applied (centered on speaker)"
          : "No face detected — kept default position",
      };
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
