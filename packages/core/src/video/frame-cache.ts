import type { FrameCacheConfig, FrameCacheStats, CachedFrame } from "./types";

const DEFAULT_CONFIG: FrameCacheConfig = {
  maxFrames: 100,
  maxSizeBytes: 500 * 1024 * 1024, // 500MB
  preloadAhead: 30, // ~1 second at 30fps
  preloadBehind: 10,
};

// ─── O(1) LRU doubly-linked list node ────────────────────────────────────────
interface LRUNode {
  key: string;
  prev: LRUNode | null;
  next: LRUNode | null;
}

export class FrameCache {
  private cache: Map<string, CachedFrame> = new Map();
  private config: FrameCacheConfig;
  private stats = { hits: 0, misses: 0 };
  private totalSizeBytes = 0;

  // O(1) LRU tracking — head = most recently used, tail = least recently used
  private lruHead: LRUNode | null = null; // MRU sentinel
  private lruTail: LRUNode | null = null; // LRU sentinel
  private lruMap: Map<string, LRUNode> = new Map();

  constructor(config: Partial<FrameCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getCacheKey(
    mediaId: string,
    time: number,
    frameRate: number = 30,
  ): string {
    // Round time to nearest frame
    const frameTime = Math.round(time * frameRate) / frameRate;
    return `${mediaId}:${frameTime.toFixed(4)}`;
  }

  get(key: string): ImageBitmap | null {
    const entry = this.cache.get(key);
    if (entry) {
      entry.lastAccessed = Date.now();
      // Move to front of LRU list (most recently used)
      this.lruMoveToFront(key);
      this.stats.hits++;
      return entry.image;
    }
    this.stats.misses++;
    return null;
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  set(key: string, image: ImageBitmap, mediaId: string): void {
    // Estimate frame size (4 bytes per pixel for RGBA)
    const sizeBytes = image.width * image.height * 4;

    // Evict frames if needed
    this.evictIfNeeded(sizeBytes);

    // Don't cache if single frame exceeds max size
    if (sizeBytes > this.config.maxSizeBytes) {
      console.warn("Frame too large to cache:", sizeBytes, "bytes");
      return;
    }

    const timestamp = parseFloat(key.split(":")[1]) || 0;

    this.cache.set(key, {
      image,
      timestamp,
      mediaId,
      width: image.width,
      height: image.height,
      sizeBytes,
      lastAccessed: Date.now(),
    });

    this.totalSizeBytes += sizeBytes;
    // Add to front of LRU list
    this.lruAddToFront(key);
  }

  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (entry) {
      entry.image.close();
      this.totalSizeBytes -= entry.sizeBytes;
      this.lruRemove(key);
      return this.cache.delete(key);
    }
    return false;
  }

  clearMedia(mediaId: string): void {
    const keysToDelete: string[] = [];
    for (const [key, entry] of this.cache.entries()) {
      if (entry.mediaId === mediaId) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.delete(key);
    }
  }

  clear(): void {
    for (const entry of this.cache.values()) {
      entry.image.close();
    }
    this.cache.clear();
    this.lruMap.clear();
    this.lruHead = null;
    this.lruTail = null;
    this.totalSizeBytes = 0;
    this.stats = { hits: 0, misses: 0 };
  }

  getStats(): FrameCacheStats {
    const totalRequests = this.stats.hits + this.stats.misses;
    return {
      entries: this.cache.size,
      sizeBytes: this.totalSizeBytes,
      hitRate: totalRequests > 0 ? this.stats.hits / totalRequests : 0,
      maxSizeBytes: this.config.maxSizeBytes,
      hits: this.stats.hits,
      misses: this.stats.misses,
    };
  }

  getConfig(): FrameCacheConfig {
    return { ...this.config };
  }

  updateConfig(config: Partial<FrameCacheConfig>): void {
    this.config = { ...this.config, ...config };
    // Evict if new limits are exceeded
    this.evictIfNeeded(0);
  }

  getPreloadRange(
    mediaId: string,
    currentTime: number,
    duration: number,
    frameRate: number,
  ): { startTime: number; endTime: number; missingFrames: number[] } {
    const frameDuration = 1 / frameRate;
    const startTime = Math.max(
      0,
      currentTime - this.config.preloadBehind * frameDuration,
    );
    const endTime = Math.min(
      duration,
      currentTime + this.config.preloadAhead * frameDuration,
    );

    const missingFrames: number[] = [];
    for (let t = startTime; t <= endTime; t += frameDuration) {
      const key = FrameCache.getCacheKey(mediaId, t, frameRate);
      if (!this.cache.has(key)) {
        missingFrames.push(t);
      }
    }

    return { startTime, endTime, missingFrames };
  }

  prioritizeAroundTime(mediaId: string, time: number, frameRate: number): void {
    const frameDuration = 1 / frameRate;
    const now = Date.now();

    // Prioritize frames within preload range
    for (let offset = 0; offset <= this.config.preloadAhead; offset++) {
      const forwardKey = FrameCache.getCacheKey(
        mediaId,
        time + offset * frameDuration,
        frameRate,
      );
      const backwardKey = FrameCache.getCacheKey(
        mediaId,
        time - offset * frameDuration,
        frameRate,
      );

      const forwardEntry = this.cache.get(forwardKey);
      if (forwardEntry) {
        // Higher priority for frames closer to current time
        forwardEntry.lastAccessed = now + (this.config.preloadAhead - offset);
      }

      if (offset > 0) {
        const backwardEntry = this.cache.get(backwardKey);
        if (backwardEntry) {
          backwardEntry.lastAccessed =
            now + (this.config.preloadBehind - offset);
        }
      }
    }
  }

  private evictIfNeeded(newFrameSize: number): void {
    while (this.cache.size >= this.config.maxFrames) {
      this.evictLRU();
    }
    while (
      this.totalSizeBytes + newFrameSize > this.config.maxSizeBytes &&
      this.cache.size > 0
    ) {
      this.evictLRU();
    }
  }

  /**
   * Evict the least recently used frame in O(1) using the LRU doubly-linked list.
   */
  private evictLRU(): void {
    if (!this.lruTail) return;
    this.delete(this.lruTail.key);
  }

  // ─── LRU doubly-linked list helpers ──────────────────────────────────────

  private lruAddToFront(key: string): void {
    const node: LRUNode = { key, prev: null, next: null };
    this.lruMap.set(key, node);
    if (!this.lruHead) {
      this.lruHead = node;
      this.lruTail = node;
    } else {
      node.next = this.lruHead;
      this.lruHead.prev = node;
      this.lruHead = node;
    }
  }

  private lruMoveToFront(key: string): void {
    const node = this.lruMap.get(key);
    if (!node || node === this.lruHead) return;
    // Unlink from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.lruTail) this.lruTail = node.prev;
    // Re-insert at front
    node.prev = null;
    node.next = this.lruHead;
    if (this.lruHead) this.lruHead.prev = node;
    this.lruHead = node;
  }

  private lruRemove(key: string): void {
    const node = this.lruMap.get(key);
    if (!node) return;
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.lruHead) this.lruHead = node.next;
    if (node === this.lruTail) this.lruTail = node.prev;
    this.lruMap.delete(key);
  }

  getCachedTimestamps(mediaId: string): number[] {
    const timestamps: number[] = [];
    for (const entry of this.cache.values()) {
      if (entry.mediaId === mediaId) {
        timestamps.push(entry.timestamp);
      }
    }
    return timestamps.sort((a, b) => a - b);
  }

  getMemoryByMedia(): Map<string, number> {
    const memoryByMedia = new Map<string, number>();
    for (const entry of this.cache.values()) {
      const current = memoryByMedia.get(entry.mediaId) || 0;
      memoryByMedia.set(entry.mediaId, current + entry.sizeBytes);
    }
    return memoryByMedia;
  }
}

export interface PreloadTask {
  mediaId: string;
  media: Blob | File;
  timestamps: number[];
  priority: number;
  abortController: AbortController;
}

export class PreloadManager {
  private queue: PreloadTask[] = [];
  private currentTask: PreloadTask | null = null;

  enqueue(task: Omit<PreloadTask, "abortController">): AbortController {
    const abortController = new AbortController();
    const fullTask: PreloadTask = { ...task, abortController };
    this.cancelMedia(task.mediaId);
    this.queue.push(fullTask);
    this.queue.sort((a, b) => b.priority - a.priority);

    return abortController;
  }

  cancelMedia(mediaId: string): void {
    // Cancel current task if it matches
    if (this.currentTask?.mediaId === mediaId) {
      this.currentTask.abortController.abort();
      this.currentTask = null;
    }
    const index = this.queue.findIndex((t) => t.mediaId === mediaId);
    if (index !== -1) {
      this.queue[index].abortController.abort();
      this.queue.splice(index, 1);
    }
  }

  cancelAll(): void {
    if (this.currentTask) {
      this.currentTask.abortController.abort();
      this.currentTask = null;
    }

    for (const task of this.queue) {
      task.abortController.abort();
    }
    this.queue = [];
  }

  dequeue(): PreloadTask | null {
    return this.queue.shift() || null;
  }

  hasPendingTasks(): boolean {
    return this.queue.length > 0 || this.currentTask !== null;
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  setCurrentTask(task: PreloadTask | null): void {
    this.currentTask = task;
  }

  getCurrentTask(): PreloadTask | null {
    return this.currentTask;
  }

  updatePriority(mediaId: string, priority: number): void {
    const task = this.queue.find((t) => t.mediaId === mediaId);
    if (task) {
      task.priority = priority;
      this.queue.sort((a, b) => b.priority - a.priority);
    }
  }
}
