// Dynamic import for MediaPipe to handle ESM compatibility
let HandLandmarker: any;
let FilesetResolver: any;

const initializeMediaPipe = async () => {
  if (!HandLandmarker || !FilesetResolver) {
    const mediapipe = await import('@mediapipe/tasks-vision');
    HandLandmarker = mediapipe.HandLandmarker;
    FilesetResolver = mediapipe.FilesetResolver;
  }
};

export interface HandLandmark {
  x: number;
  y: number;
  z: number;
}

export interface HandDetection {
  landmarks: HandLandmark[];
  handedness: 'Left' | 'Right';
  confidence: number;
}

export interface DetectionResult {
  hands: HandDetection[];
  timestamp: number;
  fps: number;
  latency: number;
}

export class HandLandmarkerService {
  private handLandmarker: any = null;
  private isInitialized = false;
  private lastFrameTime = 0;
  private frameCount = 0;
  private fps = 0;
  private startTime = 0;

  async initialize(): Promise<void> {
    try {
      console.log('Initializing MediaPipe HandLandmarker...');

      await initializeMediaPipe();

      // Try different WASM paths
      let vision;
      const wasmPaths = [
        '/assets/mediapipe/wasm',
        './assets/mediapipe/wasm',
        '/public/assets/mediapipe/wasm',
      ];

      for (const wasmPath of wasmPaths) {
        try {
          console.log(`Trying WASM path: ${wasmPath}`);
          vision = await FilesetResolver.forVisionTasks(wasmPath);
          console.log(`Successfully loaded WASM from: ${wasmPath}`);
          break;
        } catch (pathError) {
          console.warn(`Failed to load WASM from ${wasmPath}:`, pathError);
          if (wasmPath === wasmPaths[wasmPaths.length - 1]) {
            throw pathError;
          }
        }
      }

      this.handLandmarker = await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: '/assets/mediapipe/hand_landmarker.task',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minHandPresenceConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.isInitialized = true;
      this.startTime = performance.now();
      console.log('MediaPipe HandLandmarker initialized successfully');
    } catch (error) {
      console.error('Failed to initialize MediaPipe:', error);
      throw error;
    }
  }

  async detectHands(video: HTMLVideoElement): Promise<DetectionResult | null> {
    if (!this.handLandmarker || !this.isInitialized) {
      return null;
    }

    const currentTime = performance.now();
    const timestamp = currentTime - this.startTime;

    // Throttle to ~15-20 FPS
    if (currentTime - this.lastFrameTime < 50) {
      return null;
    }

    this.lastFrameTime = currentTime;
    this.frameCount++;

    // Calculate FPS
    if (this.frameCount % 30 === 0) {
      this.fps = Math.round(1000 / (currentTime - this.lastFrameTime));
    }

    try {
      const startDetection = performance.now();

      const results = this.handLandmarker.detectForVideo(video, timestamp);

      const detectionTime = performance.now() - startDetection;

      const hands: HandDetection[] = results.landmarks.map(
        (landmarks: any, index: number) => ({
          landmarks: landmarks.map((landmark: any) => ({
            x: landmark.x,
            y: landmark.y,
            z: landmark.z,
          })),
          handedness:
            (results.handednesses[index]?.[0]?.categoryName as
              | 'Left'
              | 'Right') || 'Right',
          confidence: results.handednesses[index]?.[0]?.score || 0,
        }),
      );

      return {
        hands,
        timestamp,
        fps: this.fps,
        latency: detectionTime,
      };
    } catch (error) {
      console.error('Hand detection error:', error);
      return null;
    }
  }

  isReady(): boolean {
    return this.isInitialized && this.handLandmarker !== null;
  }

  dispose(): void {
    if (this.handLandmarker) {
      this.handLandmarker.close();
      this.handLandmarker = null;
    }
    this.isInitialized = false;
  }
}
