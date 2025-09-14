#!/usr/bin/env python3
import argparse, json, os, sys, time

def follow_lines(path: str, poll: float):
    open(path, "a").close()
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        # emit existing lines first
        pending = f.read()
        if pending:
            for line in pending.splitlines():
                yield line
        # then tail
        buf = ""
        while True:
            chunk = f.read()
            if chunk:
                buf += chunk
                while "\n" in buf:
                    line, buf = buf.split("\n", 1)
                    yield line
            else:
                time.sleep(poll)

def process_line(line: str, last_label: list):
    """Return list of assets (strings) with adjacent dedupe."""
    line = line.strip()
    if not line:
        return []
    try:
        obj = json.loads(line)
    except json.JSONDecodeError:
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
        # collapse adjacent duplicates (across sentences too)
        prev = last_label[0]
        if label and label == prev:
            continue
        out_assets.append(asset)
        last_label[0] = label
    return out_assets

def main():
    ap = argparse.ArgumentParser(description="Stream-only video links from sign_queue.jsonl with adjacent dedupe.")
    ap.add_argument("--source", required=True, help="path to sign_queue.jsonl")
    ap.add_argument("--out", help="optional file to append asset URLs/paths (one per line)")
    ap.add_argument("--poll", type=float, default=0.25, help="polling interval seconds (default 0.25)")
    args = ap.parse_args()

    last_label = [None]

    if args.out:
        open(args.out, "a").close()

    try:
        for line in follow_lines(args.source, args.poll):
            assets = process_line(line, last_label)
            if not assets:
                continue
            if args.out:
                with open(args.out, "a", encoding="utf-8") as f:
                    for a in assets:
                        f.write(a + "\n")
                # also echo to stdout for visibility
                for a in assets:
                    print(a, flush=True)
            else:
                for a in assets:
                    print(a, flush=True)
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()
