import { HandLandmark, HandDetection } from './HandLandmarkerService';

export interface GestureResult {
  gesture: string;
  confidence: number;
  isStable: boolean;
}

export interface GestureHistory {
  gesture: string;
  timestamp: number;
  confidence: number;
}

export class GestureClassifier {
  private gestureHistory: GestureHistory[] = [];
  private readonly stabilityThreshold = 200; // ms
  private readonly maxHistory = 10;
  private readonly minConfidence = 0.7;

  classifyGesture(hand: HandDetection): GestureResult {
    const normalizedLandmarks = this.normalizeLandmarks(hand.landmarks);
    const gesture = this.detectGesture(normalizedLandmarks);
    const confidence = this.calculateConfidence(normalizedLandmarks, gesture);

    // Add to history
    this.addToHistory(gesture, confidence);

    // Check stability
    const isStable = this.isGestureStable(gesture);

    return {
      gesture,
      confidence,
      isStable,
    };
  }

  private normalizeLandmarks(landmarks: HandLandmark[]): HandLandmark[] {
    if (landmarks.length === 0) return landmarks;

    // Use wrist as origin (landmark 0)
    const wrist = landmarks[0];
    const normalized = landmarks.map((landmark) => ({
      x: landmark.x - wrist.x,
      y: landmark.y - wrist.y,
      z: landmark.z - wrist.z,
    }));

    // Scale by hand size (distance from wrist to middle finger MCP)
    const middleMcp = landmarks[9]; // Middle finger MCP
    const handSize = Math.sqrt(
      Math.pow(middleMcp.x - wrist.x, 2) + Math.pow(middleMcp.y - wrist.y, 2),
    );

    if (handSize > 0) {
      return normalized.map((landmark) => ({
        x: landmark.x / handSize,
        y: landmark.y / handSize,
        z: landmark.z / handSize,
      }));
    }

    return normalized;
  }

  private detectGesture(landmarks: HandLandmark[]): string {
    if (landmarks.length < 21) return 'unknown';

    // Check for specific gestures
    if (this.isFist(landmarks)) return 'fist';
    if (this.isOpenHand(landmarks)) return 'open_hand';
    if (this.isPeaceSign(landmarks)) return 'peace';
    if (this.isThumbsUp(landmarks)) return 'thumbs_up';
    if (this.isThumbsDown(landmarks)) return 'thumbs_down';
    if (this.isPointing(landmarks)) return 'pointing';
    if (this.isOK(landmarks)) return 'ok';
    if (this.isWave(landmarks)) return 'wave';

    return 'unknown';
  }

  private isFist(landmarks: HandLandmark[]): boolean {
    // Check if all fingertips are below their respective MCPs
    const fingertipIndices = [4, 8, 12, 16, 20]; // Thumb, Index, Middle, Ring, Pinky
    const mcpIndices = [3, 6, 10, 14, 18];

    return fingertipIndices.every(
      (tipIdx, i) => landmarks[tipIdx].y > landmarks[mcpIndices[i]].y,
    );
  }

  private isOpenHand(landmarks: HandLandmark[]): boolean {
    // Check if all fingertips are above their respective MCPs
    const fingertipIndices = [4, 8, 12, 16, 20];
    const mcpIndices = [3, 6, 10, 14, 18];

    return fingertipIndices.every(
      (tipIdx, i) => landmarks[tipIdx].y < landmarks[mcpIndices[i]].y,
    );
  }

  private isPeaceSign(landmarks: HandLandmark[]): boolean {
    // Index and middle finger up, others down
    const indexUp = landmarks[8].y < landmarks[6].y; // Index finger
    const middleUp = landmarks[12].y < landmarks[10].y; // Middle finger
    const ringDown = landmarks[16].y > landmarks[14].y; // Ring finger
    const pinkyDown = landmarks[20].y > landmarks[18].y; // Pinky

    return indexUp && middleUp && ringDown && pinkyDown;
  }

  private isThumbsUp(landmarks: HandLandmark[]): boolean {
    // Thumb up, others down
    const thumbUp = landmarks[4].x > landmarks[3].x; // Thumb
    const indexDown = landmarks[8].y > landmarks[6].y; // Index finger
    const middleDown = landmarks[12].y > landmarks[10].y; // Middle finger
    const ringDown = landmarks[16].y > landmarks[14].y; // Ring finger
    const pinkyDown = landmarks[20].y > landmarks[18].y; // Pinky

    return thumbUp && indexDown && middleDown && ringDown && pinkyDown;
  }

  private isThumbsDown(landmarks: HandLandmark[]): boolean {
    // Thumb down, others down
    const thumbDown = landmarks[4].x < landmarks[3].x; // Thumb
    const indexDown = landmarks[8].y > landmarks[6].y; // Index finger
    const middleDown = landmarks[12].y > landmarks[10].y; // Middle finger
    const ringDown = landmarks[16].y > landmarks[14].y; // Ring finger
    const pinkyDown = landmarks[20].y > landmarks[18].y; // Pinky

    return thumbDown && indexDown && middleDown && ringDown && pinkyDown;
  }

  private isPointing(landmarks: HandLandmark[]): boolean {
    // Only index finger up
    const indexUp = landmarks[8].y < landmarks[6].y; // Index finger
    const middleDown = landmarks[12].y > landmarks[10].y; // Middle finger
    const ringDown = landmarks[16].y > landmarks[14].y; // Ring finger
    const pinkyDown = landmarks[20].y > landmarks[18].y; // Pinky

    return indexUp && middleDown && ringDown && pinkyDown;
  }

  private isOK(landmarks: HandLandmark[]): boolean {
    // Thumb and index finger touching (forming a circle)
    const thumb = landmarks[4];
    const index = landmarks[8];
    const distance = Math.sqrt(
      Math.pow(thumb.x - index.x, 2) + Math.pow(thumb.y - index.y, 2),
    );

    const otherFingersDown =
      landmarks[12].y > landmarks[10].y && // Middle
      landmarks[16].y > landmarks[14].y && // Ring
      landmarks[20].y > landmarks[18].y; // Pinky

    return distance < 0.05 && otherFingersDown;
  }

  private isWave(landmarks: HandLandmark[]): boolean {
    // Simple wave detection - all fingers up and hand moving
    const allFingersUp =
      landmarks[8].y < landmarks[6].y && // Index
      landmarks[12].y < landmarks[10].y && // Middle
      landmarks[16].y < landmarks[14].y && // Ring
      landmarks[20].y < landmarks[18].y; // Pinky

    return allFingersUp;
  }

  private calculateConfidence(
    landmarks: HandLandmark[],
    gesture: string,
  ): number {
    // Simple confidence based on how well the gesture matches
    if (gesture === 'unknown') return 0;

    // Base confidence on hand detection confidence and gesture clarity
    let confidence = 0.8; // Base confidence

    // Adjust based on gesture-specific criteria
    switch (gesture) {
      case 'fist':
        confidence = this.calculateFistConfidence(landmarks);
        break;
      case 'open_hand':
        confidence = this.calculateOpenHandConfidence(landmarks);
        break;
      case 'peace':
        confidence = this.calculatePeaceConfidence(landmarks);
        break;
      default:
        confidence = 0.7;
    }

    return Math.min(confidence, 1.0);
  }

  private calculateFistConfidence(landmarks: HandLandmark[]): number {
    const fingertipIndices = [4, 8, 12, 16, 20];
    const mcpIndices = [3, 6, 10, 14, 18];

    let confidence = 0;
    fingertipIndices.forEach((tipIdx, i) => {
      if (landmarks[tipIdx].y > landmarks[mcpIndices[i]].y) {
        confidence += 0.2;
      }
    });

    return confidence;
  }

  private calculateOpenHandConfidence(landmarks: HandLandmark[]): number {
    const fingertipIndices = [4, 8, 12, 16, 20];
    const mcpIndices = [3, 6, 10, 14, 18];

    let confidence = 0;
    fingertipIndices.forEach((tipIdx, i) => {
      if (landmarks[tipIdx].y < landmarks[mcpIndices[i]].y) {
        confidence += 0.2;
      }
    });

    return confidence;
  }

  private calculatePeaceConfidence(landmarks: HandLandmark[]): number {
    let confidence = 0;

    if (landmarks[8].y < landmarks[6].y) confidence += 0.3; // Index up
    if (landmarks[12].y < landmarks[10].y) confidence += 0.3; // Middle up
    if (landmarks[16].y > landmarks[14].y) confidence += 0.2; // Ring down
    if (landmarks[20].y > landmarks[18].y) confidence += 0.2; // Pinky down

    return confidence;
  }

  private addToHistory(gesture: string, confidence: number): void {
    const now = Date.now();
    this.gestureHistory.push({
      gesture,
      timestamp: now,
      confidence,
    });

    // Keep only recent history
    if (this.gestureHistory.length > this.maxHistory) {
      this.gestureHistory = this.gestureHistory.slice(-this.maxHistory);
    }
  }

  private isGestureStable(gesture: string): boolean {
    if (this.gestureHistory.length < 3) return false;

    const now = Date.now();
    const recentHistory = this.gestureHistory.filter(
      (h) => now - h.timestamp < this.stabilityThreshold,
    );

    if (recentHistory.length < 2) return false;

    // Check if the same gesture appears in recent history with good confidence
    const sameGesture = recentHistory.filter((h) => h.gesture === gesture);
    const avgConfidence =
      sameGesture.reduce((sum, h) => sum + h.confidence, 0) /
      sameGesture.length;

    return sameGesture.length >= 2 && avgConfidence >= this.minConfidence;
  }

  reset(): void {
    this.gestureHistory = [];
  }
}
