#!/usr/bin/env python3
import argparse
import os
import re
import sys
import time

PAREN_RE   = re.compile(r"\([^)]*\)")     # ( ... )
BRACKET_RE = re.compile(r"\[[^\]]*\]")    # [ ... ]
SPACE_RE   = re.compile(r"\s+")
# earliest sentence end; we’ll consume one sentence at a time as soon as we see . ? !
END_RE     = re.compile(r"[.!?]")

def clean_text(s: str) -> str:
    # remove parenthetical / bracketed asides and collapse whitespace
    s = PAREN_RE.sub(" ", s)
    s = BRACKET_RE.sub(" ", s)
    s = SPACE_RE.sub(" ", s)
    return s.strip(" \t\r\n")

def follow_file(path: str, poll: float):
    """
    Generator yielding newly appended text from a file (like `tail -f`).
    Starts at current end if file exists; creates file if missing.
    """
    # ensure file exists
    open(path, "a").close()
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        f.seek(0, os.SEEK_END)  # start tailing from current end
        buf = ""
        while True:
            chunk = f.read()
            if chunk:
                buf += chunk
                yield buf
                buf = ""  # hand off everything we just saw
            else:
                time.sleep(poll)

def process_stream(source_path: str, out_path: str, poll: float):
    # track sentences we’ve already emitted (case-insensitive) to avoid duplicates
    seen = set()

    # also process any existing content from the start once, so you don’t miss early lines
    with open(source_path, "r", encoding="utf-8", errors="ignore") as f:
        initial = f.read()
    buffer = initial

    def flush_sentence(raw_sentence: str):
        s = clean_text(raw_sentence)
        key = s.lower()
        if not s:
            return
        if key in seen:
            return
        with open(out_path, "a", encoding="utf-8") as out:
            out.write(s + "\n")
            out.flush()
        seen.add(key)
        # optional: also show in stdout for quick feedback
        print(s, flush=True)

    # helper to pull complete sentences from buffer
    def drain_complete_sentences():
        nonlocal buffer
        while True:
            m = END_RE.search(buffer)
            if not m:
                break
            end_idx = m.end()  # include the terminator
            sent = buffer[:end_idx]
            buffer = buffer[end_idx:]  # keep remainder for later
            flush_sentence(sent)

        # keep buffer small by trimming runaway whitespace
        if len(buffer) > 10000:
            buffer = buffer[-5000:]

    # process any existing content first
    drain_complete_sentences()

    # now tail the file continuously
    try:
        for newly_appended in follow_file(source_path, poll=poll):
            buffer += newly_appended
            drain_complete_sentences()
    except KeyboardInterrupt:
        print("\nstopped.", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(
        description="Continuously clean a whisper.cpp transcript by removing () and [] segments and writing complete sentences to an output file."
    )
    parser.add_argument("--source", required=True, help="Path to the live transcript file produced by whisper.cpp")
    parser.add_argument("--out", required=True, help="Path to append clean sentences into")
    parser.add_argument("--poll", type=float, default=0.5, help="Polling interval in seconds (default: 0.5)")
    args = parser.parse_args()

    # touch output so it exists
    open(args.out, "a").close()

    process_stream(args.source, args.out, args.poll)

if __name__ == "__main__":
    main()
