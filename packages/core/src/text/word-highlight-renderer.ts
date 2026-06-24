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
    const fontSize = style?.fontSize || 24;
    const fontFamily = style?.fontFamily || "Inter";
    const baseColor = style?.color || "#ffffff";
    const backgroundColor = style?.backgroundColor || "rgba(0, 0, 0, 0.7)";
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
      width: ctx.measureText(seg.text).width * seg.scale,
    }));

    // Simple line breaking algorithm
    const lines: RenderSegment[][] = [];
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
      if (backgroundColor && backgroundColor !== "transparent") {
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

      // Draw words
      let currentX = canvasWidth / 2 - lineTotalWidth / 2;
      for (let i = 0; i < line.length; i++) {
        const seg = line[i];
        
        ctx.save();
        ctx.globalAlpha = seg.opacity;
        
        if (seg.color) {
          if (seg.color.startsWith("linear-gradient")) {
            const gradient = ctx.createLinearGradient(currentX, 0, currentX + seg.width, 0);
            
            // Extract colors and percentage stops
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

        const segmentFontSize = fontSize * seg.scale;
        ctx.font = `bold ${segmentFontSize}px "${fontFamily}"`;
        
        const drawX = currentX;
        const drawY = y + seg.offsetY;
        
        ctx.fillText(seg.text, drawX, drawY);
        ctx.restore();

        currentX += seg.width;
        if (i < line.length - 1) {
          currentX += spaceWidth;
        }
      }
    }

    ctx.restore();
  }
}
