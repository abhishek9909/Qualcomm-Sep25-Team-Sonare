#!/bin/bash
set -euo pipefail


INPUT_DIR="VIDEOS"
OUTPUT_DIR="${INPUT_DIR}/mp4"
mkdir -p "$OUTPUT_DIR"


shopt -s nullglob
for f in "$INPUT_DIR"/*.webm; do
 base="$(basename "$f" .webm)"
 out="$OUTPUT_DIR/$base.mp4"
 echo "Converting: $f -> $out"
 ffmpeg -y -i "$f" \
   -vf "scale=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p" \
   -c:v libx264 -preset veryfast -crf 23 \
   -c:a aac -b:a 128k \
   -movflags +faststart \
   "$out"
done


echo "✅ Done. MP4s in $OUTPUT_DIR"