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
  readonly shadowColor?: string;
  readonly shadowBlur?: number;
  readonly shadowOffsetX?: number;
  readonly shadowOffsetY?: number;
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

function renderElasticJello(
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
    const wobble = Math.sin(progress * 4 * Math.PI) * Math.exp(-progress * 3);
    const scaleX = 1 + wobble * 0.25;
    const scaleY = 1 - wobble * 0.25;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.15,
      scaleX,
      scaleY,
      offsetY: 0,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderSkewWave(
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
    const wave = Math.sin(progress * 2 * Math.PI);
    const rotation = wave * 8;
    const offsetY = -Math.abs(wave) * 5;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.15,
      offsetY,
      rotation,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderSmokeRise(
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
    const opacity = easeProgress;
    const offsetY = 12 * (1 - easeProgress);

    return {
      text: word.text,
      style: "active",
      opacity,
      scale: 0.9 + easeProgress * 0.25,
      offsetY,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderSpinPop(
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
    const spinProgress = clamp(progress / 0.4, 0, 1);
    const scaleX = -Math.cos(spinProgress * Math.PI);
    const zoomProgress = Math.sin(progress * Math.PI);
    const scaleY = 1.0 + zoomProgress * 0.25;

    return {
      text: word.text,
      style: "active",
      opacity: 1,
      scale: 1.1,
      scaleX,
      scaleY,
      offsetY: 0,
      color: subtitle.style?.highlightColor || "#ffff00",
    };
  });

  return { segments, visible: true };
}

function renderSqueeze(
  subtitle: Subtitle,
  currentTime: number,
): AnimatedCaptionFrame {
  if (!subtitle.words || subtitle.words.length === 0) {
    return renderNone(subtitle);
  }

  // Find active word index
  let activeIndex = subtitle.words.findIndex(
    (w) => currentTime >= w.startTime && currentTime < w.endTime,
  );
  if (activeIndex === -1) {
    activeIndex = subtitle.words.reduce(
      (maxIdx, w, idx) => (currentTime >= w.startTime ? idx : maxIdx),
      -1,
    );
  }
  if (activeIndex === -1) {
    return { segments: [], visible: false };
  }

  // Paginate into pages of max 3 words
  const pageIndex = Math.floor(activeIndex / 3);
  const pageWords = subtitle.words.slice(pageIndex * 3, (pageIndex + 1) * 3);

  const pageStartTime = pageWords[0].startTime;
  const pageEndTime = pageWords[pageWords.length - 1].endTime;
  const transitionDuration = 0.15; // 150ms transition

  const highlightColor = subtitle.style?.highlightColor || "#ffff00";

  // Check if we are in the page entry phase (all 3 words animate together at pageStartTime)
  const isPageEntering = (currentTime - pageStartTime) < transitionDuration;
  const entryProgress = isPageEntering
    ? clamp((currentTime - pageStartTime) / transitionDuration, 0, 1)
    : 1;

  // Check if we are in the page exit phase (all 3 words animate together at pageEndTime)
  const isPageExiting = (pageEndTime - currentTime) <= transitionDuration;
  const exitProgress = isPageExiting
    ? clamp((pageEndTime - currentTime) / transitionDuration, 0, 1)
    : 1;

  const segments: WordSegment[] = pageWords.map((word) => {
    const isActive = currentTime >= word.startTime && currentTime < word.endTime;

    // Default base properties for the middle phase
    let opacity = 1;
    let scaleX = 1;
    let scaleY = 1;
    let scale = 1.0;
    let shadowBlur = 0;
    let shadowColor: string | undefined;

    if (isPageEntering) {
      const easeIn = 1 - Math.pow(1 - entryProgress, 3); // cubic ease out
      opacity = easeIn;
      scaleX = 1.8 - 0.8 * easeIn; // squeezed outward (stretched width starts at 1.8 -> settles to 1.0)
      scaleY = 0.6 + 0.4 * easeIn; // squashed height starts at 0.6 -> settles to 1.0
      scale = 1.0 + 0.15 * (1 - easeIn); // enlarged slightly at start
      shadowBlur = 15 * (1 - easeIn);
      shadowColor = highlightColor;
    } else if (isPageExiting) {
      const easeOut = Math.pow(exitProgress, 3); // cubic ease in
      opacity = easeOut;
      scaleX = 1.8 - 0.8 * easeOut; // squeezed outward (stretched width starts at 1.0 -> exits at 1.8)
      scaleY = 0.6 + 0.4 * easeOut; // squashed height starts at 1.0 -> exits at 0.6
      scale = 1.0 + 0.15 * (1 - easeOut); // enlarged slightly at end
      shadowBlur = 15 * (1 - easeOut);
      shadowColor = highlightColor;
    }

    return {
      text: word.text,
      style: isActive ? "active" : "normal",
      opacity,
      scale,
      scaleX,
      scaleY,
      offsetY: 0,
      color: isActive ? highlightColor : undefined,
      shadowColor,
      shadowBlur,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
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
    case "elastic-jello":
      return renderElasticJello(normalizedSubtitle, currentTime);
    case "skew-wave":
      return renderSkewWave(normalizedSubtitle, currentTime);
    case "smoke-rise":
      return renderSmokeRise(normalizedSubtitle, currentTime);
    case "spin-pop":
      return renderSpinPop(normalizedSubtitle, currentTime);
    case "squeeze":
      return renderSqueeze(normalizedSubtitle, currentTime);
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
    "elastic-jello": "Jello Elastic",
    "skew-wave": "Rotational Wave",
    "smoke-rise": "Smoke Rise",
    "spin-pop": "3D Spin Pop",
    squeeze: "Squeeze (3 Words)",
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
  "elastic-jello",
  "skew-wave",
  "smoke-rise",
  "spin-pop",
  "squeeze",
];
