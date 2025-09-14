#!/usr/bin/env bash
set -euo pipefail

### --- CONFIG ---
MODEL=./whisper.cpp/models/ggml-tiny.en.bin
WHISPER=./whisper.cpp/build/bin/whisper-stream
THREADS=4
STEP=700
LENGTH=7000
KEEP=300
VAD=0.65

GEN=generated
LOGDIR="$GEN/logs"
LEX=lexicons.json

SRC_TXT="$GEN/live_transcript.txt"
CLEAN_TXT="$GEN/clean_transcript.txt"
QUEUE_JSONL="$GEN/sign_queue.jsonl"
FINAL_QUEUE="$GEN/final_queue.txt"

HTTP_PORT=8000
DASH=index.html
### --------------

mkdir -p "$GEN" "$LOGDIR"
: > "$SRC_TXT"; : > "$CLEAN_TXT"; : > "$QUEUE_JSONL"; : > "$FINAL_QUEUE"

# check deps
[[ -x "$WHISPER" ]] || { echo "!! whisper-stream not found at $WHISPER"; exit 1; }
[[ -f "$MODEL" ]]   || { echo "!! model not found at $MODEL"; exit 1; }
[[ -f "$LEX"   ]]   || { echo "!! $LEX not found"; exit 1; }
[[ -f "$DASH"  ]]   || { echo "!! $DASH not found (the dashboard HTML)"; exit 1; }

# write a status JSON the UI can read
STATUS="$GEN/status.json"
cat > "$STATUS" <<JSON
{
  "model":"$MODEL",
  "whisper":"$WHISPER",
  "threads":$THREADS,
  "step":$STEP,
  "length":$LENGTH,
  "keep":$KEEP,
  "vad_thold":$VAD,
  "paths":{
    "live":"$SRC_TXT",
    "clean":"$CLEAN_TXT",
    "queue_jsonl":"$QUEUE_JSONL",
    "final_queue":"$FINAL_QUEUE",
    "logs_dir":"$LOGDIR"
  },
  "commands":{
    "whisper":"$WHISPER -m $MODEL -t $THREADS --step $STEP --length $LENGTH --keep $KEEP --vad-thold $VAD -f $SRC_TXT",
    "clean":"python3 -u clean_transcript.py --source $SRC_TXT --out $CLEAN_TXT",
    "gloss":"python3 -u glossify_transcript.py --source $CLEAN_TXT --lex $LEX --out $QUEUE_JSONL --tween-ms 100 --sentence-pause-ms 250 --rate 2.0",
    "stream":"python3 -u stream_queue_assets.py --source $QUEUE_JSONL --out $FINAL_QUEUE"
  }
}
JSON

PY="python3 -u"
WL="$LOGDIR/whisper.log"; CL="$LOGDIR/clean.log"; GL="$LOGDIR/gloss.log"; SQ="$LOGDIR/stream.log"
: > "$WL"; : > "$CL"; : > "$GL"; : > "$SQ"

# launch pipeline
stdbuf -oL -eL "$WHISPER" \
  -m "$MODEL" -t "$THREADS" \
  --step "$STEP" --length "$LENGTH" --keep "$KEEP" \
  --vad-thold "$VAD" \
  -f "$SRC_TXT" \
  | tee -a "$WL" >/dev/null & WPID=$!

$PY clean_transcript.py --source "$SRC_TXT" --out "$CLEAN_TXT" \
  | tee -a "$CL" >/dev/null & CPID=$!

$PY glossify_transcript.py --source "$CLEAN_TXT" --lex "$LEX" \
  --out "$QUEUE_JSONL" --tween-ms 100 --sentence-pause-ms 250 --rate 2.0 \
  | tee -a "$GL" >/dev/null & GPID=$!

$PY stream_queue_assets.py --source "$QUEUE_JSONL" --out "$FINAL_QUEUE" \
  | tee -a "$SQ" >/dev/null & SPID=$!

PIDS=("$WPID" "$CPID" "$GPID" "$SPID")

# serve dashboard
( cd . && $PY -m http.server "$HTTP_PORT" >/dev/null 2>&1 ) & HPID=$!

# macOS "open", else xdg-open if available
URL="http://localhost:$HTTP_PORT/index.html"
if command -v open >/dev/null 2>&1; then open "$URL"; elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"; fi

echo "[pipeline] running."
echo "  whisper pid=$WPID  log=$WL"
echo "  clean   pid=$CPID  log=$CL"
echo "  gloss   pid=$GPID  log=$GL"
echo "  stream  pid=$SPID  log=$SQ"
echo "  server  pid=$HPID  $URL"
echo "Press Ctrl+C to stop."

cleanup() {
  echo; echo "[pipeline] stopping…"
  for p in "${PIDS[@]}" "$HPID"; do kill "$p" 2>/dev/null || true; done
  wait || true
  echo "[pipeline] done."
}
trap cleanup INT TERM
wait
