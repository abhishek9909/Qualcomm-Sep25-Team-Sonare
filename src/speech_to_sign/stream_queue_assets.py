#!/usr/bin/env python3
import argparse, json, os, sys, time

def follow_lines(path: str, poll: float, idle_ms: int = 0, from_start: bool = True):
    """
    Tail a file and yield lines as they are appended.
    - Survives overwrite/truncate (log rotation).
    - Yields complete lines immediately (newline boundary).
    - If idle_ms > 0, flushes a partial line after a brief pause.
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
                # emit full lines immediately
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    yield line
            else:
                # optional: emit partial line on pause
                if idle and buf and (time.time() - last) >= idle:
                    line, buf = buf, ""
                    yield line
                    last = time.time()
                time.sleep(poll)

            # detect rotation/truncate
            try:
                st = os.stat(path)
            except FileNotFoundError:
                time.sleep(poll); continue
            rotated = (st.st_ino != ino)
            truncated = (st.st_size < pos)
            if rotated or truncated:
                try: f.close()
                except: pass
                f, ino, pos = _open()
    finally:
        try: f.close()
        except: pass

def process_line(line: str, last_label_box: list):
    """
    Parse one JSONL line and return a list of asset paths (strings),
    skipping non-clip items and collapsing adjacent duplicate labels
    across lines (using last_label_box[0] as the previous label).
    """
    line = line.strip()
    if not line:
        return []
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
        # ignore malformed JSON lines
        return []
    queue = obj.get("queue", [])
    out_assets = []
    for item in queue:
        if item.get("type") != "clip":
            continue
        label = item.get("label")
        asset = item.get("asset")
        if not asset:
            continue
        if label and label == last_label_box[0]:
            # collapse adjacent duplicates across sentence boundaries
            continue
        out_assets.append(asset)
        last_label_box[0] = label
    return out_assets

def main():
    ap = argparse.ArgumentParser(description="Tail sign_queue.jsonl and stream assets to an output file with adjacent dedupe.")
    ap.add_argument("--source", required=True, help="Path to sign_queue.jsonl")
    ap.add_argument("--out", required=True, help="Path to final_queue.txt (assets appended one per line)")
    ap.add_argument("--poll", type=float, default=0.15, help="Polling interval seconds (default: 0.15)")
    ap.add_argument("--idle-ms", type=int, default=0, help="Flush partial JSONL line after this pause (0=off)")
    ap.add_argument("--from-start", action="store_true", help="Process existing lines from start (default: tail from end)")
    args = ap.parse_args()

    os.makedirs(os.path.dirname(args.out) or ".", exist_ok=True)
    open(args.out, "a").close()  # touch output

    last_label_box = [None]

    try:
        for line in follow_lines(args.source, poll=args.poll, idle_ms=args.idle_ms, from_start=args.from_start):
            assets = process_line(line, last_label_box)
            if not assets:
                continue
            with open(args.out, "a", encoding="utf-8") as f:
                for a in assets:
                    f.write(a + "\n")
            for a in assets:
                print(a, flush=True)  # also echo to stdout
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
