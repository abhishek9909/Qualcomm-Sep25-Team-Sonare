#!/usr/bin/env python3
import argparse, os, re, sys, time
from collections import deque

# --- regex rules ---
PAREN_RE   = re.compile(r"\([^)]*\)")
BRACKET_RE = re.compile(r"\[[^\]]*\]")
SPACE_RE   = re.compile(r"\s+")
END_RE     = re.compile(r"[.!?]")

def clean_text(s: str) -> str:
    s = PAREN_RE.sub(" ", s)
    s = BRACKET_RE.sub(" ", s)
    s = SPACE_RE.sub(" ", s)
    return s.strip()

def follow_file(path: str, poll: float, from_start: bool):
    """Yield newly written text; survives truncate/overwrite."""
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
    try:
        while True:
            chunk = f.read()
            if chunk:
                pos += len(chunk)
                yield chunk
            else:
                time.sleep(poll)
            # detect rotation/truncate
            try:
                st = os.stat(path)
            except FileNotFoundError:
                time.sleep(poll); continue
            if st.st_ino != ino or st.st_size < pos:
                try: f.close()
                except: pass
                f, ino, pos = _open()
    finally:
        try: f.close()
        except: pass

def process_stream(source_path: str, out_path: str, poll: float, idle_ms: int, from_start: bool):
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    open(out_path, "a").close()

    recent = deque(maxlen=64)  # dedupe window
    buf = ""
    last_activity = time.time()
    idle_sec = idle_ms / 1000.0

    def emit(raw: str):
        s = clean_text(raw)
        if not s:
            return
        key = s.lower()
        if key in recent:
            return
        with open(out_path, "a", encoding="utf-8") as out:
            out.write(s + "\n")
            out.flush()
        recent.append(key)
        print(f"[clean] {s}", flush=True)

    def drain_newlines():
        nonlocal buf
        flushed = False
        while "\n" in buf:
            line, buf = buf.split("\n", 1)
            if line.strip():
                emit(line)
                flushed = True
        return flushed

    def drain_punct():
        nonlocal buf
        flushed = False
        while True:
            m = END_RE.search(buf)
            if not m:
                break
            end = m.end()
            sent, buf = buf[:end], buf[end:]
            emit(sent)
            flushed = True
        return flushed

    try:
        for chunk in follow_file(source_path, poll=poll, from_start=from_start):
            buf += chunk
            last_activity = time.time()

            drained = drain_newlines() or drain_punct()

            # idle flush for leftover fragment
            now = time.time()
            if (now - last_activity) >= idle_sec and buf.strip():
                frag, buf = buf.strip(), ""
                emit(frag)
                last_activity = now

            if len(buf) > 16384:
                buf = buf[-8192:]

            time.sleep(min(poll, 0.05))
    except KeyboardInterrupt:
        print("\n[clean] Stopped.", file=sys.stderr)

def main():
    ap = argparse.ArgumentParser(
        description="Clean a live transcript and write one line per input line (newline, punctuation, or pause)."
    )
    ap.add_argument("--source", required=True, help="Path to live transcript")
    ap.add_argument("--out", required=True, help="Path to cleaned transcript")
    ap.add_argument("--poll", type=float, default=0.1, help="Polling interval seconds")
    ap.add_argument("--idle-ms", type=int, default=350, help="Debounce ms for idle flush")
    ap.add_argument("--from-start", action="store_true", help="Process existing file from start")
    args = ap.parse_args()

    process_stream(
        source_path=args.source,
        out_path=args.out,
        poll=args.poll,
        idle_ms=args.idle_ms,
        from_start=args.from_start,
    )

if __name__ == "__main__":
    main()
