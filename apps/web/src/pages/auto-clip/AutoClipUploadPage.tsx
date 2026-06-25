/**
 * AutoClipUploadPage — Step 1: Upload video from device or YouTube URL.
 */
import { useState, useCallback } from "react";
import { HardDrive, Youtube, ArrowRight } from "lucide-react";
import { AutoClipLayout } from "../../components/auto-clip/AutoClipLayout";
import { VideoUploadZone } from "../../components/auto-clip/VideoUploadZone";
import { YouTubeImport } from "../../components/auto-clip/YouTubeImport";
import { useAutoClipStore } from "../../stores/auto-clip-store";
import { useRouter } from "../../hooks/use-router";

type UploadTab = "device" | "youtube";

export const AutoClipUploadPage: React.FC = () => {
  const { navigate } = useRouter();
  const { videoSource, setVideoSource } = useAutoClipStore();
  const [activeTab, setActiveTab] = useState<UploadTab>("device");

  const handleFileSelected = useCallback(
    (file: File, _url: string, duration: number) => {
      // Create a stable object URL for the session
      const stableUrl = URL.createObjectURL(file);
      setVideoSource({
        type: "file",
        file,
        url: stableUrl,
        name: file.name,
        duration,
      });
    },
    [setVideoSource]
  );

  const handleYouTubeSelected = useCallback(
    (videoId: string, title: string, thumbnailUrl: string, youtubeUrl: string) => {
      setVideoSource({ type: "youtube", videoId, title, thumbnailUrl, youtubeUrl });
    },
    [setVideoSource]
  );

  const handleClear = useCallback(() => {
    setVideoSource(null);
  }, [setVideoSource]);

  const hasVideo = videoSource !== null;
  const videoName =
    videoSource?.type === "file" ? videoSource.name : videoSource?.title ?? "";

  return (
    <AutoClipLayout
      backRoute="welcome"
      backLabel="Home"
      title="Upload Video"
      step={1}
      totalSteps={3}
    >
      <div className="max-w-2xl mx-auto px-6 py-12">
        {/* Headline */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-[var(--fg)] tracking-tight mb-3">
            Upload your video
          </h1>
          <p className="text-base text-[var(--fg-3)]">
            Upload a long-form video and we'll turn it into viral short clips automatically.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-[var(--bg-2)] rounded-2xl p-1 mb-8 gap-1">
          <button
            id="upload-tab-device"
            onClick={() => setActiveTab("device")}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
              transition-all duration-200
              ${activeTab === "device"
                ? "bg-[var(--bg-1)] text-[var(--fg)] shadow-sm"
                : "text-[var(--fg-3)] hover:text-[var(--fg)]"}
            `}
          >
            <HardDrive size={16} />
            Upload from Device
          </button>
          <button
            id="upload-tab-youtube"
            onClick={() => setActiveTab("youtube")}
            className={`
              flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-medium
              transition-all duration-200
              ${activeTab === "youtube"
                ? "bg-[var(--bg-1)] text-[var(--fg)] shadow-sm"
                : "text-[var(--fg-3)] hover:text-[var(--fg)]"}
            `}
          >
            <Youtube size={16} className="text-red-500" />
            YouTube Link
          </button>
        </div>

        {/* Tab content */}
        <div className="mb-8">
          {activeTab === "device" ? (
            <VideoUploadZone
              onFileSelected={handleFileSelected}
              currentFile={
                videoSource?.type === "file"
                  ? { name: videoSource.name, url: videoSource.url }
                  : null
              }
              onClear={handleClear}
            />
          ) : (
            <div className="p-6 rounded-2xl border border-[var(--border)] bg-[var(--bg-2)]">
              <YouTubeImport
                onVideoSelected={handleYouTubeSelected}
                currentVideo={
                  videoSource?.type === "youtube"
                    ? { title: videoSource.title, thumbnailUrl: videoSource.thumbnailUrl }
                    : null
                }
                onClear={handleClear}
              />
            </div>
          )}
        </div>

        {/* Tips */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {[
            { emoji: "⏱️", text: "Works best with videos 5–90 minutes long" },
            { emoji: "🎯", text: "Talks, podcasts, interviews perform best" },
            { emoji: "✂️", text: "Creates up to 10 optimized short clips" },
          ].map((tip, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center gap-2 p-4 rounded-xl bg-[var(--bg-2)] border border-[var(--border)]"
            >
              <span className="text-2xl">{tip.emoji}</span>
              <p className="text-xs text-[var(--fg-3)] leading-snug">{tip.text}</p>
            </div>
          ))}
        </div>

        {/* Next button */}
        <button
          id="upload-next-btn"
          disabled={!hasVideo}
          onClick={() => navigate("clip-config")}
          className={`
            w-full flex items-center justify-center gap-2 py-4 rounded-2xl
            text-base font-semibold transition-all duration-200
            ${hasVideo
              ? "bg-[var(--accent)] text-[var(--accent-fg)] hover:opacity-90 shadow-lg shadow-[var(--accent-glow)]"
              : "bg-[var(--bg-3)] text-[var(--fg-muted)] cursor-not-allowed"}
          `}
        >
          {hasVideo ? (
            <>
              Continue with "{videoName.length > 40 ? videoName.slice(0, 40) + "…" : videoName}"
              <ArrowRight size={18} />
            </>
          ) : (
            "Select a video to continue"
          )}
        </button>
      </div>
    </AutoClipLayout>
  );
};
