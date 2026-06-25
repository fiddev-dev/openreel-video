import * as React from "react";
import { cn } from "@openreel/ui/lib/utils";
import type { InspectorTabDef, InspectorTabId } from "../clip-tabs.config";

export interface InspectorTabsProps {
  tabs: InspectorTabDef[];
  activeId: InspectorTabId;
  onSelect: (id: InspectorTabId) => void;
}

export const InspectorTabs: React.FC<InspectorTabsProps> = ({ tabs, activeId, onSelect }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [isDown, setIsDown] = React.useState(false);
  const [startX, setStartX] = React.useState(0);
  const [scrollLeft, setScrollLeft] = React.useState(0);
  const [hasDragged, setHasDragged] = React.useState(false);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const direction = event.key === "ArrowRight" ? 1 : -1;
    const next = tabs[(index + direction + tabs.length) % tabs.length];
    if (next) onSelect(next.id);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    setIsDown(true);
    setHasDragged(false);
    setStartX(e.pageX - container.offsetLeft);
    setScrollLeft(container.scrollLeft);
  };

  const handleMouseLeave = () => {
    setIsDown(false);
  };

  const handleMouseUp = () => {
    setIsDown(false);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDown) return;
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const x = e.pageX - container.offsetLeft;
    const walk = (x - startX) * 1.5;
    if (Math.abs(walk) > 3) {
      setHasDragged(true);
    }
    container.scrollLeft = scrollLeft - walk;
  };

  return (
    <div
      ref={containerRef}
      role="tablist"
      aria-label="Inspector tabs"
      className={cn(
        "flex items-center gap-0.5 px-2 border-b border-border overflow-x-auto scrollbar-none shrink-0 cursor-grab active:cursor-grabbing select-none"
      )}
      onMouseDown={handleMouseDown}
      onMouseLeave={handleMouseLeave}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      {tabs.map((tab, index) => {
        const Icon = tab.icon;
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => {
              if (!hasDragged) {
                onSelect(tab.id);
              }
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-medium whitespace-nowrap transition-colors border-b-2 -mb-px pointer-events-auto",
              active
                ? "text-accent border-accent"
                : "text-fg-3 border-transparent hover:text-fg",
            )}
          >
            <Icon size={13} className="pointer-events-none" />
            <span className="pointer-events-none">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
};
