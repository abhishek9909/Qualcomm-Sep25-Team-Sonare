export interface PerformanceMetrics {
  fps: number;
  latency: number;
  detectionTime: number;
  isOffline: boolean;
  memoryUsage?: number;
  gpuUsage?: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    fps: 0,
    latency: 0,
    detectionTime: 0,
    isOffline: true,
  };

  private frameTimes: number[] = [];
  private lastFrameTime = 0;
  private frameCount = 0;
  private readonly maxFrameSamples = 30;

  updateMetrics(detectionTime: number, latency: number): void {
    const now = performance.now();

    // Update FPS
    if (this.lastFrameTime > 0) {
      const frameTime = now - this.lastFrameTime;
      this.frameTimes.push(frameTime);

      if (this.frameTimes.length > this.maxFrameSamples) {
        this.frameTimes = this.frameTimes.slice(-this.maxFrameSamples);
      }

      this.metrics.fps =
        this.frameTimes.length > 0
          ? Math.round(
              1000 /
                (this.frameTimes.reduce((a, b) => a + b, 0) /
                  this.frameTimes.length),
            )
          : 0;
    }

    this.lastFrameTime = now;
    this.frameCount++;

    // Update other metrics
    this.metrics.detectionTime = detectionTime;
    this.metrics.latency = latency;
    this.metrics.isOffline = !navigator.onLine;

    // Update memory usage if available
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = Math.round(
        memory.usedJSHeapSize / 1024 / 1024,
      ); // MB
    }
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  reset(): void {
    this.frameTimes = [];
    this.lastFrameTime = 0;
    this.frameCount = 0;
    this.metrics = {
      fps: 0,
      latency: 0,
      detectionTime: 0,
      isOffline: !navigator.onLine,
    };
  }

  isPerformanceGood(): boolean {
    return (
      this.metrics.fps >= 15 &&
      this.metrics.latency < 100 &&
      this.metrics.detectionTime < 50
    );
  }

  getPerformanceStatus(): 'excellent' | 'good' | 'fair' | 'poor' {
    const { fps, latency, detectionTime } = this.metrics;

    if (fps >= 20 && latency < 50 && detectionTime < 30) return 'excellent';
    if (fps >= 15 && latency < 100 && detectionTime < 50) return 'good';
    if (fps >= 10 && latency < 200 && detectionTime < 100) return 'fair';
    return 'poor';
  }
}
