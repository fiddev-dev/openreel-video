/**
 * ClipCard — compact card showing clip info in the results sidebar.
 */
import { Star } from "lucide-react";
import type { GeneratedClip } from "../../stores/auto-clip-store";

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

interface ClipCardProps {
  clip: GeneratedClip;
  isSelected: boolean;
  onClick: () => void;
}

export const ClipCard: React.FC<ClipCardProps> = ({ clip, isSelected, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-150 text-left
        ${isSelected
          ? "border-[var(--accent)] bg-[var(--accent-soft)]"
          : "border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-2)]"}
      `}
    >
      {/* Thumbnail mock */}
      <div
        className="relative flex-shrink-0 w-16 h-28 rounded-lg overflow-hidden"
        style={{ background: clip.thumbnailColor }}
      >
        <div className="absolute inset-0 flex items-end p-1.5">
          <span className="text-white text-[10px] font-bold bg-black/40 px-1.5 py-0.5 rounded">
            {formatTime(clip.duration)}
          </span>
        </div>
        <div className="absolute top-1.5 left-1.5">
          <span className="text-white text-[10px] font-black">#{clip.index}</span>
        </div>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-[var(--fg)] line-clamp-2 leading-snug mb-2">
          {clip.title}
        </p>

        {/* Viral score */}
        <div className="flex items-center gap-1 mb-2">
          <Star size={10} className="text-amber-400 fill-amber-400" />
          <span className="text-[10px] font-bold text-amber-400">{clip.viralScore}</span>
          <span className="text-[10px] text-[var(--fg-muted)]">/10</span>
        </div>

        {/* Tags */}
        <div className="flex flex-wrap gap-1">
          {clip.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-[var(--bg-3)] text-[var(--fg-3)] uppercase tracking-wide"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>
    </button>
  );
};
