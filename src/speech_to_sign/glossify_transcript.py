#!/usr/bin/env python3
# glossify_transcript.py
# Tail a cleaned transcript file; for each new line, convert words to UPPERCASE "glosses",
# map them through lexicons.json to build a sign queue, and append a JSON object to a JSONL file.

import argparse, json, os, re, sys, time
from typing import List, Dict, Any
from collections import deque

# ---------- regex + basic cleaning ----------
WORD_RE        = re.compile(r"[A-Za-z0-9']+")
APOSTROPHE_RE  = re.compile(r"[’`]")
SPACE_RE       = re.compile(r"\s+")

def normalize_token(tok: str) -> str:
    tok = tok.lower()
    tok = APOSTROPHE_RE.sub("'", tok)
    return tok

# ---------- robust tailer: survives overwrite/truncate; optional idle flush ----------
def follow_lines(path: str, poll: float, idle_ms: int = 0, from_start: bool = True):
    """
    Tail a file and yield lines as they are appended.
    - Survives overwrite/truncate (log rotation).
    - If idle_ms > 0, also emits the partial line after a short pause.
    """
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    open(path, "a").close()

    def _open():
        f = open(path, "r", encoding="utf-8", errors="ignore")
        if not from_start:
            f.seek(0, os.SEEK_END)
        ino = os.fstat(f.fileno()).st_ino
        pos = f.tell()
        return f, ino, pos

    f, ino, pos = _open()
    buf = ""
    last = time.time()
    idle = max(0, idle_ms) / 1000.0

    try:
        while True:
            chunk = f.read()
            if chunk:
                pos += len(chunk)
                buf += chunk
                last = time.time()
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    yield line
            else:
                if idle and buf and (time.time() - last) >= idle:
                    line, buf = buf, ""
                    yield line
                    last = time.time()
                time.sleep(poll)

            # detect rotation/truncate
            try:
                st = os.stat(path)
            except FileNotFoundError:
                time.sleep(poll)
                continue
            rotated = st.st_ino != ino
            truncated = st.st_size < pos
            if rotated or truncated:
                try: f.close()
                except: pass
                f, ino, pos = _open()
    finally:
        try: f.close()
        except: pass

# ---------- sentence → gloss (YOUR RULE: each word → UPPERCASE) ----------
def sent_to_gloss(text: str) -> List[str]:
    toks = [normalize_token(t) for t in WORD_RE.findall(text)]
    glosses = [t.upper() for t in toks if t]
    # collapse immediate duplicates (HELLO HELLO → HELLO)
    dedup: List[str] = []
    for g in glosses:
        if not dedup or dedup[-1] != g:
            dedup.append(g)
    return dedup

# ---------- lexicon mapping ----------
def load_lexicons(path: str) -> Dict[str, Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def map_gloss_to_queue(
    gloss: List[str],
    lex: Dict[str, Dict[str, Any]],
    tween_ms: int,
    rate: float
) -> List[Dict[str, Any]]:
    queue: List[Dict[str, Any]] = []
    for i, g in enumerate(gloss):
        # Try typical variants; many lexicons use lowercase keys
        entry = lex.get(g.lower()) or lex.get(g) or lex.get(g.upper())
        if entry:
            dur_src = entry.get("dur_ms", 1000)
            dur = int(round(dur_src / max(rate, 0.01)))
            queue.append({
                "label": entry.get("label", g),
                "type": "clip",
                "asset": entry.get("asset"),
                "dur_ms": dur
            })
            if tween_ms and i < len(gloss) - 1:
                queue.append({"label": "_TWEEN", "type": "meta", "dur_ms": tween_ms})
        # silently skip words not in lexicon
    return queue

def write_jsonl(path: str, obj: Dict[str, Any]):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")

# ---------- main ----------
def main():
    ap = argparse.ArgumentParser(
        description="Tail clean transcript lines, map each word to UPPERCASE gloss, map via lexicons, and emit JSONL sign queues."
    )
    ap.add_argument("--source", required=True, help="clean transcript file (one sentence per line)")
    ap.add_argument("--lex", required=True, help="path to lexicons.json")
    ap.add_argument("--out", required=True, help="output JSONL path")
    ap.add_argument("--poll", type=float, default=0.2, help="tail polling interval (seconds)")
    ap.add_argument("--tween-ms", type=int, default=100, help="tween duration between clips")
    ap.add_argument("--sentence-pause-ms", type=int, default=250, help="pause after each sentence (also used for idle flush)")
    ap.add_argument("--rate", type=float, default=1.0, help="playback rate scaling (2.0 halves durations)")
    ap.add_argument("--from-start", action="store_true", help="process existing lines from file start (default tail-from-end)")
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    open(args.out, "a").close()  # touch output

    lex = load_lexicons(args.lex)

    print(f"[glossify] starting: source={args.source} out={args.out}")
    print(f"[glossify] poll={args.poll}s idle={args.sentence_pause_ms}ms rate={args.rate}")

    # avoid re-emitting identical consecutive lines
    recent_lines = deque(maxlen=8)

    try:
        for raw in follow_lines(
            args.source,
            poll=args.poll,
            idle_ms=args.sentence_pause_ms,
            from_start=args.from_start
        ):
            line = SPACE_RE.sub(" ", raw).strip()
            if not line:
                continue
            if recent_lines and line == recent_lines[-1]:
                continue
            recent_lines.append(line)

            gloss = sent_to_gloss(line)
            queue = map_gloss_to_queue(gloss, lex, tween_ms=args.tween_ms, rate=args.rate)

            obj = {
                "input": line,
                "gloss": gloss,
                "queue": queue,
                "sentence_pause_ms": args.sentence_pause_ms
            }
            write_jsonl(args.out, obj)
            print(f"[glossify] {line!r} -> {gloss} | {len(queue)} items")
    except KeyboardInterrupt:
        print("\n[glossify] stopped.", file=sys.stderr)

if __name__ == "__main__":
    main()
