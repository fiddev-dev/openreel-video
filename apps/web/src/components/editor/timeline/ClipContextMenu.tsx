import React from "react";
import {
  Copy,
  Layers,
  Trash2,
  Scissors,
  Music,
  Sparkles,
  Volume2,
  Film,
  Image,
  ArrowLeftToLine,
} from "lucide-react";
import type { Clip, Track } from "@openreel/core";
import { useProjectStore } from "../../../stores/project-store";
import { useTimelineStore } from "../../../stores/timeline-store";
import { useUIStore } from "../../../stores/ui-store";
import { getAutoReframeBridge } from "../../../bridges/auto-reframe-bridge";
import { toast } from "../../../stores/notification-store";
import {
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
  ContextMenuLabel,
} from "@openreel/ui";

interface ClipContextMenuProps {
  clip: Clip;
  track: Track;
  onClose?: () => void;
}

export const ClipContextMenu: React.FC<ClipContextMenuProps> = ({
  clip,
  track,
  onClose,
}) => {
  const {
    copyClips,
    duplicateClip,
    removeClip,
    rippleDeleteClip,
    splitClip,
    separateAudio,
    getMediaItem,
    copyEffects,
    pasteEffects,
    copiedEffects,
    closeGapBeforeClip,
    clearClipEffects,
    createBackgroundBlurOverlay,
  } = useProjectStore();
  const { playheadPosition } = useTimelineStore();

  const isPlayheadOnClip =
    playheadPosition >= clip.startTime &&
    playheadPosition <= clip.startTime + clip.duration;

  const hasGapBeforeClip = React.useMemo(() => {
    const sorted = [...track.clips].sort((a, b) => a.startTime - b.startTime);
    const idx = sorted.findIndex((c) => c.id === clip.id);
    if (idx < 0) return false;
    const prev = idx > 0 ? sorted[idx - 1] : null;
    const target = prev ? prev.startTime + prev.duration : 0;
    return clip.startTime - target > 0.0001;
  }, [track.clips, clip.id, clip.startTime]);

  const mediaItem = getMediaItem(clip.mediaId);
  const isVideo = track.type === "video";
  const isAudio = track.type === "audio";
  const isImage = track.type === "image";
  const isVideoWithAudio =
    isVideo &&
    mediaItem?.type === "video" &&
    mediaItem?.metadata?.channels &&
    mediaItem.metadata.channels > 0;

  const hasEffects = clip.effects && clip.effects.length > 0;
  const hasCopiedEffects = copiedEffects && copiedEffects.length > 0;
  const hasKeyframes = clip.keyframes && clip.keyframes.length > 0;
  const hasAudioEffects = clip.audioEffects && clip.audioEffects.length > 0;

  const hasTransformModified = React.useMemo(() => {
    if (!clip.transform) return false;
    const t = clip.transform;
    return (
      t.position?.x !== 0 ||
      t.position?.y !== 0 ||
      t.scale?.x !== 1 ||
      t.scale?.y !== 1 ||
      t.rotation !== 0 ||
      (t.rotate3d && (t.rotate3d.x !== 0 || t.rotate3d.y !== 0 || t.rotate3d.z !== 0))
    );
  }, [clip.transform]);

  const handleCopy = () => {
    copyClips([clip.id]);
    onClose?.();
  };

  const handleDuplicate = async () => {
    await duplicateClip(clip.id);
    onClose?.();
  };

  const handleDelete = async () => {
    await removeClip(clip.id);
    onClose?.();
  };

  const handleRippleDelete = async () => {
    await rippleDeleteClip(clip.id);
    onClose?.();
  };

  const handleSplit = async () => {
    if (isPlayheadOnClip) {
      await splitClip(clip.id, playheadPosition);
    }
    onClose?.();
  };

  const handleCloseGap = async () => {
    await closeGapBeforeClip(clip.id);
    onClose?.();
  };

  const handleSeparateAudio = async () => {
    await separateAudio(clip.id);
    onClose?.();
  };

  const handleAutoFocusFace = async () => {
    onClose?.();
    const selectedIds = useUIStore.getState().getSelectedClipIds();
    const targetIds = selectedIds.includes(clip.id) ? selectedIds : [clip.id];

    const project = useProjectStore.getState().project;
    if (!project) return;

    const validClips = targetIds
      .map((id) => {
        const c = useProjectStore.getState().getClip(id);
        if (!c) return null;
        const t = project.timeline.tracks.find((tr) => tr.id === c.trackId);
        return { clip: c, track: t };
      })
      .filter(
        (item): item is { clip: Clip; track: Track } =>
          item !== null &&
          item.track !== undefined &&
          (item.track.type === "video" || item.track.type === "image")
      );

    if (validClips.length === 0) {
      toast.warning("No Video/Image Clips", "Select at least one video or image clip to auto-focus.");
      return;
    }

    toast.info("Auto Focus Face", `Starting face tracking analysis on ${validClips.length} clip(s)...`);

    // Sequential processing to avoid memory issues with MediaPipe
    (async () => {
      let successCount = 0;
      const bridge = getAutoReframeBridge();
      for (let i = 0; i < validClips.length; i++) {
        const item = validClips[i];
        try {
          if (validClips.length > 1) {
            toast.info(
              "Auto Focus Face",
              `Analyzing clip ${i + 1}/${validClips.length}...`
            );
          }
          await bridge.runAutoFocusFace(item.clip.id);
          successCount++;
        } catch (err) {
          console.error(`Auto Focus Face failed for clip ${item.clip.id}:`, err);
          toast.error(
            "Auto Focus Failed",
            `Failed for clip ${item.clip.id}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      if (successCount > 0) {
        toast.success("Auto Focus Complete", `Successfully centered/zoomed face on ${successCount} clip(s).`);
      }
    })();
  };

  const handleBackgroundBlurOverlay = async () => {
    toast.info("Applying Background Blur Overlay", "Processing clip duplication and background styling...");
    const result = await createBackgroundBlurOverlay(clip.id);
    if (result.success) {
      toast.success("Background Blur Overlay Applied", "Successfully duplicated clip as overlay and blurred background.");
      window.dispatchEvent(new CustomEvent("openreel:preview-invalidate"));
    } else {
      toast.error("Failed to Apply", result.error?.message || "An unknown error occurred.");
    }
    onClose?.();
  };

  const handleCopyEffects = () => {
    copyEffects(clip.id);
    onClose?.();
  };

  const handlePasteEffects = async () => {
    await pasteEffects(clip.id);
    onClose?.();
  };

  const handleClearEffects = () => {
    const success = clearClipEffects(clip.id);
    if (success) {
      toast.success("Effects Removed", "Successfully reverted clip back to normal.");
    } else {
      toast.error("Failed", "Failed to remove effects from the clip.");
    }
    onClose?.();
  };

  const getClipTypeLabel = () => {
    if (isVideo) return "Video Clip";
    if (isAudio) return "Audio Clip";
    if (isImage) return "Image Clip";
    return "Clip";
  };

  const getClipTypeIcon = () => {
    if (isVideo) return <Film className="mr-2 h-3 w-3 text-primary" />;
    if (isAudio) return <Volume2 className="mr-2 h-3 w-3 text-blue-400" />;
    if (isImage) return <Image className="mr-2 h-3 w-3 text-purple-400" />;
    return null;
  };

  return (
    <ContextMenuContent className="min-w-[220px]">
      <ContextMenuLabel className="flex items-center text-[10px] text-text-muted">
        {getClipTypeIcon()}
        {getClipTypeLabel()}
      </ContextMenuLabel>
      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleCopy}>
        <Copy className="mr-2 h-4 w-4" />
        Copy Clip
        <ContextMenuShortcut>⌘C</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDuplicate}>
        <Layers className="mr-2 h-4 w-4" />
        Duplicate
        <ContextMenuShortcut>⌘D</ContextMenuShortcut>
      </ContextMenuItem>

      <ContextMenuSeparator />

      <ContextMenuItem onClick={handleSplit} disabled={!isPlayheadOnClip}>
        <Scissors className="mr-2 h-4 w-4" />
        Split at Playhead
        <ContextMenuShortcut>S</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleCloseGap} disabled={!hasGapBeforeClip}>
        <ArrowLeftToLine className="mr-2 h-4 w-4" />
        Close Gap to Previous
      </ContextMenuItem>

      {(isVideo || isImage) && (
        <>
          <ContextMenuItem onClick={handleAutoFocusFace}>
            <Sparkles className="mr-2 h-4 w-4 text-amber-400" />
            Auto Focus Face
          </ContextMenuItem>
          <ContextMenuItem onClick={handleBackgroundBlurOverlay}>
            <Layers className="mr-2 h-4 w-4 text-cyan-400" />
            Background Blur Overlay
          </ContextMenuItem>
        </>
      )}

      {(isVideo || isImage) && (
        <>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Sparkles className="mr-2 h-4 w-4" />
              Effects
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={handleCopyEffects} disabled={!hasEffects}>
                Copy Effects
              </ContextMenuItem>
              <ContextMenuItem onClick={handlePasteEffects} disabled={!hasCopiedEffects}>
                Paste Effects
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={handleClearEffects}
                disabled={!hasEffects && !hasKeyframes && !hasTransformModified}
                className="text-red-400 focus:text-red-400"
              >
                Clear All Effects & Transforms
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </>
      )}

      {isVideoWithAudio && (
        <>
          <ContextMenuSeparator />
          <ContextMenuItem onClick={handleSeparateAudio}>
            <Music className="mr-2 h-4 w-4" />
            Separate Audio
          </ContextMenuItem>
        </>
      )}

      {isAudio && (
        <>
          <ContextMenuSeparator />
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <Volume2 className="mr-2 h-4 w-4" />
              Audio
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              <ContextMenuItem onClick={handleCopyEffects} disabled={!hasEffects}>
                Copy Audio Effects
              </ContextMenuItem>
              <ContextMenuItem onClick={handlePasteEffects} disabled={!hasCopiedEffects}>
                Paste Audio Effects
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem
                onClick={handleClearEffects}
                disabled={!hasAudioEffects}
                className="text-red-400 focus:text-red-400"
              >
                Clear Audio Effects
              </ContextMenuItem>
            </ContextMenuSubContent>
          </ContextMenuSub>
        </>
      )}

      <ContextMenuSeparator />
      <ContextMenuItem onClick={handleRippleDelete} className="text-red-400">
        <Trash2 className="mr-2 h-4 w-4" />
        Ripple Delete
        <ContextMenuShortcut>⌫</ContextMenuShortcut>
      </ContextMenuItem>
      <ContextMenuItem onClick={handleDelete} className="text-red-400">
        <Trash2 className="mr-2 h-4 w-4" />
        Delete
      </ContextMenuItem>
    </ContextMenuContent>
  );
};
