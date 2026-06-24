import React, { useState, useEffect, useRef, useMemo } from "react";
import { Zap, Captions, Loader2, Upload, LayoutGrid, Sparkles } from "lucide-react";
import {
  type WhisperTranscriptionProgress,
  type CaptionAnimationStyle,
  CAPTION_ANIMATION_STYLES,
  getAnimationStyleDisplayName,
  WordHighlightRenderer,
} from "@openreel/core";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectGroup,
  SelectLabel,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@openreel/ui";
import { AutoReframeSection } from "../";
import { AutoEditPanel } from "../../panels/AutoEditPanel";
import { HighlightExtractorPanel } from "../../panels/HighlightExtractorPanel";
import { SmartBrollPanel } from "../../panels/SmartBrollPanel";
import { FaceSplitterPanel } from "../../panels/FaceSplitterPanel";
import { InspectorSection } from "../shell/InspectorSection";

export interface AiTabProps {
  clipId: string;
  clipType: string | null;
  showVideoControls: boolean;
  showAudioEffects: boolean;
  showVideoEffects: boolean;
  transcriptionProgress: WhisperTranscriptionProgress | null;
  isTranscribing: boolean;
  targetLanguage: string;
  setTargetLanguage: React.Dispatch<React.SetStateAction<string>>;
  defaultAnimationStyle: CaptionAnimationStyle;
  setDefaultAnimationStyle: React.Dispatch<
    React.SetStateAction<CaptionAnimationStyle>
  >;
  handleGenerateSubtitles: () => Promise<void>;
  handleSRTImport: (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  srtInputRef: React.RefObject<HTMLInputElement>;
  handleRemoveBackground: () => void;
  handleEnhanceAudio: () => Promise<void>;
  handleAutoColor: () => Promise<void>;
  isEnhancingAudio: boolean;
  audioEnhanced: boolean;
  isApplyingSelectedClipEffect: boolean;
}

const AnimationThumbnail: React.FC<{
  animationStyle: CaptionAnimationStyle;
  width?: number;
  height?: number;
  text?: string;
}> = ({ animationStyle, width = 76, height = 50, text = "Caption" }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;
    let startTime = Date.now();

    const fontSize = Math.max(10, Math.floor(canvas.width * 0.12));

    const wordsArray = text.split(" ").map((w, idx, arr) => {
      const step = 1.0 / arr.length;
      return {
        text: w,
        startTime: 0.1 + idx * step,
        endTime: 0.1 + (idx + 1) * step
      };
    });

    const mockSubtitle = {
      id: "preview-sub-thumb",
      text: text,
      startTime: 0,
      endTime: 1.5,
      animationStyle,
      style: {
        fontSize,
        fontFamily: "Inter",
        color: "#ffffff",
        backgroundColor: "transparent",
        highlightColor: "#0078ff",
        upcomingColor: "rgba(255, 255, 255, 0.4)",
        position: "center" as "top" | "center" | "bottom",
      },
      words: wordsArray,
    };

    const render = () => {
      const elapsed = ((Date.now() - startTime) % 1800) / 1000;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background
      ctx.fillStyle = "#1e1e24";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      WordHighlightRenderer.render(
        ctx,
        mockSubtitle,
        elapsed,
        canvas.width,
        canvas.height
      );

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [animationStyle, text]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="w-full h-auto block rounded"
    />
  );
};

export const AiTab: React.FC<AiTabProps> = ({
  clipId,
  clipType,
  showVideoControls,
  showAudioEffects,
  showVideoEffects,
  transcriptionProgress,
  isTranscribing,
  targetLanguage,
  setTargetLanguage,
  defaultAnimationStyle,
  setDefaultAnimationStyle,
  handleGenerateSubtitles,
  handleSRTImport,
  srtInputRef,
  handleRemoveBackground,
  handleEnhanceAudio,
  handleAutoColor,
  isEnhancingAudio,
  audioEnhanced,
  isApplyingSelectedClipEffect,
}) => {
  const [isMoreModalOpen, setIsMoreModalOpen] = useState(false);
  
  const visibleStyles = useMemo(() => {
    const popular = ["none", "word-highlight", "active-zoom-spring"] as CaptionAnimationStyle[];
    if (popular.includes(defaultAnimationStyle)) {
      return popular;
    }
    return [popular[0], popular[1], defaultAnimationStyle];
  }, [defaultAnimationStyle]);

  return (
    <>
      {(clipType === "video" || clipType === "audio") && (
        <>
          <InspectorSection
            title="AI Auto-Captions"
            sectionId="auto-captions"
            defaultOpen={false}
          >
            <div className="space-y-3">
              <input
                ref={srtInputRef}
                type="file"
                accept=".srt,text/srt,text/plain"
                onChange={handleSRTImport}
                className="hidden"
              />
              {/* Animation Style */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <Sparkles size={13} className="text-text-secondary" />
                  <span className="text-[10px] text-text-secondary">Animation Style</span>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {visibleStyles.map((style) => {
                    const isSelected = defaultAnimationStyle === style;
                    const name = getAnimationStyleDisplayName(style);
                    
                    return (
                      <button
                        key={style}
                        type="button"
                        onClick={() => setDefaultAnimationStyle(style)}
                        disabled={isTranscribing}
                        className={`flex flex-col items-center justify-between p-1 rounded-lg border text-center transition-all bg-background-secondary min-h-[72px] overflow-hidden ${
                          isSelected
                            ? "border-primary ring-1 ring-primary/30"
                            : "border-border/60 hover:border-border hover:bg-background-secondary/80"
                        }`}
                      >
                        <div className="w-full flex-1 flex items-center justify-center overflow-hidden rounded mb-1 bg-[#1e1e24]">
                          <AnimationThumbnail animationStyle={style} />
                        </div>
                        <span className="text-[8px] font-medium text-text-primary truncate w-full px-0.5">
                          {name}
                        </span>
                      </button>
                    );
                  })}
                  
                  {/* More button */}
                  <button
                    type="button"
                    onClick={() => setIsMoreModalOpen(true)}
                    disabled={isTranscribing}
                    className="flex flex-col items-center justify-center p-1 rounded-lg border border-border/60 hover:border-border bg-background-secondary hover:bg-background-secondary/80 min-h-[72px]"
                  >
                    <div className="flex-1 flex items-center justify-center text-text-secondary hover:text-text-primary">
                      <LayoutGrid size={16} />
                    </div>
                    <span className="text-[8px] font-medium text-text-primary mt-1">
                      More
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] text-text-secondary block mb-1">
                  Target Language
                </label>
                <Select
                  value={targetLanguage}
                  onValueChange={setTargetLanguage}
                  disabled={isTranscribing}
                >
                  <SelectTrigger className="w-full bg-background-secondary border-border text-text-primary text-[11px]">
                    <SelectValue placeholder="Original (no translation)" />
                  </SelectTrigger>
                  <SelectContent className="bg-background-secondary border-border">
                    <SelectItem value="none">Original (no translation)</SelectItem>
                    <SelectGroup>
                      <SelectLabel className="text-[10px]">Translate to</SelectLabel>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="es">Spanish</SelectItem>
                      <SelectItem value="fr">French</SelectItem>
                      <SelectItem value="de">German</SelectItem>
                      <SelectItem value="pt">Portuguese</SelectItem>
                      <SelectItem value="it">Italian</SelectItem>
                      <SelectItem value="nl">Dutch</SelectItem>
                      <SelectItem value="ru">Russian</SelectItem>
                      <SelectItem value="zh">Chinese</SelectItem>
                      <SelectItem value="ja">Japanese</SelectItem>
                      <SelectItem value="ko">Korean</SelectItem>
                      <SelectItem value="ar">Arabic</SelectItem>
                      <SelectItem value="hi">Hindi</SelectItem>
                      <SelectItem value="tr">Turkish</SelectItem>
                      <SelectItem value="pl">Polish</SelectItem>
                      <SelectItem value="sv">Swedish</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              {transcriptionProgress ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2
                      size={12}
                      className="animate-spin text-primary"
                    />
                    <span className="text-[10px] text-text-primary">
                      {transcriptionProgress.message}
                    </span>
                  </div>
                  <div className="h-1.5 bg-background-tertiary rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        transcriptionProgress.phase === "error"
                          ? "bg-red-500"
                          : transcriptionProgress.phase === "complete"
                            ? "bg-green-500"
                            : "bg-primary"
                      }`}
                      style={{ width: `${transcriptionProgress.progress}%` }}
                    />
                  </div>
                </div>
              ) : (
                <button
                  onClick={handleGenerateSubtitles}
                  disabled={isTranscribing}
                  className="w-full py-2 bg-primary hover:bg-primary/80 text-black rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-2"
                >
                  <Captions size={14} />
                  Generate Captions
                </button>
              )}
              <button
                onClick={() => srtInputRef.current?.click()}
                disabled={isTranscribing}
                className="w-full py-2 bg-background-tertiary hover:bg-background-tertiary/80 border border-border text-text-primary rounded-lg text-[11px] font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <Upload size={13} />
                Import SRT File
              </button>
            </div>
          </InspectorSection>
        </>
      )}

      {clipType === "video" && (
        <InspectorSection
          title="Auto Reframe"
          sectionId="auto-reframe"
          defaultOpen={false}
        >
          <AutoReframeSection clipId={clipId} />
        </InspectorSection>
      )}

      {clipType === "video" && (
        <InspectorSection
          title="AI Face Scene Splitter"
          sectionId="ai-face-splitter"
          defaultOpen={false}
        >
          <FaceSplitterPanel clipId={clipId} />
        </InspectorSection>
      )}

      {showAudioEffects && (
        <InspectorSection
          title="Beat-Synced Auto-Edit"
          sectionId="auto-edit"
          defaultOpen={false}
        >
          <AutoEditPanel onClose={() => {}} />
        </InspectorSection>
      )}

      {showAudioEffects && (
        <InspectorSection
          title="AI Highlights"
          sectionId="ai-highlights"
          defaultOpen={false}
        >
          <HighlightExtractorPanel clipId={clipId} />
        </InspectorSection>
      )}

      {clipType === "video" && (
        <InspectorSection
          title="AI Smart B-Roll"
          sectionId="ai-smart-broll"
          defaultOpen={false}
        >
          <SmartBrollPanel clipId={clipId} />
        </InspectorSection>
      )}

      {(showVideoControls || showAudioEffects || showVideoEffects) && (
        <div className="border border-primary/30 bg-primary/5 rounded-xl p-4 relative overflow-hidden">
          <div className="flex items-center gap-2 text-primary mb-3">
            <Zap size={14} />
            <span className="text-xs font-bold">Quick Actions</span>
          </div>
          <div className="space-y-2">
            {showVideoControls && (
              <button
                onClick={handleRemoveBackground}
                disabled={isApplyingSelectedClipEffect}
                className={`w-full py-2 border rounded-lg text-[10px] transition-all ${
                  isApplyingSelectedClipEffect
                    ? "bg-background-tertiary border-border text-text-muted cursor-not-allowed"
                    : "bg-background-tertiary hover:bg-primary hover:text-white border-border hover:border-primary"
                }`}
              >
                Remove Background
              </button>
            )}
            {showAudioEffects && (
              <button
                onClick={handleEnhanceAudio}
                disabled={isEnhancingAudio || isApplyingSelectedClipEffect}
                className={`w-full py-2 border rounded-lg text-[10px] transition-all flex items-center justify-center gap-1.5 ${
                  audioEnhanced
                    ? "bg-green-500/20 border-green-500 text-green-400"
                    : isEnhancingAudio || isApplyingSelectedClipEffect
                      ? "bg-background-tertiary border-border text-text-muted cursor-not-allowed"
                      : "bg-background-tertiary hover:bg-primary hover:text-white border-border hover:border-primary"
                }`}
              >
                {isEnhancingAudio ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Cleaning up...
                  </>
                ) : audioEnhanced ? (
                  "✓ Noise Reduced"
                ) : (
                  "Quick Dialogue Cleanup"
                )}
              </button>
            )}
            {showVideoEffects && (
              <button
                onClick={handleAutoColor}
                disabled={isApplyingSelectedClipEffect}
                className={`w-full py-2 border rounded-lg text-[10px] transition-all ${
                  isApplyingSelectedClipEffect
                    ? "bg-background-tertiary border-border text-text-muted cursor-not-allowed"
                    : "bg-background-tertiary hover:bg-primary hover:text-white border-border hover:border-primary"
                }`}
              >
                {isApplyingSelectedClipEffect ? "Applying..." : "Auto-Color"}
              </button>
            )}
          </div>
        </div>
      )}

      {/* More Animations Modal */}
      <Dialog open={isMoreModalOpen} onOpenChange={setIsMoreModalOpen}>
        <DialogContent className="max-w-2xl bg-background-secondary border-border p-5 overflow-hidden flex flex-col max-h-[85vh] rounded-xl">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-sm font-bold text-text-primary flex items-center gap-2">
              <Sparkles size={16} className="text-primary" />
              Caption Animation Styles
            </DialogTitle>
          </DialogHeader>
          
          <div className="flex-1 overflow-y-auto pr-1 custom-scrollbar">
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 p-1">
              {CAPTION_ANIMATION_STYLES.map((style) => {
                const isSelected = defaultAnimationStyle === style;
                const name = getAnimationStyleDisplayName(style);
                
                return (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      setDefaultAnimationStyle(style);
                      setIsMoreModalOpen(false);
                    }}
                    className={`flex flex-col p-1.5 rounded-lg border text-center transition-all bg-background-tertiary ${
                      isSelected
                        ? "border-primary ring-1 ring-primary/40 bg-primary/5"
                        : "border-border/50 hover:border-border hover:bg-background-tertiary/80"
                    }`}
                  >
                    <div className="w-full aspect-[4/3] rounded overflow-hidden mb-1.5 bg-[#1e1e24] flex items-center justify-center">
                      <AnimationThumbnail 
                        animationStyle={style} 
                        width={120} 
                        height={90} 
                        text={name} 
                      />
                    </div>
                    <span className="text-[9px] font-semibold text-text-primary truncate w-full px-0.5">
                      {name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
