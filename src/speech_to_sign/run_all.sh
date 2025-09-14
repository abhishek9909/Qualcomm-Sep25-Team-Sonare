#!/usr/bin/env bash
set -euo pipefail

### CONFIG
GEN_DIR="generated"
LIVE="$GEN_DIR/live_transcript.txt"
CLEAN="$GEN_DIR/clean_transcript.txt"
QUEUE_JSONL="$GEN_DIR/sign_queue.jsonl"
FINAL_QUEUE="$GEN_DIR/final_queue.txt"
OUTPUT="$GEN_DIR/output.mp4"
LEX="lexicons.json"

RATE="2.0"                # playback rate for stitching
TWEEN_MS="100"
SENTENCE_PAUSE_MS="250"

CLEAN_POLL="0.10"
CLEAN_IDLE_MS="300"
GLOSS_POLL="0.20"
STREAM_POLL="0.15"

FRESH=0
FROM_START=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --fresh) FRESH=1; shift;;
    --from-start) FROM_START=1; shift;;
    -h|--help)
      echo "Usage: $0 [--fresh] [--from-start]"
      exit 0;;
    *) echo "Unknown arg: $1"; exit 1;;
  esac
done

### PRECHECKS
need() { command -v "$1" >/dev/null 2>&1 || { echo "Missing: $1"; exit 1; }; }
need python3
need ffmpeg
[[ -f clean_transcript.py ]]    || { echo "clean_transcript.py not found"; exit 1; }
[[ -f glossify_transcript.py ]] || { echo "glossify_transcript.py not found"; exit 1; }
[[ -f stream_queue_assets.py ]] || { echo "stream_queue_assets.py not found"; exit 1; }
[[ -f stitch_queue.sh ]]        || { echo "stitch_queue.sh not found"; exit 1; }
[[ -f "$LEX" ]]                 || { echo "Missing $LEX"; exit 1; }

mkdir -p "$GEN_DIR"
: > "$LIVE"  # ensure exists

if (( FRESH == 1 )); then
  : > "$CLEAN"
  : > "$QUEUE_JSONL"
  : > "$FINAL_QUEUE"
  : > "$OUTPUT"
fi

### CLEANUP & FINAL STITCH (runs once at end)
pids=()
cleanup() {
  echo; echo "[run_all] stopping…"
  for pid in "${pids[@]:-}"; do
    kill "$pid" 2>/dev/null || true
  done
  pkill -P $$ 2>/dev/null || true

  # Final one-shot stitch
  if [[ -s "$FINAL_QUEUE" ]]; then
    echo "[run_all] stitching final video…"
    ./stitch_queue.sh "$FINAL_QUEUE" "$OUTPUT" "$RATE" | sed -u 's/^/[stitch] /'
  else
    echo "[run_all] final_queue is empty; skipping stitch."
  fi
}
trap cleanup EXIT INT TERM

### START STAGES
echo "[run_all] live  -> $LIVE"
echo "[run_all] clean -> $CLEAN"
echo "[run_all] queue -> $QUEUE_JSONL"
echo "[run_all] final -> $FINAL_QUEUE"
echo "[run_all] out   -> $OUTPUT"

# 1) live -> clean
clean_cmd=(
  python3 clean_transcript.py
  --source "$LIVE"
  --out "$CLEAN"
  --poll "$CLEAN_POLL"
  --idle-ms "$CLEAN_IDLE_MS"
)
(( FROM_START == 1 )) && clean_cmd+=(--from-start)
"${clean_cmd[@]}" | sed -u 's/^/[clean] /' &
pids+=($!)

# 2) clean -> sign_queue
python3 glossify_transcript.py \
  --source "$CLEAN" \
  --lex "$LEX" \
  --out "$QUEUE_JSONL" \
  --poll "$GLOSS_POLL" \
  --tween-ms "$TWEEN_MS" \
  --sentence-pause-ms "$SENTENCE_PAUSE_MS" \
  --rate "$RATE" | sed -u 's/^/[gloss] /' &
pids+=($!)

# 3) sign_queue -> final_queue
python3 stream_queue_assets.py \
  --source "$QUEUE_JSONL" \
  --out "$FINAL_QUEUE" \
  --poll "$STREAM_POLL" | sed -u 's/^/[stream] /' &
pids+=($!)

# Run until you Ctrl-C; then cleanup() stitches once.
wait
