/**
 * AutoClipConfigPage — Step 2: Configure clip generation settings.
 */
import { useState, useCallback } from "react";
import {
  Subtitles,
  Focus,
  Clapperboard,
  Sparkles,
  ArrowRight,
  Clock,
  KeyRound,
} from "lucide-react";
import { AutoClipLayout } from "../../components/auto-clip/AutoClipLayout";
import { SubtitleStylePicker } from "../../components/auto-clip/SubtitleStylePicker";
import { useAutoClipStore } from "../../stores/auto-clip-store";
import { useRouter } from "../../hooks/use-router";
import type { AspectRatio, ClipLength, SubtitleStyle } from "../../stores/auto-clip-store";

// ─── Toggle Card ──────────────────────────────────────────────────────────────

interface ToggleCardProps {
  id: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (val: boolean) => void;
  badge?: string;
}

const ToggleCard: React.FC<ToggleCardProps> = ({
  icon, label, description, checked, onChange, badge,
}) => (
  <div
    className={`
      flex items-center gap-4 p-4 rounded-2xl border-2 cursor-pointer transition-all duration-150
      ${checked
        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
        : "border-[var(--border)] bg-[var(--bg-2)] hover:border-[var(--border-strong)]"}
    `}
    onClick={() => onChange(!checked)}
  >
    <div className={`
      w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors
      ${checked ? "bg-[var(--accent)]/20" : "bg-[var(--bg-3)]"}
    `}>
      {icon}
    </div>
    <div className="flex-1">
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${checked ? "text-[var(--fg)]" : "text-[var(--fg-2)]"}`}>
          {label}
        </span>
        {badge && (
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400">
            {badge}
          </span>
        )}
      </div>
      <p className="text-xs text-[var(--fg-muted)] mt-0.5">{description}</p>
    </div>
    {/* Toggle switch */}
    <div
      className={`
        w-11 h-6 rounded-full transition-all duration-200 flex-shrink-0 relative
        ${checked ? "bg-[var(--accent)]" : "bg-[var(--bg-3)]"}
      `}
    >
      <div className={`
        absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200
        ${checked ? "left-6" : "left-1"}
      `} />
    </div>
  </div>
);

// ─── Segment Picker ───────────────────────────────────────────────────────────

interface SegmentPickerProps<T extends string | number> {
  label: string;
  options: Array<{ value: T; label: string }>;
  selected: T;
  onChange: (val: T) => void;
}

function SegmentPicker<T extends string | number>({
  label, options, selected, onChange,
}: SegmentPickerProps<T>) {
  return (
    <div>
      <p className="text-xs font-semibold text-[var(--fg-2)] uppercase tracking-wider mb-2">
        {label}
      </p>
      <div className="flex bg-[var(--bg-2)] rounded-xl p-1 gap-1">
        {options.map((opt) => (
          <button
            key={String(opt.value)}
            onClick={() => onChange(opt.value)}
            className={`
              flex-1 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150
              ${selected === opt.value
                ? "bg-[var(--accent)] text-[var(--accent-fg)]"
                : "text-[var(--fg-3)] hover:text-[var(--fg)] hover:bg-[var(--bg-3)]"}
            `}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const AutoClipConfigPage: React.FC = () => {
  const { navigate } = useRouter();
  const { config, updateConfig, startProcessing, videoSource } = useAutoClipStore();

  // Redirect if no video
  if (!videoSource) {
    navigate("upload");
    return null;
  }

  const [showKeysModal, setShowKeysModal] = useState(false);
  const [tempGeminiKey, setTempGeminiKey] = useState("");
  const [tempPexelsKey, setTempPexelsKey] = useState("");

  const proceedToProcessing = useCallback(async () => {
    navigate("clip-processing");
    await startProcessing();
  }, [navigate, startProcessing]);

  const handleStart = useCallback(async () => {
    const geminiKey = localStorage.getItem("openreel:gemini_api_key") || "";
    const pexelsKey = localStorage.getItem("openreel:pexels_api_key") || "";

    const needsGeminiKey = config.enableAIClipSuggestions && !geminiKey.trim();
    const needsPexelsKey = config.enableBRoll && !pexelsKey.trim();

    if (needsGeminiKey || needsPexelsKey) {
      setTempGeminiKey(geminiKey);
      setTempPexelsKey(pexelsKey);
      setShowKeysModal(true);
      return;
    }

    await proceedToProcessing();
  }, [config, proceedToProcessing]);

  const handleSaveKeys = useCallback(async () => {
    localStorage.setItem("openreel:gemini_api_key", tempGeminiKey.trim());
    localStorage.setItem("openreel:pexels_api_key", tempPexelsKey.trim());
    setShowKeysModal(false);
    await proceedToProcessing();
  }, [tempGeminiKey, tempPexelsKey, proceedToProcessing]);

  const handleSkipKeys = useCallback(async () => {
    setShowKeysModal(false);
    await proceedToProcessing();
  }, [proceedToProcessing]);

  return (
    <AutoClipLayout
      backRoute="upload"
      backLabel="Back"
      title="Configure Clips"
      step={2}
      totalSteps={3}
    >
      <div className="max-w-2xl mx-auto px-6 py-10">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-[var(--fg)] tracking-tight mb-2">
            Configure your clips
          </h1>
          <p className="text-sm text-[var(--fg-3)]">
            Customize how your clips will be created and styled.
          </p>
        </div>

        {/* Section: Output Format */}
        <section className="mb-8">
          <h2 className="text-xs font-bold text-[var(--fg-muted)] uppercase tracking-widest mb-4">
            Output Format
          </h2>
          <div className="flex flex-col gap-3">
            <SegmentPicker<AspectRatio>
              label="Aspect Ratio"
              options={[
                { value: "9:16", label: "9:16 Shorts" },
                { value: "16:9", label: "16:9 YouTube" },
                { value: "1:1", label: "1:1 Square" },
                { value: "4:5", label: "4:5 Instagram" },
              ]}
              selected={config.aspectRatio}
              onChange={(val) => updateConfig({ aspectRatio: val })}
            />
            <SegmentPicker<ClipLength>
              label="Max Clip Length"
              options={[
                { value: 15, label: "≤15s" },
                { value: 30, label: "≤30s" },
                { value: 60, label: "≤60s" },
                { value: "auto", label: "Auto" },
              ]}
              selected={config.clipLength}
              onChange={(val) => updateConfig({ clipLength: val })}
            />
            <SegmentPicker<number>
              label="Min Clip Duration"
              options={[
                { value: 5, label: "≥5s" },
                { value: 10, label: "≥10s" },
                { value: 20, label: "≥20s" },
                { value: 30, label: "≥30s" },
              ]}
              selected={config.minClipDuration}
              onChange={(val) => updateConfig({ minClipDuration: val as number })}
            />
          </div>
        </section>

        {/* Section: AI Features */}
        <section className="mb-8">
          <h2 className="text-xs font-bold text-[var(--fg-muted)] uppercase tracking-widest mb-4">
            AI Features
          </h2>
          <div className="flex flex-col gap-3">
            <ToggleCard
              id="config-ai-suggestions"
              icon={<Sparkles size={18} className={config.enableAIClipSuggestions ? "text-violet-400" : "text-[var(--fg-3)]"} />}
              label="AI Viral Suggestions"
              description="Score and rank clips by viral potential using AI"
              checked={config.enableAIClipSuggestions}
              onChange={(val) => updateConfig({ enableAIClipSuggestions: val })}
              badge="AI"
            />
            <ToggleCard
              id="config-face-focus"
              icon={<Focus size={18} className={config.enableFaceFocus ? "text-[var(--accent)]" : "text-[var(--fg-3)]"} />}
              label="AI Face Scene Splitter"
              description="Auto-split clip into multiple scenes based on speaker face orientation & focus"
              checked={config.enableFaceFocus}
              onChange={(val) => updateConfig({ enableFaceFocus: val })}
            />
            <ToggleCard
              id="config-broll"
              icon={<Clapperboard size={18} className={config.enableBRoll ? "text-[var(--accent)]" : "text-[var(--fg-3)]"} />}
              label="Auto B-Roll"
              description="Insert relevant b-roll footage between cuts automatically"
              checked={config.enableBRoll}
              onChange={(val) => updateConfig({ enableBRoll: val })}
              badge="Beta"
            />
          </div>
        </section>

        {/* Section: Subtitles */}
        <section className="mb-10">
          <h2 className="text-xs font-bold text-[var(--fg-muted)] uppercase tracking-widest mb-4">
            Subtitles
          </h2>
          <ToggleCard
            id="config-subtitle"
            icon={<Subtitles size={18} className={config.enableSubtitle ? "text-[var(--accent)]" : "text-[var(--fg-3)]"} />}
            label="Auto Subtitles"
            description="Generate and burn-in styled captions from speech"
            checked={config.enableSubtitle}
            onChange={(val) => updateConfig({ enableSubtitle: val })}
          />

          {config.enableSubtitle && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-[var(--fg-2)] uppercase tracking-wider mb-3">
                Subtitle Style
              </p>
              <SubtitleStylePicker
                selected={config.subtitleStyle}
                onChange={(style: SubtitleStyle) => updateConfig({ subtitleStyle: style })}
              />
            </div>
          )}
        </section>

        {/* Summary card */}
        <div className="p-4 rounded-2xl bg-[var(--bg-2)] border border-[var(--border)] mb-6">
          <p className="text-xs font-semibold text-[var(--fg-3)] mb-2">Summary</p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: config.aspectRatio, icon: "📐" },
              { label: config.clipLength === "auto" ? "Auto length" : `≤${config.clipLength}s`, icon: "⏱️" },
              { label: `Min ${config.minClipDuration}s`, icon: "⬇️" },
              config.enableSubtitle && { label: `${config.subtitleStyle} subtitles`, icon: "💬" },
              config.enableFaceFocus && { label: "Face splitter", icon: "👤" },
              config.enableBRoll && { label: "B-Roll", icon: "🎬" },
              config.enableAIClipSuggestions && { label: "AI scoring", icon: "✨" },
            ]
              .filter(Boolean)
              .map((item, i) => (
                <span
                  key={i}
                  className="text-xs px-2.5 py-1 rounded-lg bg-[var(--bg-3)] text-[var(--fg-2)] flex items-center gap-1"
                >
                  {(item as { label: string; icon: string }).icon}
                  {(item as { label: string; icon: string }).label}
                </span>
              ))}
          </div>
        </div>

        {/* Start button */}
        <button
          id="config-start-btn"
          onClick={handleStart}
          className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-[var(--accent)] text-[var(--accent-fg)] text-base font-semibold hover:opacity-90 transition-all duration-200 shadow-lg shadow-[var(--accent-glow)]"
        >
          <Clock size={18} />
          Start Processing
          <ArrowRight size={18} />
        </button>
      </div>

      {/* ── API Keys Configuration Modal ── */}
      {showKeysModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-[var(--bg-2)] border border-[var(--border)] rounded-3xl max-w-md w-full p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0">
                <KeyRound size={20} />
              </div>
              <div>
                <h3 className="text-base font-bold text-[var(--fg)]">AI Processing API Keys</h3>
                <p className="text-xs text-[var(--fg-muted)]">Configuration for Gemini and Pexels APIs</p>
              </div>
            </div>

            <p className="text-xs text-[var(--fg-2)] leading-relaxed">
              To detect viral clips based on transcript content (Gemini) or automatically fetch stock overlays (Pexels), please provide your API Keys. If you don't have keys, you can skip and use our fast fallback segmentation.
            </p>

            <div className="space-y-3 pt-1">
              {config.enableAIClipSuggestions && (
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider font-semibold block">
                    Gemini API Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter Gemini API Key..."
                    value={tempGeminiKey}
                    onChange={(e) => setTempGeminiKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}
              {config.enableBRoll && (
                <div className="space-y-1">
                  <label className="text-[10px] text-[var(--fg-muted)] uppercase tracking-wider font-semibold block">
                    Pexels API Key
                  </label>
                  <input
                    type="password"
                    placeholder="Enter Pexels API Key..."
                    value={tempPexelsKey}
                    onChange={(e) => setTempPexelsKey(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[var(--bg-3)] border border-[var(--border)] text-xs text-[var(--fg)] placeholder:text-[var(--fg-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2 pt-2">
              <button
                onClick={handleSaveKeys}
                className="w-full py-2.5 rounded-xl bg-[var(--accent)] text-[var(--accent-fg)] text-xs font-bold hover:opacity-90 transition-all flex items-center justify-center gap-2"
              >
                <Sparkles size={14} />
                Save & Start Processing
              </button>
              <div className="flex gap-2">
                <button
                  onClick={handleSkipKeys}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-3)] text-xs font-semibold text-[var(--fg-2)] transition-all"
                >
                  Proceed with Fallback
                </button>
                <button
                  onClick={() => setShowKeysModal(false)}
                  className="flex-1 py-2.5 rounded-xl border border-[var(--border)] hover:bg-[var(--bg-3)] text-xs font-semibold text-[var(--fg-muted)] transition-all"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AutoClipLayout>
  );
};
