import type { Subtitle, CaptionAnimationStyle } from "../types/timeline";

export type WordSegmentStyle = "normal" | "highlighted" | "hidden" | "active";

export interface WordSegment {
  readonly text: string;
  readonly style: WordSegmentStyle;
  readonly opacity: number;
  readonly scale: number;
  readonly offsetY: number;
  readonly color?: string;
  readonly rotation?: number;
  readonly offsetX?: number;
  readonly scaleX?: number;
  readonly scaleY?: number;
}

export interface AnimatedCaptionFrame {
  readonly segments: WordSegment[];
  readonly visible: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}


function renderNone(subtitle: Subtitle): AnimatedCaptionFrame {
  return {
    segments: [
      {
        text: subtitle.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      },
    ],
    visible: true,
  };
}

function renderWordHighlight(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const highlightColor = subtitle.style?.highlightColor || "#ffff00";
  const upcomingColor = subtitle.style?.upcomingColor;

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const isActive =
      currentTime >= word.startTime && currentTime < word.endTime;
    const isPast = currentTime >= word.endTime;
    const isUpcoming = currentTime < word.startTime;

    let color: string | undefined;
    if (isActive) {
      color = highlightColor;
    } else if (isUpcoming && upcomingColor) {
      color = upcomingColor;
    }

    return {
      text: word.text,
      style: isActive ? "highlighted" : isPast ? "normal" : "normal",
      opacity: 1,
      scale: isActive ? 1.15 : 1,
      offsetY: isActive ? -2 : 0,
      color,
    };
  });

  return { segments, visible: true };
}

function renderWordByWord(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const activeWord = subtitle.words.find(
    (word) => currentTime >= word.startTime && currentTime < word.endTime,
  );

  if (!activeWord) {
    const lastWord = subtitle.words[subtitle.words.length - 1];
    if (currentTime >= lastWord.endTime) {
      return {
        segments: [
          {
            text: lastWord.text,
            style: "normal",
            opacity: 1,
            scale: 1,
            offsetY: 0,
          },
        ],
        visible: true,
      };
    }
    return { segments: [], visible: false };
  }

  return {
    segments: [
      {
        text: activeWord.text,
        style: "active",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      },
    ],
    visible: true,
  };
}

function renderKaraoke(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const highlightColor = subtitle.style?.highlightColor || "#ffff00";
  const upcomingColor =
    subtitle.style?.upcomingColor || "rgba(255, 255, 255, 0.5)";

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const wordDuration = word.endTime - word.startTime;
    const elapsed = currentTime - word.startTime;
    const progress = clamp(elapsed / wordDuration, 0, 1);

    const isUpcoming = currentTime < word.startTime;
    const isActive =
      currentTime >= word.startTime && currentTime < word.endTime;
    const isComplete = currentTime >= word.endTime;

    let style: WordSegmentStyle = "normal";
    let color: string | undefined;

    if (isUpcoming) {
      style = "normal";
      color = upcomingColor;
    } else if (isComplete) {
      style = "highlighted";
      color = highlightColor;
    } else if (isActive) {
      style = "active";
      color = `linear-gradient(90deg, ${highlightColor} ${progress * 100}%, ${upcomingColor} ${progress * 100}%)`;
    }

    return {
      text: word.text,
      style,
      opacity: 1,
      scale: isActive ? 1.05 : 1,
      offsetY: 0,
      color,
    };
  });

  return { segments, visible: true };
}

function renderBounce(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const animProgress = clamp(timeSinceStart / wordDuration, 0, 1);
    // Smooth ease-out enlargement (no bounce, no vertical shift)
    const easeProgress = 1 - Math.pow(1 - animProgress, 3);
    const scale = 1.0 + easeProgress * 0.2;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: scale,
      offsetY: 0,
    };
  });

  return { segments, visible: true };
}

function renderTypewriter(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  // Find the index of the word currently being spoken
  let activeIndex = subtitle.words.findIndex(
    (w) => currentTime >= w.startTime && currentTime < w.endTime,
  );
  if (activeIndex === -1) {
    // Fallback: Find the last word that has started speaking
    activeIndex = subtitle.words.reduce(
      (maxIdx, w, idx) => (currentTime >= w.startTime ? idx : maxIdx),
      -1,
    );
  }

  if (activeIndex === -1) {
    return { segments: [], visible: false };
  }

  // Group words into pages of maximum 3 words
  const pageIndex = Math.floor(activeIndex / 3);
  const pageWords = subtitle.words.slice(pageIndex * 3, (pageIndex + 1) * 3);

  // Filter page words to only show those that have started speaking (typewriter reveal)
  const visibleWords = pageWords.filter(
    (word) => currentTime >= word.startTime,
  );

  if (visibleWords.length === 0) {
    return { segments: [], visible: false };
  }

  const segments: WordSegment[] = visibleWords.map((word, index) => {
    const isLast = index === visibleWords.length - 1;
    const timeSinceStart = currentTime - word.startTime;
    const fadeInDuration = 0.1;
    const opacity = isLast ? clamp(timeSinceStart / fadeInDuration, 0, 1) : 1;

    return {
      text: word.text,
      style: "normal",
      opacity,
      scale: 1,
      offsetY: 0,
    };
  });

  return { segments, visible: true };
}

function renderPopIn(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const animProgress = clamp(timeSinceStart / wordDuration, 0, 1);
    // Pop-in bounce: 1.0 -> 1.35 -> 1.15
    const scale = animProgress < 0.7
      ? 1.0 + (animProgress / 0.7) * 0.35
      : 1.35 - ((animProgress - 0.7) / 0.3) * 0.2;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: scale,
      offsetY: 0,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderSlideUp(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const animProgress = clamp(timeSinceStart / wordDuration, 0, 1);
    // Cubic ease out slide-up
    const easeProgress = 1 - Math.pow(1 - animProgress, 3);
    const offsetY = 15 * (1 - easeProgress);

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.15,
      offsetY: offsetY,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderGlowPulse(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const isActive = currentTime >= word.startTime && currentTime < word.endTime;
    let scale = 1;
    let offsetY = 0;

    if (isActive) {
      const wordDuration = word.endTime - word.startTime;
      const elapsed = currentTime - word.startTime;
      const pulse = Math.sin(clamp(elapsed / wordDuration, 0, 1) * Math.PI);
      scale = 1 + pulse * 0.15;
      offsetY = -pulse * 3;
    }

    return {
      text: word.text,
      style: isActive ? "active" : "normal",
      opacity: 1,
      scale: scale,
      offsetY: offsetY,
      color: isActive ? (subtitle.style?.highlightColor || "#ffff00") : undefined,
    };
  });

  return { segments, visible: true };
}

function renderActiveZoomSpring(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const progress = clamp(timeSinceStart / wordDuration, 0, 1);
    const scale = 1 + Math.sin(progress * Math.PI) * 0.45;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: scale,
      offsetY: 0,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderJiggleActive(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const jiggleFreq = 15;
    const jiggleAmp = 6;
    const rotation = Math.sin(timeSinceStart * jiggleFreq * Math.PI * 2) * jiggleAmp;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.25,
      offsetY: 0,
      rotation,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderBounceJump(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const progress = clamp(timeSinceStart / wordDuration, 0, 1);
    const jumpHeight = 16;
    const offsetY = -Math.sin(progress * Math.PI) * jumpHeight;
    const scaleY = 1.0 + Math.sin(progress * Math.PI * 2) * 0.15;
    const scaleX = 1.0 - Math.sin(progress * Math.PI * 2) * 0.08;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.15,
      scaleX,
      scaleY,
      offsetY,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderSlideInRight(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const progress = clamp(timeSinceStart / wordDuration, 0, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const offsetX = 35 * (1 - easeProgress);

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.2,
      offsetY: 0,
      offsetX,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderFadeSlideUp(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const progress = clamp(timeSinceStart / wordDuration, 0, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);
    const offsetY = 18 * (1 - easeProgress);

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.25,
      offsetY,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderRevealLeft(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  const segments: WordSegment[] = subtitle.words.map((word) => {
    const timeSinceStart = currentTime - word.startTime;
    const isUpcoming = currentTime < word.startTime;
    const isPast = currentTime >= word.endTime;

    if (isUpcoming || isPast) {
      return {
        text: word.text,
        style: "normal",
        opacity: 1,
        scale: 1,
        offsetY: 0,
      };
    }

    const wordDuration = word.endTime - word.startTime;
    const progress = clamp(timeSinceStart / wordDuration, 0, 1);
    const easeProgress = 1 - Math.pow(1 - progress, 3);

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.2,
      scaleX: easeProgress,
      scaleY: 1,
      offsetY: 0,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

export function renderAnimatedCaption(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (currentTime < subtitle.startTime || currentTime > subtitle.endTime) {
    return { segments: [], visible: false };
  }

  const normalizedSubtitle: Subtitle = {
    ...subtitle,
    words: subtitle.words && subtitle.words.length > 0
      ? subtitle.words
      : [{ text: subtitle.text, startTime: subtitle.startTime, endTime: subtitle.endTime }],
  };

  const animationStyle = normalizedSubtitle.animationStyle || "none";

  switch (animationStyle) {
    case "word-highlight":
      return renderWordHighlight(normalizedSubtitle, currentTime);
    case "word-by-word":
      return renderWordByWord(normalizedSubtitle, currentTime);
    case "karaoke":
      return renderKaraoke(normalizedSubtitle, currentTime);
    case "bounce":
      return renderBounce(normalizedSubtitle, currentTime);
    case "typewriter":
      return renderTypewriter(normalizedSubtitle, currentTime);
    case "pop-in":
      return renderPopIn(normalizedSubtitle, currentTime);
    case "slide-up":
      return renderSlideUp(normalizedSubtitle, currentTime);
    case "glow-pulse":
      return renderGlowPulse(normalizedSubtitle, currentTime);
    case "active-zoom-spring":
      return renderActiveZoomSpring(normalizedSubtitle, currentTime);
    case "jiggle-active":
      return renderJiggleActive(normalizedSubtitle, currentTime);
    case "bounce-jump":
      return renderBounceJump(normalizedSubtitle, currentTime);
    case "slide-in-right":
      return renderSlideInRight(normalizedSubtitle, currentTime);
    case "fade-slide-up":
      return renderFadeSlideUp(normalizedSubtitle, currentTime);
    case "reveal-left":
      return renderRevealLeft(normalizedSubtitle, currentTime);
    case "none":
    default:
      return renderNone(normalizedSubtitle);
  }
}

export function getAnimationStyleDisplayName(
  style: CaptionAnimationStyle,
): string {
  const names: Record<CaptionAnimationStyle, string> = {
    none: "Static",
    "word-highlight": "Word Highlight",
    "word-by-word": "Word by Word",
    karaoke: "Karaoke",
    bounce: "Bounce",
    typewriter: "Typewriter",
    "pop-in": "Pop In (Zoom)",
    "slide-up": "Slide Up",
    "glow-pulse": "Glow Pulse",
    "active-zoom-spring": "Bouncy Spring Zoom (CapCut)",
    "jiggle-active": "Jiggle Active (CapCut)",
    "bounce-jump": "Bounce Jump (CapCut)",
    "slide-in-right": "Slide In Right (CapCut)",
    "fade-slide-up": "Fade Slide Up (CapCut)",
    "reveal-left": "Reveal Left (CapCut)",
  };
  return names[style];
}

export const CAPTION_ANIMATION_STYLES: CaptionAnimationStyle[] = [
  "none",
  "word-highlight",
  "word-by-word",
  "karaoke",
  "bounce",
  "typewriter",
  "pop-in",
  "slide-up",
  "glow-pulse",
  "active-zoom-spring",
  "jiggle-active",
  "bounce-jump",
  "slide-in-right",
  "fade-slide-up",
  "reveal-left",
];
