import { initializeAutoReframeEngine } from "@openreel/core";
import { useProjectStore } from "../stores/project-store";
import { loadMediaBlob } from "../services/media-storage";

export type FaceSplitterProgressCallback = (progress: number, message: string) => void;

export interface FaceSplitterResult {
  success: boolean;
  splitsApplied: number;
  error?: string;
}

export class FaceSplitterBridge {
  async runFaceSplitter(
    clipId: string,
    minDuration: number,
    onProgress?: FaceSplitterProgressCallback
  ): Promise<FaceSplitterResult> {
    const store = useProjectStore.getState();
    const clip = store.getClip(clipId);

    if (!clip) {
      throw new Error("Clip not found");
    }

    const mediaItem = store.getMediaItem(clip.mediaId);
    if (!mediaItem) {
      throw new Error("Media item not found");
    }

    // 1. Initialize Auto Reframe Engine (contains the Face Detector model)
    onProgress?.(5, "Initializing face detection engine...");
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

    const frames: ImageBitmap[] = [];

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject(new Error("Failed to load video metadata"));
      });

      const inPoint = clip.inPoint ?? 0;
      const outPoint = (clip.outPoint ?? video.duration) || 10;
      const clipDuration = outPoint - inPoint;

      // Extract at 10 fps to achieve frame-level precision (0.1s steps)
      const fps = 10;
      const step = 1 / fps;
      const canvas = document.createElement("canvas");

      // Limit resolution of analysis frames to speed up detection and save memory
      const scale = Math.min(1, 1080 / video.videoWidth);
      canvas.width = video.videoWidth * scale;
      canvas.height = video.videoHeight * scale;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get canvas context");
      }

      const totalFrames = Math.ceil(clipDuration * fps);
      let frameIdx = 0;

      // Seek and draw frames
      for (let time = inPoint; time < outPoint; time += step) {
        video.currentTime = time;
        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const bitmap = await createImageBitmap(canvas);
        frames.push(bitmap);

        frameIdx++;
        const extractProgress = 20 + Math.round((frameIdx / totalFrames) * 30);
        onProgress?.(extractProgress, `Extracting frames (${frameIdx}/${totalFrames})...`);
      }

      // 4. Run AI analysis
      onProgress?.(50, "Running AI face analysis...");
      const rawStates: string[] = [];

      for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        const progress = 50 + Math.round((i / frames.length) * 40);
        onProgress?.(progress, `AI analyzing frame ${i + 1}/${frames.length}...`);

        const detections = await engine.detectFacesRaw(frame);

        if (detections.length === 0) {
          rawStates.push("no_face");
        } else {
          // Get the largest face detection to represent the main subject
          const largestFace = detections.reduce((largest, current) => {
            const areaL = (largest.boundingBox?.width || 0) * (largest.boundingBox?.height || 0);
            const areaC = (current.boundingBox?.width || 0) * (current.boundingBox?.height || 0);
            return areaC > areaL ? current : largest;
          }, detections[0]);

          const state = this.classifyFaceState(largestFace);
          rawStates.push(state);
        }
      }

      if (rawStates.length === 0) {
        onProgress?.(100, "Complete: No frames analyzed.");
        return { success: true, splitsApplied: 0 };
      }

      // 5. Pre-smooth: absorb short no_face gaps into surrounding face state.
      //    If no_face persists < 2 seconds (20 frames @ 10fps), it's likely
      //    a detection miss rather than a real scene change — fill it in.
      const NO_FACE_ABSORB_FRAMES = 20; // 2 seconds @ 10fps
      const absorbedStates = this.absorbShortNoFaceGaps(rawStates, NO_FACE_ABSORB_FRAMES);

      // 6. Apply temporal smoothing (sliding window majority vote, window = 15 frames = 1.5s)
      const smoothedStates = this.smoothStates(absorbedStates, 15);

      // 7. Construct initial segments from the smoothed states — skip no_face as its own segment
      const rawSplitTimes: number[] = [];
      for (let i = 1; i < smoothedStates.length; i++) {
        if (smoothedStates[i] !== smoothedStates[i - 1]) {
          rawSplitTimes.push(clip.startTime + i * step);
        }
      }

      const segments: Array<{ state: string; startTime: number; endTime: number; duration: number }> = [];
      let prevTime = clip.startTime;
      for (let i = 0; i < rawSplitTimes.length; i++) {
        const t = rawSplitTimes[i];
        const frameIdx = Math.round((prevTime - clip.startTime) / step);
        const state = smoothedStates[frameIdx] || smoothedStates[0];
        segments.push({
          state,
          startTime: prevTime,
          endTime: t,
          duration: t - prevTime,
        });
        prevTime = t;
      }
      const lastFrameIdx = Math.round((prevTime - clip.startTime) / step);
      const lastState = smoothedStates[lastFrameIdx] || smoothedStates[smoothedStates.length - 1];
      segments.push({
        state: lastState,
        startTime: prevTime,
        endTime: clip.startTime + clip.duration,
        duration: (clip.startTime + clip.duration) - prevTime,
      });

      // 8. Enforce minimum duration constraint by merging short segments
      let merged = true;
      while (merged && segments.length > 1) {
        merged = false;
        for (let i = 0; i < segments.length; i++) {
          if (segments[i].duration < minDuration) {
            let mergeTargetIdx = -1;
            if (i === 0) {
              mergeTargetIdx = 1;
            } else if (i === segments.length - 1) {
              mergeTargetIdx = segments.length - 2;
            } else {
              const prev = segments[i - 1];
              const next = segments[i + 1];
              mergeTargetIdx = prev.duration < next.duration ? i - 1 : i + 1;
            }

            if (mergeTargetIdx !== -1) {
              const segA = segments[Math.min(i, mergeTargetIdx)];
              const segB = segments[Math.max(i, mergeTargetIdx)];

              // Merge segB into segA
              segA.endTime = segB.endTime;
              segA.duration = segA.endTime - segA.startTime;

              // Remove segB
              segments.splice(Math.max(i, mergeTargetIdx), 1);
              merged = true;
              break;
            }
          }
        }
      }

      // 9. Collect final split times (boundaries between the remaining segments)
      const finalSplitTimes: number[] = [];
      for (let i = 0; i < segments.length - 1; i++) {
        finalSplitTimes.push(segments[i].endTime);
      }

      if (finalSplitTimes.length === 0) {
        onProgress?.(100, "Complete: No splits required.");
        return { success: true, splitsApplied: 0 };
      }

      // 10. Execute splits in reverse chronological (descending) order on the timeline
      onProgress?.(95, `Applying ${finalSplitTimes.length} split(s)...`);
      const sortedSplitTimes = [...finalSplitTimes].sort((a, b) => b - a);

      const actionHistory = store.actionHistory;
      actionHistory.beginGroup("AI Face Scene Splitter");

      let splitsApplied = 0;
      try {
        for (const splitTime of sortedSplitTimes) {
          const splitResult = await store.splitClip(clipId, splitTime);
          if (splitResult.success) {
            splitsApplied++;
          }
        }
      } finally {
        actionHistory.endGroup();
      }

      onProgress?.(100, `Complete: successfully split into ${splitsApplied + 1} scenes!`);
      return { success: true, splitsApplied };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error occurred";
      return { success: false, splitsApplied: 0, error: message };
    } finally {
      // Memory safety: guaranteed disposal of bitmaps to prevent GPU leaks
      frames.forEach((f) => {
        try {
          f.close();
        } catch (e) {
          // Ignore if already closed
        }
      });
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    }
  }

  private classifyFaceState(detection: any): "front_face" | "side_face" {
    if (!detection || !detection.keypoints || detection.keypoints.length < 6) {
      return "front_face";
    }

    const keypoints = detection.keypoints;
    const nose = keypoints[2];
    const leftEye = keypoints[1];
    const rightEye = keypoints[0];
    const leftEar = keypoints[5];
    const rightEar = keypoints[4];

    if (!nose) return "front_face";

    let ratio = 0.5;

    // Prioritize eye keypoints for head turn detection
    if (leftEye && rightEye) {
      const distLeft = Math.abs(nose.x - leftEye.x);
      const distRight = Math.abs(nose.x - rightEye.x);
      const total = distLeft + distRight;
      if (total > 0) {
        ratio = distLeft / total;
      }
    } else if (leftEar && rightEar) {
      const distLeft = Math.abs(nose.x - leftEar.x);
      const distRight = Math.abs(nose.x - rightEar.x);
      const total = distLeft + distRight;
      if (total > 0) {
        ratio = distLeft / total;
      }
    }

    // Wider tolerance: head must be clearly turned (outside 0.30–0.70) to count as side_face.
    // Reduces false splits from minor head movements or slight camera angles.
    if (ratio >= 0.30 && ratio <= 0.70) {
      return "front_face";
    } else {
      return "side_face";
    }
  }

  /**
   * Fills short `no_face` runs with the most recent non-no_face state seen before that run.
   * This prevents momentary face-detection misses from being treated as real scene transitions.
   */
  private absorbShortNoFaceGaps(states: string[], maxGapFrames: number): string[] {
    const result = [...states];
    let prevFaceState = "front_face"; // fallback if clip starts with no_face

    let i = 0;
    while (i < result.length) {
      if (result[i] === "no_face") {
        // Find end of this no_face run
        let j = i;
        while (j < result.length && result[j] === "no_face") {
          j++;
        }
        const runLength = j - i;

        if (runLength <= maxGapFrames) {
          // Short gap — fill with the prevFaceState (absorb into surroundings)
          for (let k = i; k < j; k++) {
            result[k] = prevFaceState;
          }
        }
        // else: long no_face run → keep as is
        i = j;
      } else {
        prevFaceState = result[i];
        i++;
      }
    }

    return result;
  }

  private smoothStates(states: string[], windowSize: number = 7): string[] {
    const smoothed: string[] = [];
    const half = Math.floor(windowSize / 2);
    for (let i = 0; i < states.length; i++) {
      const counts: Record<string, number> = {};
      const start = Math.max(0, i - half);
      const end = Math.min(states.length - 1, i + half);
      for (let j = start; j <= end; j++) {
        const state = states[j];
        counts[state] = (counts[state] || 0) + 1;
      }
      let maxState = states[i];
      let maxCount = 0;
      for (const state of Object.keys(counts)) {
        if (counts[state] > maxCount) {
          maxCount = counts[state];
          maxState = state;
        }
      }
      smoothed.push(maxState);
    }
    return smoothed;
  }
}

let faceSplitterBridgeInstance: FaceSplitterBridge | null = null;

export function getFaceSplitterBridge(): FaceSplitterBridge {
  if (!faceSplitterBridgeInstance) {
    faceSplitterBridgeInstance = new FaceSplitterBridge();
  }
  return faceSplitterBridgeInstance;
}
