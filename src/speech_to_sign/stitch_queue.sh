#!/usr/bin/env bash
set -euo pipefail

# inputs/outputs
QUEUE="${1:-generated/final_queue.txt}"
OUT="${2:-generated/output.mp4}"
SPEED="${3:-1.0}"   # 2.0 means final video is 2× faster
LIST="generated/concat_list.txt"

[[ -f "$QUEUE" ]] || { echo "missing $QUEUE"; exit 1; }
mkdir -p "$(dirname "$OUT")" "$(dirname "$LIST")"

# build concat list (absolute paths, quoted)
: > "$LIST"
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  # make absolute
  if [[ "$line" = /* ]]; then
    abs="$line"
  else
    abs="$(pwd)/$line"
  fi
  # escape single quotes for concat file format
  esc=${abs//\'/\'\\\'\'}
  printf "file '%s'\n" "$esc" >> "$LIST"
done < "$QUEUE"

# pick pipeline:
# 1) try stream-copy (fast, no re-encode) if all inputs share identical codec/params
# 2) otherwise, re-encode to H.264 and yuv420p (safest for browsers)
try_stream_copy() {
  ffmpeg -y -f concat -safe 0 -i "$LIST" -c copy -movflags +faststart "$OUT"
}

reencode_concat() {
  local speed="$1"
  if awk 'BEGIN{exit !(('$SPEED'!=1.0))}'; then
    # speed change: setpts=1/SPEED
    factor=$(awk "BEGIN{printf \"%.6f\", 1/$speed}")
    # if your sources have audio and you want to speed it too, add: [0:a]atempo=$speed[a]; -map "[a]"
    ffmpeg -y -f concat -safe 0 -i "$LIST" \
      -filter:v "setpts=${factor}*PTS" \
      -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p \
      -movflags +faststart "$OUT"
  else
    ffmpeg -y -f concat -safe 0 -i "$LIST" \
      -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p \
      -movflags +faststart "$OUT"
  fi
}

echo "[stitch] concatenating $(wc -l < "$QUEUE") clips → $OUT"
if try_stream_copy 2>/dev/null; then
  echo "[stitch] stream-copied successfully."
  if awk 'BEGIN{exit !(('$SPEED'!=1.0))}'; then
    echo "[stitch] re-encoding to apply speed $SPEED× …"
    mv "$OUT" "${OUT%.mp4}_raw.mp4"
    ffmpeg -y -i "${OUT%.mp4}_raw.mp4" \
      -filter:v "setpts=$(awk "BEGIN{printf \"%.6f\", 1/$SPEED}")*PTS" \
      -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p \
      -movflags +faststart "$OUT"
  fi
else
  echo "[stitch] mixed codecs detected; re-encoding …"
  reencode_concat "$SPEED"
fi

echo "[stitch] done → $OUT"
