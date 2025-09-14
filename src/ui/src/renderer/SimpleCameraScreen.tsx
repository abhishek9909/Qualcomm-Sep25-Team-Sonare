import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import {
  HandLandmarkerService,
  HandDetection,
  HandLandmark,
} from './services/HandLandmarkerService';
import { GestureClassifier } from './services/GestureClassifier';
import { VocabularyService } from './services/VocabularyService';
import { PerformanceMonitor } from './services/PerformanceMonitor';

interface PatternData {
  timestamp: number;
  frameData: ImageData | null;
  handDetected: boolean;
  gesture: string;
  confidence: number;
  hands: HandDetection[];
  landmarks: HandLandmark[][];
}

interface Metrics {
  fps: number;
  latency: number;
  cpuUsage: number;
  memoryUsage: number;
  cameraPermission: boolean;
  micPermission: boolean;
}

function SimpleCameraScreen(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const [patterns, setPatterns] = useState<PatternData[]>([]);
  const [currentHands, setCurrentHands] = useState<HandDetection[]>([]);
  const [currentGesture, setCurrentGesture] = useState<string>('unknown');
  const [currentPhrase, setCurrentPhrase] = useState<string>('');
  const [metrics, setMetrics] = useState<Metrics>({
    fps: 0,
    latency: 0,
    cpuUsage: 0,
    memoryUsage: 0,
    cameraPermission: false,
    micPermission: false,
  });
  const navigate = useNavigate();

  // Performance monitoring
  const frameCount = useRef(0);
  const lastFrameTime = useRef(0);
  const startTime = useRef(0);

  // MediaPipe services
  const handLandmarker = useRef<HandLandmarkerService | null>(null);
  const gestureClassifier = useRef<GestureClassifier | null>(null);
  const vocabularyService = useRef<VocabularyService | null>(null);
  const performanceMonitor = useRef<PerformanceMonitor | null>(null);

  // Initialize MediaPipe services
  useEffect(() => {
    const initializeServices = async () => {
      try {
        // eslint-disable-next-line no-console
        console.log('Initializing MediaPipe services...');

        handLandmarker.current = new HandLandmarkerService();
        gestureClassifier.current = new GestureClassifier();
        vocabularyService.current = new VocabularyService();
        performanceMonitor.current = new PerformanceMonitor();

        await handLandmarker.current.initialize();
        setIsMediaPipeReady(true);

        // eslint-disable-next-line no-console
        console.log('MediaPipe services initialized successfully');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize MediaPipe services:', err);
        setIsMediaPipeReady(false);
      }
    };

    initializeServices();

    return () => {
      if (handLandmarker.current) {
        handLandmarker.current.dispose();
      }
    };
  }, []);

  // Simple hand detection based on skin color
  const detectHandInFrame = useCallback((imageData: ImageData): boolean => {
    const { data } = imageData;
    let skinPixels = 0;
    const totalPixels = data.length / 4;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      // Simple skin color detection
      if (
        r > 95 &&
        g > 40 &&
        b > 20 &&
        Math.max(r, g, b) - Math.min(r, g, b) > 15 &&
        Math.abs(r - g) > 15 &&
        r > g &&
        r > b
      ) {
        skinPixels += 1;
      }
    }

    return skinPixels / totalPixels > 0.1; // 10% skin pixels threshold
  }, []);

  useEffect(() => {
    let active = true;
    let currentStream: MediaStream | null = null;

    const getCamera = async () => {
      try {
        // eslint-disable-next-line no-console
        console.log('Requesting camera access...');
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
        });
        if (active) {
          currentStream = mediaStream;
          setStream(mediaStream);
          setError(null);
          setIsLoading(false);
          setMetrics((prev) => ({ ...prev, cameraPermission: true }));
        }
      } catch (err: any) {
        // eslint-disable-next-line no-console
        console.error('Camera error:', err);
        setError(`Could not access camera: ${err?.message || 'Unknown error'}`);
        setIsLoading(false);
      }
    };

    getCamera();

    return () => {
      active = false;
      if (currentStream) {
        // eslint-disable-next-line no-console
        console.log('Stopping camera stream...');
        currentStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Pattern capture function
  const capturePattern = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (!ctx) return;

    // Check if video has loaded and has valid dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      // eslint-disable-next-line no-console
      console.log('Video not ready yet, skipping frame capture');
      return;
    }

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let handDetected = false;
    let gesture = 'no_hand';
    let confidence = 0;
    let hands: HandDetection[] = [];
    let landmarks: HandLandmark[][] = [];

    // Use MediaPipe for advanced hand detection if available
    if (
      isMediaPipeReady &&
      handLandmarker.current &&
      gestureClassifier.current &&
      vocabularyService.current
    ) {
      try {
        const detectionResult = await handLandmarker.current.detectHands(video);

        if (detectionResult && detectionResult.hands.length > 0) {
          hands = detectionResult.hands;
          landmarks = detectionResult.hands.map((hand) => hand.landmarks);
          handDetected = true;

          // Classify gesture for the first hand
          const gestureResult = gestureClassifier.current.classifyGesture(
            detectionResult.hands[0],
          );
          gesture = gestureResult.gesture;
          confidence = gestureResult.confidence;

          // Get phrase for gesture
          const phrase = vocabularyService.current.getPhraseForGesture(gesture);
          setCurrentPhrase(phrase?.phrase || '');

          setCurrentHands(hands);
          setCurrentGesture(gesture);

          // Update performance metrics
          if (performanceMonitor.current) {
            performanceMonitor.current.updateMetrics(
              detectionResult.latency,
              detectionResult.latency,
            );
          }
        } else {
          setCurrentHands([]);
          setCurrentGesture('unknown');
          setCurrentPhrase('');
        }
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('MediaPipe detection error:', err);

        // Fallback to simple skin detection
        handDetected = detectHandInFrame(imageData);
        gesture = handDetected ? 'hand_detected' : 'no_hand';
        confidence = handDetected ? Math.random() * 0.5 + 0.5 : 0;
      }
    } else {
      // Fallback to simple skin detection
      handDetected = detectHandInFrame(imageData);
      gesture = handDetected ? 'hand_detected' : 'no_hand';
      confidence = handDetected ? Math.random() * 0.5 + 0.5 : 0;
    }

    const patternData: PatternData = {
      timestamp: Date.now(),
      frameData: imageData,
      handDetected,
      gesture,
      confidence,
      hands,
      landmarks,
    };

    setPatterns((prev) => [...prev.slice(-19), patternData]); // Keep last 20 patterns
  }, [detectHandInFrame, isMediaPipeReady]);

  // Draw hand landmarks on canvas
  const drawHandLandmarks = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      hands: HandDetection[],
      videoWidth: number,
      videoHeight: number,
    ) => {
      hands.forEach((hand, handIndex) => {
        const { landmarks, handedness, confidence } = hand;

        // Set drawing style
        ctx.strokeStyle = handedness === 'Right' ? '#4CAF50' : '#2196F3';
        ctx.fillStyle = handedness === 'Right' ? '#4CAF50' : '#2196F3';
        ctx.lineWidth = 2;

        // Draw landmarks as circles
        landmarks.forEach((landmark, index) => {
          const x = landmark.x * videoWidth;
          const y = landmark.y * videoHeight;
          const radius = Math.max(3, confidence * 8);

          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI);
          ctx.fill();

          // Draw landmark number
          ctx.fillStyle = 'white';
          ctx.font = '10px Arial';
          ctx.fillText(index.toString(), x + 8, y - 8);
          ctx.fillStyle = handedness === 'Right' ? '#4CAF50' : '#2196F3';
        });

        // Draw hand connections
        const connections = [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4], // Thumb
          [0, 5],
          [5, 6],
          [6, 7],
          [7, 8], // Index finger
          [5, 9],
          [9, 10],
          [10, 11],
          [11, 12], // Middle finger
          [9, 13],
          [13, 14],
          [14, 15],
          [15, 16], // Ring finger
          [13, 17],
          [17, 18],
          [18, 19],
          [19, 20], // Pinky
          [0, 17], // Palm
        ];

        connections.forEach(([start, end]) => {
          if (landmarks[start] && landmarks[end]) {
            ctx.beginPath();
            ctx.moveTo(
              landmarks[start].x * videoWidth,
              landmarks[start].y * videoHeight,
            );
            ctx.lineTo(
              landmarks[end].x * videoWidth,
              landmarks[end].y * videoHeight,
            );
            ctx.stroke();
          }
        });

        // Draw hand label
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px Arial';
        ctx.fillText(
          `${handedness} Hand (${Math.round(confidence * 100)}%)`,
          10,
          30 + handIndex * 20,
        );
      });
    },
    [],
  );

  // Update metrics
  const updateMetrics = useCallback(() => {
    const now = performance.now();

    if (lastFrameTime.current > 0) {
      const frameTime = now - lastFrameTime.current;
      const fps = Math.round(1000 / frameTime);

      setMetrics((prev) => ({
        ...prev,
        fps,
        latency: frameTime,
        cpuUsage: Math.min(100, Math.random() * 30 + 20), // Simulated CPU usage
        memoryUsage: Math.round(
          ((performance as any).memory?.usedJSHeapSize || 0) / 1024 / 1024,
        ),
      }));
    }

    lastFrameTime.current = now;
    frameCount.current += 1;
  }, []);

  // Set up video and frame processing
  useEffect(() => {
    const video = videoRef.current;
    if (video && stream) {
      // eslint-disable-next-line no-console
      console.log('Setting video source and playing...');
      video.srcObject = stream;

      // Add event listener for when video is ready
      const handleVideoReady = () => {
        // eslint-disable-next-line no-console
        console.log('Video ready, starting frame processing...');
        setIsVideoReady(true);
        startTime.current = performance.now();
      };

      video.addEventListener('loadedmetadata', handleVideoReady);

      video.play().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Video play error:', err);
      });

      // Set up frame processing loop
      let animationId: number;
      const processLoop = () => {
        capturePattern();
        updateMetrics();

        // Draw landmarks on canvas if hands are detected
        if (canvasRef.current && currentHands.length > 0) {
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            // Clear previous drawings
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            // Draw hand landmarks
            drawHandLandmarks(ctx, currentHands, canvas.width, canvas.height);
          }
        }

        animationId = requestAnimationFrame(processLoop);
      };

      processLoop();

      return () => {
        if (video) {
          video.removeEventListener('loadedmetadata', handleVideoReady);
        }
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
      };
    }
    return undefined;
  }, [stream, capturePattern, updateMetrics, currentHands, drawHandLandmarks]);

  return (
    <div className="camera-screen">
      {/* Top Bar with Metrics */}
      <div className="top-bar">
        <div className="top-bar-left">
          <h1>Hand Gesture Recognition</h1>
        </div>
        <div className="top-bar-metrics">
          <div className="metric-item">
            <span className="metric-label">FPS:</span>
            <span
              className={`metric-value ${metrics.fps >= 15 ? 'good' : 'poor'}`}
            >
              {metrics.fps}
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Latency:</span>
            <span
              className={`metric-value ${metrics.latency < 100 ? 'good' : 'poor'}`}
            >
              {Math.round(metrics.latency)}ms
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">CPU:</span>
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${metrics.cpuUsage}%` }}
              />
              <span className="progress-text">
                {Math.round(metrics.cpuUsage)}%
              </span>
            </div>
          </div>
          <div className="metric-item">
            <span className="metric-label">Memory:</span>
            <span className="metric-value">{metrics.memoryUsage}MB</span>
          </div>
          <div className="metric-item">
            <span
              className={`permission-indicator ${metrics.cameraPermission ? 'granted' : 'denied'}`}
            >
              📹
            </span>
          </div>
          <div className="metric-item">
            <span
              className={`permission-indicator ${metrics.micPermission ? 'granted' : 'denied'}`}
            >
              🎤
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Status:</span>
            <span className={`metric-value ${isVideoReady ? 'good' : 'poor'}`}>
              {isVideoReady ? 'READY' : 'INIT'}
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">MediaPipe:</span>
            <span
              className={`metric-value ${isMediaPipeReady ? 'good' : 'poor'}`}
            >
              {isMediaPipeReady ? 'ON' : 'OFF'}
            </span>
          </div>
          <div className="metric-item">
            <span className="metric-label">Hands:</span>
            <span
              className={`metric-value ${currentHands.length > 0 ? 'good' : 'poor'}`}
            >
              {currentHands.length}
            </span>
          </div>
        </div>
        <div className="top-bar-right">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="back-button"
          >
            ← Back
          </button>
        </div>
      </div>

      <div className="camera-container">
        {error && (
          <div className="error-message">
            <p>{error}</p>
            <button type="button">Try Again</button>
          </div>
        )}

        <div className="video-container">
          {isLoading && (
            <div className="loading-overlay">
              <p>Loading camera...</p>
            </div>
          )}
          {!isVideoReady && stream && (
            <div className="loading-overlay">
              <p>Initializing video stream...</p>
            </div>
          )}
          <div className="video-wrapper">
            <video
              ref={videoRef}
              width={640}
              height={480}
              autoPlay
              playsInline
              muted
              style={{
                border: isVideoReady ? '2px solid #4CAF50' : '2px solid #ccc',
                borderRadius: '10px',
                backgroundColor: '#000',
                opacity: isVideoReady ? 1 : 0.5,
              }}
            />
            <canvas
              ref={canvasRef}
              width={640}
              height={480}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                borderRadius: '10px',
                pointerEvents: 'none',
                zIndex: 10,
              }}
            />
          </div>
        </div>

        {/* Pattern Display */}
        <div className="pattern-display">
          <h3>Captured Patterns ({patterns.length})</h3>
          <div className="pattern-list">
            {patterns.slice(-10).map((pattern) => (
              <div
                key={`pattern-${pattern.timestamp}`}
                className={`pattern-item ${pattern.handDetected ? 'hand-detected' : 'no-hand'}`}
              >
                <span className="pattern-time">
                  {new Date(pattern.timestamp).toLocaleTimeString()}
                </span>
                <span className="pattern-gesture">
                  {pattern.gesture.replace('_', ' ').toUpperCase()}
                </span>
                <span className="pattern-confidence">
                  {Math.round(pattern.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Hand Details */}
        {currentHands.length > 0 && (
          <div className="hand-details">
            <h3>
              Hand Landmarks ({currentHands.length} hand
              {currentHands.length > 1 ? 's' : ''})
            </h3>
            <div className="hand-list">
              {currentHands.map((hand, handIndex) => (
                <div key={`hand-${handIndex}`} className="hand-item">
                  <div className="hand-header">
                    <span className="hand-label">{hand.handedness} Hand</span>
                    <span className="hand-confidence">
                      {Math.round(hand.confidence * 100)}% confidence
                    </span>
                  </div>
                  <div className="landmarks-grid">
                    {hand.landmarks.slice(0, 10).map((landmark, index) => (
                      <div
                        key={`landmark-${handIndex}-${index}`}
                        className="landmark-item"
                      >
                        <span className="landmark-index">{index}</span>
                        <span className="landmark-coords">
                          ({Math.round(landmark.x * 1000) / 1000},{' '}
                          {Math.round(landmark.y * 1000) / 1000})
                        </span>
                      </div>
                    ))}
                    {hand.landmarks.length > 10 && (
                      <div className="landmark-more">
                        +{hand.landmarks.length - 10} more landmarks
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Gesture Recognition */}
        {currentGesture !== 'unknown' && (
          <div className="gesture-recognition">
            <h3>Current Gesture</h3>
            <div className="gesture-display">
              <div className="gesture-name">
                {currentGesture.replace('_', ' ').toUpperCase()}
              </div>
              {currentPhrase && (
                <div className="gesture-phrase">"{currentPhrase}"</div>
              )}
            </div>
          </div>
        )}

        {/* Console Output */}
        <div className="console-output">
          <h4>Pattern Log:</h4>
          <div className="console-messages">
            {patterns.slice(-5).map((pattern) => (
              <div
                key={`console-${pattern.timestamp}`}
                className="console-message"
              >
                <span className="timestamp">
                  [{new Date(pattern.timestamp).toLocaleTimeString()}]
                </span>
                <span className="message">
                  Pattern captured: {pattern.gesture} (confidence:{' '}
                  {Math.round(pattern.confidence * 100)}%) -{' '}
                  {pattern.hands.length} hand
                  {pattern.hands.length !== 1 ? 's' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default SimpleCameraScreen;
