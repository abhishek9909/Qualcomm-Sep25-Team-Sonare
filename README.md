# Sign ↔ Speech (Offline) — Edge AI Demo

Fully on-device, privacy-preserving **Sign → Speech** and **Speech → Sign** translator built for the Qualcomm Hackathon September 2025. **No internet required** after installation.

- **Platform:** Cross-platform (Electron + Python)
- **UI:** React + TypeScript + Electron
- **On-device CV:** MediaPipe Tasks (Hands) in renderer
- **Classification:** Real-time gesture recognition with temporal stabilization
- **ASR:** whisper.cpp for speech-to-text
- **TTS:** Browser speechSynthesis API
- **Backend:** FastAPI server for keypoint processing

---

## 🎯 Project Overview

This project demonstrates a complete **offline sign language translation system** with two main flows:

1. **Sign → Speech**: Camera captures hand gestures → MediaPipe extracts keypoints → Gesture classifier → Text output → TTS
2. **Speech → Sign**: Microphone captures speech → whisper.cpp ASR → Text processing → Sign language video playback

**Key Features:**

- ✅ **100% Offline** - No internet required after setup
- ✅ **Real-time Processing** - ~15-20 FPS hand detection
- ✅ **Privacy-First** - All processing happens locally
- ✅ **Cross-Platform** - Works on Windows, macOS, Linux
- ✅ **Modular Architecture** - Separate UI and backend components

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Frontend (Electron)                     │
├─────────────────────────────────────────────────────────────────┤
│  React UI  │  Camera Capture  │  MediaPipe Hands  │  Gesture   │
│            │                  │  Keypoint Extract │  Classifier│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (FastAPI)                           │
├─────────────────────────────────────────────────────────────────┤
│  Keypoint Queue  │  Temporal Logic  │  ASR (whisper.cpp)  │ TTS│
└─────────────────────────────────────────────────────────────────┘
```

### Component Breakdown

- **`src/ui/`** - Electron + React frontend with camera capture and gesture recognition
- **`src/server/`** - FastAPI backend for keypoint processing and queue management
- **`src/speech_to_sign/`** - Speech-to-sign pipeline with whisper.cpp integration
- **`src/Video_Sampling/`** - Sign language video dataset and processing utilities

---

## 🚀 Quick Start

### Prerequisites

- **Node.js ≥ 18** (LTS)
- **Python ≥ 3.13**
- **uv** (Python package manager)
- **Camera + Microphone** access

### Installation

1. **Clone and setup Python environment:**

```bash
git clone <repository-url>
cd Qualcomm-Sep25-Team-Sonare

# Install uv if not already installed
brew install uv  # macOS
# or: curl -LsSf https://astral.sh/uv/install.sh | sh  # Linux

# Setup Python environment
uv venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
uv sync
```

2. **Setup UI dependencies:**

```bash
cd src/ui
npm install
```

3. **Download required models:**

```bash
# MediaPipe hand landmarker model (place in src/ui/public/assets/mediapipe/)
# whisper.cpp model (place in src/speech_to_sign/whisper.cpp/models/)
```

### Running the Application

**Option 1: Full Stack (Recommended)**

```bash
# Terminal 1: Start backend server
cd src/server
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Terminal 2: Start UI
cd src/ui
npm start
```

**Option 2: Speech-to-Sign Pipeline Only**

```bash
cd src/speech_to_sign
./run_all.sh
```

---

## 📁 Project Structure

```
Qualcomm-Sep25-Team-Sonare/
├── src/
│   ├── ui/                          # Electron + React Frontend
│   │   ├── src/
│   │   │   ├── main/               # Electron main process
│   │   │   ├── renderer/           # React UI components
│   │   │   │   ├── services/       # MediaPipe, GestureClassifier
│   │   │   │   ├── CameraScreen.tsx
│   │   │   │   └── App.tsx
│   │   │   └── preload/            # IPC bridge
│   │   ├── public/assets/mediapipe/ # MediaPipe models & WASM
│   │   └── package.json
│   │
│   ├── server/                      # FastAPI Backend
│   │   ├── main.py                 # Keypoint processing API
│   │   └── justfile               # Development commands
│   │
│   ├── speech_to_sign/             # Speech-to-Sign Pipeline
│   │   ├── run_all.sh             # Main pipeline script
│   │   ├── clean_transcript.py    # Text preprocessing
│   │   ├── glossify_transcript.py # Text-to-gloss mapping
│   │   ├── stream_queue_assets.py # Video queue management
│   │   ├── lexicons.json          # Sign language vocabulary
│   │   ├── videos/                # Sign language video assets
│   │   └── whisper.cpp/           # whisper.cpp integration
│   │
│   └── Video_Sampling/             # Dataset & Utilities
│       ├── words_to_visual.py     # Video sampling script
│       ├── sign_videos/           # Sample sign videos
│       └── *.json                 # Dataset files
│
├── code_samples/                   # Development notes & examples
├── pyproject.toml                 # Python dependencies
└── README.md
```

---

## 🎮 Usage

### Sign → Speech Flow

1. **Start the application** (see Quick Start)
2. **Allow camera permissions** when prompted
3. **Perform sign language gestures** in front of the camera
4. **View recognized gestures** in real-time with confidence scores
5. **Listen to text-to-speech** output (if enabled)

**Supported Gestures:**

- Basic: Fist, Open Hand, Peace Sign, Thumbs Up/Down
- Advanced: Pointing, OK Sign, Wave
- Custom: Extensible gesture recognition system

### Speech → Sign Flow

1. **Switch to Speech-to-Sign mode**
2. **Hold Space** to start recording speech
3. **Speak clearly** and release Space to stop
4. **Watch sign language videos** corresponding to recognized words

**Supported Vocabulary:** 90+ sign language words including:

- Greetings: HI, HELLO, GOOD MORNING
- Actions: EAT, DRINK, GO, COME, SIT, STAND
- People: I, YOU, HE, SHE, FAMILY, TEACHER
- Objects: FOOD, WATER, COFFEE, BOOK
- And many more...

---

## ⚙️ Configuration

### Environment Variables

Create `.env` files as needed:

**Backend (.env):**

```bash
# Server settings
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=info

# MediaPipe settings
MEDIAPIPE_WASM_DIR=src/ui/public/assets/mediapipe/wasm
MEDIAPIPE_TASK_PATH=src/ui/public/assets/mediapipe/hand_landmarker.task

# Whisper settings
WHISPER_MODEL_PATH=src/speech_to_sign/whisper.cpp/models/ggml-tiny.en.bin
WHISPER_BINARY_PATH=src/speech_to_sign/whisper.cpp/build/bin/whisper-stream
```

**Frontend (.env):**

```bash
# API endpoints
REACT_APP_API_URL=http://localhost:8000
REACT_APP_WS_URL=ws://localhost:8000/ws

# MediaPipe settings
REACT_APP_MEDIAPIPE_WASM_URL=/assets/mediapipe/wasm
REACT_APP_MEDIAPIPE_MODEL_URL=/assets/mediapipe/hand_landmarker.task
```

### Performance Tuning

**For better performance:**

- Use GPU acceleration for MediaPipe (enabled by default)
- Adjust `minHandDetectionConfidence` in `HandLandmarkerService.ts`
- Modify gesture stability thresholds in `GestureClassifier.ts`
- Tune whisper.cpp parameters in `run_all.sh`

---

## 🔧 Development

### Available Scripts

**Python Backend:**

```bash
cd src/server
just dev          # Start development server
just prod         # Start production server
just health       # Check server health
just stats        # Get processing statistics
```

**React Frontend:**

```bash
cd src/ui
npm start         # Start development server
npm run build     # Build for production
npm run package   # Package Electron app
npm test          # Run tests
npm run lint      # Lint code
```

**Speech-to-Sign Pipeline:**

```bash
cd src/speech_to_sign
./run_all.sh      # Run complete pipeline
./stitch_queue.sh # Stitch video queue
```

### Adding New Gestures

1. **Update gesture detection** in `src/ui/src/renderer/services/GestureClassifier.ts`
2. **Add gesture patterns** in the `detectGesture()` method
3. **Update confidence calculations** for new gestures
4. **Test with real hand data** and adjust thresholds

### Adding New Sign Language Words

1. **Add video assets** to `src/speech_to_sign/videos/`
2. **Update vocabulary** in `src/speech_to_sign/lexicons.json`
3. **Test speech recognition** with new words
4. **Verify video playback** in the UI

---

## 📊 Performance Metrics

**Current Performance:**

- **Hand Detection:** ~15-20 FPS
- **Gesture Recognition:** ~200ms latency
- **Speech Recognition:** ~650ms latency (whisper.cpp tiny)
- **Memory Usage:** ~430MB (Electron + Python)
- **CPU Usage:** ~22% (on modern hardware)

**Optimization Opportunities:**

- ONNX Runtime integration for faster inference
- WebAssembly optimizations for MediaPipe
- Model quantization for smaller memory footprint
- Multi-threading for parallel processing

---

## 🐛 Troubleshooting

### Common Issues

**Camera not working:**

- Check browser/OS camera permissions
- Verify camera is not used by other applications
- Try different camera sources (0, 1, 2...)

**MediaPipe not loading:**

- Ensure WASM files are in correct location
- Check browser console for CORS errors
- Verify model file paths in configuration

**Speech recognition failing:**

- Check microphone permissions
- Verify whisper.cpp model is downloaded
- Ensure audio input is working

**Gesture recognition inaccurate:**

- Improve lighting conditions
- Keep hands in frame and well-lit
- Adjust confidence thresholds
- Check for background interference

### Debug Mode

Enable debug logging:

```bash
# Backend
export LOG_LEVEL=debug
uv run uvicorn main:app --reload

# Frontend
npm start -- --debug
```

---

## 🤝 Contributing

1. **Fork the repository**
2. **Create a feature branch** (`git checkout -b feature/amazing-feature`)
3. **Commit your changes** (`git commit -m 'Add amazing feature'`)
4. **Push to the branch** (`git push origin feature/amazing-feature`)
5. **Open a Pull Request**

### Development Guidelines

- Follow TypeScript best practices
- Add tests for new features
- Update documentation for API changes
- Ensure cross-platform compatibility
- Maintain performance benchmarks

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 👥 Team

**Qualcomm Hackathon September 2025 - Team Sonare**

- **Armaan Sandhu** (apsandhu@umass.edu)
- **Archana Yadav** (archanayadav@umass.edu)
- **Abhishek Mishra** (abhishekmish@umass.edu)
- **Sagnik Chatterjee** (sagnikchatte@umass.edu)
- **Deva Anand** (devaanad@umass.edu)

---

## 🙏 Acknowledgments

- **MediaPipe** - Hand landmark detection
- **whisper.cpp** - Speech recognition
- **Electron** - Desktop app framework
- **React** - UI framework
- **FastAPI** - Backend framework
- **Qualcomm** - Hackathon platform and support

---

## 📈 Future Roadmap

- [ ] **ONNX Runtime integration** for faster inference
- [ ] **Multi-language support** (ASL, BSL, etc.)
- [ ] **Avatar-based sign rendering** (replace video files)
- [ ] **Real-time collaboration** features
- [ ] **Mobile app** version
- [ ] **Cloud deployment** options
- [ ] **Advanced gesture recognition** with deep learning
- [ ] **Sign language synthesis** from text

---

**Built with ❤️ for the Qualcomm Hackathon September 2025**

## To run the pipeline in the demo:

- [ ] **npm run package** - creates an installer which for the app.
- [ ] **python inference_basic.py** - command to run the lemmatization and word-mapping and video-sticthing server, running completely on local.
- [ ] **python inference_whisper.py** - command to run the whisper model on local.
