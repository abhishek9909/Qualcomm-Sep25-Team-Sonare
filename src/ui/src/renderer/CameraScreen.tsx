import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import './App.css';
import { HandLandmarkerService } from './services/HandLandmarkerService';
import { GestureClassifier, GestureResult } from './services/GestureClassifier';
import {
  VocabularyService,
  VocabularyItem,
} from './services/VocabularyService';
import {
  PerformanceMonitor,
  PerformanceMetrics,
} from './services/PerformanceMonitor';

function CameraScreen(): React.ReactElement {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isMediaPipeReady, setIsMediaPipeReady] = useState(false);
  const [currentGesture, setCurrentGesture] = useState<GestureResult | null>(
    null,
  );
  const [currentPhrase, setCurrentPhrase] = useState<VocabularyItem | null>(
    null,
  );
  const [performanceMetrics, setPerformanceMetrics] =
    useState<PerformanceMetrics | null>(null);
  const [transcript, setTranscript] = useState<string[]>([]);
  const navigate = useNavigate();

  // Initialize services
  const handLandmarker = useRef(new HandLandmarkerService());
  const gestureClassifier = useRef(new GestureClassifier());
  const vocabularyService = useRef(new VocabularyService());
  const performanceMonitor = useRef(new PerformanceMonitor());

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

  // Initialize MediaPipe
  useEffect(() => {
    const initializeMediaPipe = async () => {
      try {
        await handLandmarker.current.initialize();
        setIsMediaPipeReady(true);
        // eslint-disable-next-line no-console
        console.log('MediaPipe initialized successfully');
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to initialize MediaPipe:', err);
        setError(
          'Failed to initialize hand detection. Please refresh the page.',
        );
      }
    };

    initializeMediaPipe();

    return () => {
      const landmarker = handLandmarker.current;
      if (landmarker) {
        landmarker.dispose();
      }
    };
  }, []);

  // Process video frames
  const processFrame = useCallback(async () => {
    if (
      !videoRef.current ||
      !isMediaPipeReady ||
      !handLandmarker.current.isReady()
    ) {
      return;
    }

    const startTime = performance.now();
    const detectionResult = await handLandmarker.current.detectHands(
      videoRef.current,
    );

    if (detectionResult && detectionResult.hands.length > 0) {
      // Process the first detected hand
      const hand = detectionResult.hands[0];
      const gestureResult = gestureClassifier.current.classifyGesture(hand);

      setCurrentGesture(gestureResult);

      // If gesture is stable and recognized, get the phrase
      if (gestureResult.isStable && gestureResult.gesture !== 'unknown') {
        const phrase = vocabularyService.current.getPhraseForGesture(
          gestureResult.gesture,
        );
        if (phrase && phrase.id !== currentPhrase?.id) {
          setCurrentPhrase(phrase);
          setTranscript((prev) => [...prev.slice(-9), phrase.phrase]); // Keep last 10 phrases
        }
      }

      // Update performance metrics
      const processingTime = performance.now() - startTime;
      performanceMonitor.current.updateMetrics(
        processingTime,
        detectionResult.latency,
      );
      setPerformanceMetrics(performanceMonitor.current.getMetrics());
    } else {
      setCurrentGesture(null);
    }
  }, [isMediaPipeReady, currentPhrase?.id]);

  // Set up frame processing
  useEffect(() => {
    if (videoRef.current && stream && isMediaPipeReady) {
      // eslint-disable-next-line no-console
      console.log('Setting video source and playing...');
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch((err) => {
        // eslint-disable-next-line no-console
        console.error('Video play error:', err);
      });

      // Set up frame processing loop
      let animationId: number;
      const processLoop = () => {
        processFrame();
        animationId = requestAnimationFrame(processLoop);
      };

      processLoop();

      return () => {
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
      };
    }
    return undefined;
  }, [stream, isMediaPipeReady, processFrame]);

  return (
    <div className="camera-screen">
      <div className="camera-header">
        <h1>Front Camera</h1>
        <div className="header-buttons">
          <button type="button" className="test-button">
            🔄 Test Camera
          </button>
          <button
            type="button"
            onClick={() => navigate('/')}
            className="back-button"
          >
            ← Back to Main
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
          {!isMediaPipeReady && stream && (
            <div className="loading-overlay">
              <p>Initializing hand detection...</p>
            </div>
          )}
          <video
            ref={videoRef}
            width={640}
            height={480}
            autoPlay
            playsInline
            muted
            style={{
              border: stream ? '2px solid #4CAF50' : '2px solid #ccc',
              borderRadius: '10px',
              backgroundColor: '#000',
              opacity: stream ? 1 : 0.5,
            }}
          />

          {/* Gesture Recognition Overlay */}
          {currentGesture && (
            <div className="gesture-overlay">
              <div
                className={`gesture-indicator ${
                  currentGesture.isStable ? 'stable' : 'unstable'
                }`}
              >
                <span className="gesture-emoji">
                  {currentPhrase?.emoji || '🤚'}
                </span>
                <span className="gesture-text">
                  {currentGesture.gesture.replace('_', ' ').toUpperCase()}
                </span>
                <span className="confidence">
                  {Math.round(currentGesture.confidence * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Current Phrase Display */}
        {currentPhrase && currentGesture?.isStable && (
          <div className="phrase-display">
            <h3>Recognized Phrase:</h3>
            <div className="phrase-card">
              <span className="phrase-emoji">{currentPhrase.emoji}</span>
              <span className="phrase-text">{currentPhrase.phrase}</span>
              <span className="phrase-description">
                {currentPhrase.description}
              </span>
            </div>
          </div>
        )}

        {/* Transcript */}
        {transcript.length > 0 && (
          <div className="transcript">
            <h4>Recent Phrases:</h4>
            <div className="transcript-list">
              {transcript.map((phrase, index) => (
                <span
                  key={`phrase-${phrase}-${index}`}
                  className="transcript-item"
                >
                  {phrase}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        {performanceMetrics && (
          <div className="performance-metrics">
            <div className="metrics-grid">
              <div className="metric">
                <span className="metric-label">FPS:</span>
                <span
                  className={`metric-value ${
                    performanceMetrics.fps >= 15 ? 'good' : 'poor'
                  }`}
                >
                  {performanceMetrics.fps}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">Latency:</span>
                <span
                  className={`metric-value ${
                    performanceMetrics.latency < 100 ? 'good' : 'poor'
                  }`}
                >
                  {Math.round(performanceMetrics.latency)}ms
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">Status:</span>
                <span
                  className={`metric-value ${
                    performanceMonitor.current.isPerformanceGood()
                      ? 'good'
                      : 'poor'
                  }`}
                >
                  {performanceMonitor.current.getPerformanceStatus()}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">Mode:</span>
                <span className="metric-value offline">
                  {performanceMetrics.isOffline ? 'OFFLINE' : 'ONLINE'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default CameraScreen;
