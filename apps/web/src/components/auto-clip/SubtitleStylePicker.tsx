/**
 * SubtitleStylePicker — grid of animated subtitle style previews.
 * Each card shows a live CSS animation demo of the subtitle style.
 */
import type { SubtitleStyle } from "../../stores/auto-clip-store";

interface StyleOption {
  id: SubtitleStyle;
  label: string;
  previewText: string;
  animationClass: string;
  description: string;
}

const STYLE_OPTIONS: StyleOption[] = [
  {
    id: "bounce",
    label: "Bounce",
    previewText: "Bounce",
    animationClass: "subtitle-bounce",
    description: "Energetic word-by-word bounce",
  },
  {
    id: "typewriter",
    label: "Typewriter",
    previewText: "Typewriter",
    animationClass: "subtitle-typewriter",
    description: "Classic character reveal",
  },
  {
    id: "pop-in",
    label: "Pop In",
    previewText: "Pop In",
    animationClass: "subtitle-pop-in",
    description: "Punchy scale entrance",
  },
  {
    id: "slide-up",
    label: "Slide Up",
    previewText: "Slide Up",
    animationClass: "subtitle-slide-up",
    description: "Smooth upward reveal",
  },
  {
    id: "glow-pulse",
    label: "Glow Pulse",
    previewText: "Glow",
    animationClass: "subtitle-glow-pulse",
    description: "Neon glow pulsing effect",
  },
  {
    id: "spring-zoom",
    label: "Spring Zoom",
    previewText: "Spring",
    animationClass: "subtitle-spring-zoom",
    description: "Spring physics zoom-in",
  },
];

interface SubtitleStylePickerProps {
  selected: SubtitleStyle;
  onChange: (style: SubtitleStyle) => void;
}

export const SubtitleStylePicker: React.FC<SubtitleStylePickerProps> = ({
  selected,
  onChange,
}) => {
  return (
    <>
      {/* Inject animation keyframes */}
      <style>{`
        @keyframes subtitle-bounce-kf {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
        @keyframes subtitle-pop-kf {
          0% { transform: scale(0.5); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes subtitle-slide-kf {
          0% { transform: translateY(16px); opacity: 0; }
          100% { transform: translateY(0); opacity: 1; }
        }
        @keyframes subtitle-glow-kf {
          0%, 100% { text-shadow: 0 0 6px currentColor, 0 0 12px currentColor; }
          50% { text-shadow: 0 0 20px currentColor, 0 0 40px currentColor; }
        }
        @keyframes subtitle-spring-kf {
          0% { transform: scale(0); opacity: 0; }
          60% { transform: scale(1.15); opacity: 1; }
          80% { transform: scale(0.95); }
          100% { transform: scale(1); }
        }
        @keyframes subtitle-type-kf {
          from { width: 0; }
          to { width: 100%; }
        }
        .subtitle-bounce { animation: subtitle-bounce-kf 1s ease-in-out infinite; display: inline-block; }
        .subtitle-typewriter { overflow: hidden; white-space: nowrap; animation: subtitle-type-kf 1.5s steps(10) infinite alternate; display: inline-block; }
        .subtitle-pop-in { animation: subtitle-pop-kf 0.6s ease-out infinite alternate; display: inline-block; }
        .subtitle-slide-up { animation: subtitle-slide-kf 0.8s ease-out infinite alternate; display: inline-block; }
        .subtitle-glow-pulse { animation: subtitle-glow-kf 1.5s ease-in-out infinite; display: inline-block; }
        .subtitle-spring-zoom { animation: subtitle-spring-kf 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275) infinite alternate; display: inline-block; }
      `}</style>

      <div className="grid grid-cols-3 gap-3">
        {STYLE_OPTIONS.map((style) => {
          const isSelected = selected === style.id;
          return (
            <button
              key={style.id}
              onClick={() => onChange(style.id)}
              className={`
                relative flex flex-col items-center justify-center gap-2
                rounded-xl border-2 p-4 min-h-[110px] cursor-pointer
                transition-all duration-200 hover:scale-[1.02]
                ${isSelected
                  ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                  : "border-[var(--border)] bg-[var(--bg-2)] hover:border-[var(--border-strong)]"}
              `}
            >
              {/* Animation preview */}
              <div className="h-10 flex items-center justify-center">
                <span
                  className={`text-lg font-black ${style.animationClass} ${
                    isSelected ? "text-[var(--accent)]" : "text-[var(--fg-2)]"
                  }`}
                >
                  {style.previewText}
                </span>
              </div>

              {/* Label */}
              <div className="text-center">
                <p className={`text-xs font-semibold ${isSelected ? "text-[var(--accent)]" : "text-[var(--fg)]"}`}>
                  {style.label}
                </p>
                <p className="text-[10px] text-[var(--fg-muted)] leading-tight mt-0.5">
                  {style.description}
                </p>
              </div>

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-[var(--accent)] flex items-center justify-center">
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                    <path d="M1 4l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
};
