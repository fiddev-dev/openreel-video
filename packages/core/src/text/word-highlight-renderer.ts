import type { Subtitle } from "../types/timeline";
import { renderAnimatedCaption, type WordSegment } from "./caption-animation-renderer";

/**
 * WordHighlightRenderer is responsible for drawing animated/word-highlighted
 * captions onto an OffscreenCanvas or HTML5 Canvas context.
 */
export class WordHighlightRenderer {
  static render(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    subtitle: Subtitle,
    currentTime: number,
    canvasWidth: number,
    canvasHeight: number
  ): void {
    const animationFrame = renderAnimatedCaption(subtitle, currentTime);
    if (!animationFrame.visible || animationFrame.segments.length === 0) {
      return;
    }

    const { segments } = animationFrame;
    const style = subtitle.style;
    const fontSize = style?.fontSize || 38;
    const fontFamily = style?.fontFamily || "Inter";
    const baseColor = style?.color || "#ffffff";
    const backgroundColor = style?.backgroundColor;
    const position = style?.position || "bottom";

    ctx.save();
    
    ctx.font = `bold ${fontSize}px "${fontFamily}"`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    // Measure space width
    const spaceWidth = ctx.measureText(" ").width;

    // Group segments into lines. Word wrap based on canvasWidth * 0.8
    const maxLineWidth = canvasWidth * 0.8;
    interface RenderSegment extends WordSegment {
      width: number;
    }
    
    const measuredSegments: RenderSegment[] = segments.map((seg) => ({
      ...seg,
      width: ctx.measureText(seg.text).width,
    }));

    // Enforce 3 words on line 1, 2 words on line 2 for animated word segments
    const lines: RenderSegment[][] = [];
    const hasNewlines = measuredSegments.some((seg) => seg.text.includes("\n"));

    if (hasNewlines) {
      let currentLine: RenderSegment[] = [];
      let currentLineWidth = 0;
      for (const seg of measuredSegments) {
        if (seg.text.includes("\n")) {
          const parts = seg.text.split("\n");
          for (let i = 0; i < parts.length; i++) {
            const partText = parts[i];
            const partSeg = {
              ...seg,
              text: partText,
              width: ctx.measureText(partText).width * seg.scale,
            };
            if (i > 0 && currentLine.length > 0) {
              lines.push(currentLine);
              currentLine = [];
              currentLineWidth = 0;
            }
            currentLine.push(partSeg);
            currentLineWidth += partSeg.width;
          }
        } else {
          const wordWidth = seg.width;
          const spacing = currentLine.length > 0 ? spaceWidth : 0;
          
          if (currentLineWidth + spacing + wordWidth > maxLineWidth && currentLine.length > 0) {
            lines.push(currentLine);
            currentLine = [seg];
            currentLineWidth = wordWidth;
          } else {
            currentLine.push(seg);
            currentLineWidth += spacing + wordWidth;
          }
        }
      }
      if (currentLine.length > 0) {
        lines.push(currentLine);
      }
    } else {
      // Group words into lines: line 1 has max 3 words, line 2 has max 2 words (repeating pattern for longer)
      let wordIndex = 0;
      while (wordIndex < measuredSegments.length) {
        const line: RenderSegment[] = [];
        const lineIdx = lines.length;
        const targetWordCount = (lineIdx % 2 === 0) ? 3 : 2;
        
        for (let i = 0; i < targetWordCount && wordIndex < measuredSegments.length; i++) {
          line.push(measuredSegments[wordIndex]);
          wordIndex++;
        }
        lines.push(line);
      }
    }

    const lineHeight = fontSize * 1.4;
    const totalHeight = lines.length * lineHeight;

    let baseY: number;
    if (position === "top") {
      baseY = fontSize * 2;
    } else if (position === "center") {
      baseY = canvasHeight / 2 - totalHeight / 2;
    } else {
      baseY = canvasHeight - fontSize * 2 - totalHeight;
    }

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const y = baseY + lineIdx * lineHeight + lineHeight / 2;

      // Calculate total width of this line (including spaces)
      let lineTotalWidth = 0;
      for (let i = 0; i < line.length; i++) {
        lineTotalWidth += line[i].width;
        if (i < line.length - 1) {
          lineTotalWidth += spaceWidth;
        }
      }

      // Draw line background if background color is set and not transparent
      if (backgroundColor && backgroundColor !== "transparent" && backgroundColor !== "rgba(0,0,0,0)" && backgroundColor !== "rgba(0, 0, 0, 0)") {
        ctx.fillStyle = backgroundColor;
        const bgPaddingX = 15;
        const bgPaddingY = fontSize * 0.2;
        ctx.fillRect(
          canvasWidth / 2 - lineTotalWidth / 2 - bgPaddingX,
          y - lineHeight / 2 - bgPaddingY,
          lineTotalWidth + bgPaddingX * 2,
          lineHeight + bgPaddingY * 2
        );
      }

      // Calculate and store static horizontal positions for each word on the line
      let currentX = canvasWidth / 2 - lineTotalWidth / 2;
      const wordPositions: number[] = [];
      for (let i = 0; i < line.length; i++) {
        wordPositions.push(currentX);
        currentX += line[i].width;
        if (i < line.length - 1) {
          currentX += spaceWidth;
        }
      }

      // Helper function to render a single word segment
      const renderWord = (i: number) => {
        const seg = line[i];
        const startX = wordPositions[i];
        
        if (seg.scale <= 0) {
          return;
        }

        ctx.save();
        ctx.globalAlpha = seg.opacity;
        
        ctx.font = `bold ${fontSize}px "${fontFamily}"`;
        ctx.textBaseline = "middle";

        const wordWidth = ctx.measureText(seg.text).width;
        const centerX = startX + wordWidth / 2;
        const centerY = y;

        ctx.translate(centerX, centerY);
        ctx.translate(seg.offsetX ?? 0, seg.offsetY ?? 0);
        if (seg.rotation) {
          ctx.rotate((seg.rotation * Math.PI) / 180);
        }
        const scaleX = seg.scale * (seg.scaleX ?? 1);
        const scaleY = seg.scale * (seg.scaleY ?? 1);
        ctx.scale(scaleX, scaleY);
        
        const shadowColor = seg.shadowColor !== undefined ? seg.shadowColor : style?.shadowColor;
        const shadowBlur = seg.shadowBlur !== undefined ? seg.shadowBlur : style?.shadowBlur;
        const shadowOffsetX = seg.shadowOffsetX !== undefined ? seg.shadowOffsetX : (style?.shadowOffsetX ?? 0);
        const shadowOffsetY = seg.shadowOffsetY !== undefined ? seg.shadowOffsetY : (style?.shadowOffsetY ?? 0);

        if (shadowColor && shadowBlur !== undefined && shadowBlur > 0) {
          ctx.shadowColor = shadowColor;
          ctx.shadowBlur = shadowBlur;
          ctx.shadowOffsetX = shadowOffsetX;
          ctx.shadowOffsetY = shadowOffsetY;
        }

        if (seg.style === "active" && style?.showWordBackground) {
          ctx.save();
          ctx.shadowColor = "transparent";
          ctx.shadowBlur = 0;
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
          
          ctx.fillStyle = style.wordBackgroundColor || "rgba(0, 120, 255, 0.9)";
          const padX = fontSize * 0.4;
          const padY = fontSize * 0.15;
          const pillWidth = wordWidth + padX * 2;
          const pillHeight = fontSize + padY * 2;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(-pillWidth / 2, -pillHeight / 2, pillWidth, pillHeight, fontSize * 0.3);
          } else {
            ctx.rect(-pillWidth / 2, -pillHeight / 2, pillWidth, pillHeight);
          }
          ctx.fill();
          ctx.restore();
          
          ctx.fillStyle = "#ffffff";
        } else if (seg.color) {
          if (seg.color.startsWith("linear-gradient")) {
            const gradient = ctx.createLinearGradient(-wordWidth / 2, 0, wordWidth / 2, 0);
            const matches = seg.color.match(/#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)/g);
            const percentMatches = seg.color.match(/\d+%/g);
            if (matches && percentMatches && matches.length >= 2) {
              const stop1 = parseFloat(percentMatches[0]) / 100;
              const stop2 = parseFloat(percentMatches[1]) / 100;
              gradient.addColorStop(0, matches[0]);
              gradient.addColorStop(stop1, matches[0]);
              gradient.addColorStop(stop2, matches[1]);
              gradient.addColorStop(1, matches[1]);
              ctx.fillStyle = gradient;
            } else {
              ctx.fillStyle = seg.color;
            }
          } else {
            ctx.fillStyle = seg.color;
          }
        } else {
          ctx.fillStyle = baseColor;
        }

        ctx.textAlign = "center";

        if (style?.outlineColor && style?.outlineWidth !== undefined && style.outlineWidth > 0) {
          ctx.save();
          ctx.strokeStyle = style.outlineColor;
          ctx.lineWidth = style.outlineWidth;
          ctx.lineJoin = "round";
          ctx.miterLimit = 2;
          ctx.strokeText(seg.text, 0, 0);
          ctx.restore();
        }

        ctx.fillText(seg.text, 0, 0);
        ctx.restore();
      };

      // Pass 1: Draw inactive words first
      for (let i = 0; i < line.length; i++) {
        if (line[i].style !== "active") {
          renderWord(i);
        }
      }

      // Pass 2: Draw active words last (higher z-index)
      for (let i = 0; i < line.length; i++) {
        if (line[i].style === "active") {
          renderWord(i);
        }
      }
    }

    ctx.restore();
  }
}
