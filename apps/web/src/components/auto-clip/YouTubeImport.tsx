/**
 * YouTubeImport — input a YouTube URL and preview the video thumbnail.
 * Uses YouTube oEmbed API (no auth required, CORS-friendly) for thumbnail.
 * Actual video download requires a backend proxy.
 */
import { useState, useCallback } from "react";
import { Youtube, Loader2, AlertCircle, CheckCircle2, X } from "lucide-react";

interface YouTubeImportProps {
  onVideoSelected: (videoId: string, title: string, thumbnailUrl: string, youtubeUrl: string) => void;
  currentVideo?: { title: string; thumbnailUrl: string } | null;
  onClear?: () => void;
}

function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([^&\n?#]+)/,
    /youtube\.com\/embed\/([^&\n?#]+)/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

export const YouTubeImport: React.FC<YouTubeImportProps> = ({
  onVideoSelected,
  currentVideo,
  onClear,
}) => {
  const [url, setUrl] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; thumbnail: string } | null>(null);

  const handleFetch = useCallback(async () => {
    setError(null);
    const videoId = extractYouTubeId(url.trim());
    if (!videoId) {
      setError("Invalid YouTube URL. Please paste a valid YouTube or YouTube Shorts link.");
      return;
    }

    setIsLoading(true);
    try {
      const resp = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`
      );
      if (!resp.ok) throw new Error("Video not found or is private.");
      const data = await resp.json();
      const thumbnail = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
      setPreview({ title: data.title, thumbnail });
      onVideoSelected(videoId, data.title, thumbnail, url.trim());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch video info.");
    } finally {
      setIsLoading(false);
    }
  }, [url, onVideoSelected]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleFetch();
    },
    [handleFetch]
  );

  if (currentVideo) {
    return (
      <div className="relative rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)] overflow-hidden">
        <div className="flex gap-4 p-4 items-center">
          <div className="relative flex-shrink-0">
            <img
              src={currentVideo.thumbnailUrl}
              alt={currentVideo.title}
              className="w-28 h-16 object-cover rounded-xl"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  `https://img.youtube.com/vi/${currentVideo.thumbnailUrl.split("/vi/")[1]?.split("/")[0]}/hqdefault.jpg`;
              }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 bg-red-600 rounded-full flex items-center justify-center">
                <Youtube size={14} className="text-white" fill="white" />
              </div>
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 size={14} className="text-[var(--accent)] flex-shrink-0" />
              <span className="text-xs font-medium text-[var(--accent)]">YouTube video ready</span>
            </div>
            <p className="text-sm font-semibold text-[var(--fg)] line-clamp-2">
              {currentVideo.title}
            </p>
            <p className="text-xs text-[var(--fg-3)] mt-1">
              ⚠️ Video processing requires backend — URL saved for demo
            </p>
          </div>
        </div>
        {onClear && (
          <button
            onClick={onClear}
            className="absolute top-3 right-3 w-7 h-7 rounded-full bg-[var(--bg-3)] hover:bg-[var(--border-strong)] flex items-center justify-center transition-colors"
          >
            <X size={14} className="text-[var(--fg-2)]" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* URL Input */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Youtube
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-red-500"
          />
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Paste YouTube or Shorts URL..."
            className="w-full pl-9 pr-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-2)] text-sm text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        <button
          onClick={handleFetch}
          disabled={!url.trim() || isLoading}
          className="px-5 py-3 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-sm font-semibold hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center gap-2"
        >
          {isLoading ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            "Import"
          )}
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
          <AlertCircle size={14} className="text-red-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {/* Preview */}
      {preview && !error && (
        <div className="flex gap-3 p-3 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] items-center">
          <img
            src={preview.thumbnail}
            alt={preview.title}
            className="w-20 h-12 object-cover rounded-lg flex-shrink-0"
          />
          <div className="min-w-0">
            <p className="text-xs text-[var(--accent)] font-medium mb-0.5">Found!</p>
            <p className="text-sm text-[var(--fg)] font-medium line-clamp-1">{preview.title}</p>
          </div>
        </div>
      )}

      <p className="text-xs text-[var(--fg-muted)]">
        Supports youtube.com/watch, youtu.be, and YouTube Shorts links
      </p>
    </div>
  );
};
