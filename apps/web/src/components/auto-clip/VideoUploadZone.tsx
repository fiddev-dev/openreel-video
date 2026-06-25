/**
 * VideoUploadZone — drag-and-drop or click-to-upload video file.
 */
import { useRef, useState, useCallback } from "react";
import { Upload, Film, X } from "lucide-react";

interface VideoUploadZoneProps {
  onFileSelected: (file: File, url: string, duration: number) => void;
  currentFile?: { name: string; url: string } | null;
  onClear?: () => void;
}

export const VideoUploadZone: React.FC<VideoUploadZoneProps> = ({
  onFileSelected,
  currentFile,
  onClear,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const processFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith("video/")) return;
      setIsLoading(true);
      const url = URL.createObjectURL(file);
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        setIsLoading(false);
        onFileSelected(file, url, Math.round(video.duration));
        URL.revokeObjectURL(url); // revoke after metadata read
      };
      video.onerror = () => {
        setIsLoading(false);
      };
      video.src = url;
    },
    [onFileSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  if (currentFile) {
    return (
      <div className="relative flex flex-col items-center gap-4 p-8 rounded-2xl border-2 border-[var(--accent)] bg-[var(--accent-soft)]">
        <div className="w-16 h-16 rounded-2xl bg-[var(--accent-soft)] flex items-center justify-center">
          <Film size={32} className="text-[var(--accent)]" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-[var(--fg)] truncate max-w-[280px]">
            {currentFile.name}
          </p>
          <p className="text-xs text-[var(--fg-3)] mt-1">Video ready to process</p>
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
    <div
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`
        relative flex flex-col items-center gap-4 p-12 rounded-2xl border-2 border-dashed cursor-pointer
        transition-all duration-200 select-none
        ${isDragging
          ? "border-[var(--accent)] bg-[var(--accent-soft)] scale-[1.01]"
          : "border-[var(--border-strong)] bg-[var(--bg-2)] hover:border-[var(--accent)]/60 hover:bg-[var(--bg-3)]"}
      `}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={handleChange}
      />

      <div className={`
        w-20 h-20 rounded-2xl flex items-center justify-center transition-all duration-200
        ${isDragging ? "bg-[var(--accent)]/20" : "bg-[var(--bg-3)]"}
      `}>
        {isLoading ? (
          <div className="w-8 h-8 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
        ) : (
          <Upload size={36} className={isDragging ? "text-[var(--accent)]" : "text-[var(--fg-3)]"} />
        )}
      </div>

      <div className="text-center">
        <p className="text-base font-semibold text-[var(--fg)] mb-1">
          {isDragging ? "Drop your video here" : "Drag & drop your video"}
        </p>
        <p className="text-sm text-[var(--fg-3)]">
          or <span className="text-[var(--accent)] font-medium">click to browse</span>
        </p>
        <p className="text-xs text-[var(--fg-muted)] mt-3">
          Supports MP4, MOV, AVI, WebM — up to 4GB
        </p>
      </div>
    </div>
  );
};
