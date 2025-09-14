./whisper.cpp/build/bin/whisper-stream \
 -m ./whisper.cpp/models/ggml-tiny.en.bin \
 -t 4 --step 700 --length 7000 --keep 300 --vad-thold 0.65 \
 -f generated/live_transcript.txt

-> gives live_transcript.txt

python3 clean_transcript.py --source generated/live_transcript.txt --out generated/clean_transcript.txt

-> gives clean_transcript.txt

python3 glossify_transcript.py \
 --source generated/clean_transcript.txt \
 --lex lexicons.json \
 --out generated/sign_queue.jsonl \
 --tween-ms 100 \
 --sentence-pause-ms 250 \
 --rate 2.0

-> gives sign_queue.jsonl

python3 stream_queue_assets.py --source generated/sign_queue.jsonl --out generated/final_queue.txt

-> final final_queue
