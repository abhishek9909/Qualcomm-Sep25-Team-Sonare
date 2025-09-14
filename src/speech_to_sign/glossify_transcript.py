#!/usr/bin/env python3
import argparse, json, os, re, sys, time
from typing import List, Dict, Any

# ---------- optional spaCy pipeline ----------
USE_SPACY = True
try:
    import spacy
    from spacy.lang.en import English
except Exception:
    USE_SPACY = False
    spacy = None

WORD_RE = re.compile(r"[A-Za-z0-9']+")
APOSTROPHE_RE = re.compile(r"[’`]")
SPACE_RE = re.compile(r"\s+")

# Common mappings from spoken forms -> gloss keys (UPPERCASE).
# Add/modify as you wish.
CUSTOM_MAP = {
    "i'm": "I",
    "im": "I",
    "i": "I",
    "me": "I",
    "my": "MY",
    "mine": "MY",
    "you": "YOU",
    "your": "YOUR",
    "yours": "YOUR",
    "he": "HE",
    "she": "SHE",
    "it": "IT",
    "we": "WE",
    "they": "THEY",
    "am": "BE",
    "is": "BE",
    "are": "BE",
    "was": "BE",
    "were": "BE",
    "hello": "HELLO",
    "hi": "HI",
    "how": "HOW",
    "good": "GOOD",
    "morning": "MORNING",
    "afternoon": "AFTERNOON",
    "evening": "EVENING",
    "do": "DO",
    "doing": "DO",
    "today": "TODAY",
    "what": "WHAT",
    "why": "WHY",
    "where": "WHERE",
    "when": "WHEN",
    "which": "WHICH",
    "please": "PLEASE",
    "thanks": "THANK-YOU",
    "thank": "THANK-YOU",
    "yes": "YES",
    "no": "NO",
    # add more domain words as needed
}

# POS tags we usually keep in gloss (content words)
KEEP_POS = {"NOUN", "PROPN", "VERB", "AUX", "ADJ", "ADV", "INTJ", "PRON", "NUM"}

def load_lexicons(path: str) -> Dict[str, Dict[str, Any]]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def normalize_token(tok: str) -> str:
    tok = tok.lower()
    tok = APOSTROPHE_RE.sub("'", tok)
    return tok

def basic_lemma(tok: str) -> str:
    # super-light lemmatizer: strip simple endings
    # used only if spaCy unavailable
    if tok.endswith("'s"):
        tok = tok[:-2]
    for suf in ("ing", "ed", "es", "s"):
        if tok.endswith(suf) and len(tok) > len(suf) + 1:
            return tok[: -len(suf)]
    return tok

def spacy_pipeline():
    # small english model if available, else blank
    try:
        return spacy.load("en_core_web_sm", disable=["ner"])
    except Exception:
        # blank English with tagger/lemmatizer if present
        nlp = English()
        if "lemmatizer" not in nlp.pipe_names:
            try:
                # try to add lookups-based lemmatizer if installed
                from spacy.lemmatizer import Lemmatizer  # legacy
            except Exception:
                pass
        # we can still use tokenizer-only fallback
        return nlp

def sent_to_gloss_spacy(nlp, text: str) -> List[str]:
    doc = nlp(text)
    glosses: List[str] = []
    for tok in doc:
        if tok.is_space: 
            continue
        s = normalize_token(tok.text)
        # prefer CUSTOM_MAP
        if s in CUSTOM_MAP:
            glosses.append(CUSTOM_MAP[s])
            continue
        # keep contenty tokens (fallback if no tagger)
        pos_ok = (tok.pos_ in KEEP_POS) if tok.pos_ else True
        if not pos_ok:
            continue
        lemma = tok.lemma_.lower() if tok.lemma_ else s
        lemma = CUSTOM_MAP.get(lemma, lemma.upper())
        glosses.append(lemma.upper())
    # compress duplicates in a row (HELLO HELLO -> HELLO)
    dedup: List[str] = []
    for g in glosses:
        if not dedup or dedup[-1] != g:
            dedup.append(g)
    return dedup

def sent_to_gloss_basic(text: str) -> List[str]:
    toks = [normalize_token(t) for t in WORD_RE.findall(text)]
    glosses: List[str] = []
    for t in toks:
        if t in CUSTOM_MAP:
            glosses.append(CUSTOM_MAP[t])
            continue
        lem = basic_lemma(t).upper()
        glosses.append(lem)
    # simple stopword-ish filter
    DROP = {"THE","A","AN","OF","TO","IN","ON","AT","FOR","AND","OR","BUT","WITH","BE"}
    glosses = [g for g in glosses if g not in DROP]
    dedup: List[str] = []
    for g in glosses:
        if not dedup or dedup[-1] != g:
            dedup.append(g)
    return dedup

def follow_lines(path: str, poll: float):
    """Tail a file and yield lines as they are appended (handles partial lines)."""
    open(path, "a").close()
    with open(path, "r", encoding="utf-8", errors="ignore") as f:
        # process existing lines first
        pending = f.read()
        if pending:
            for line in pending.splitlines():
                yield line
        # now tail
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

def map_gloss_to_queue(gloss: List[str], lex: Dict[str, Dict[str, Any]],
                       tween_ms: int, rate: float) -> List[Dict[str, Any]]:
    queue: List[Dict[str, Any]] = []
    for i, g in enumerate(gloss):
        key = g.lower()  # your lexicons.json keys look lowercase in your example
        entry = lex.get(key)
        if not entry:
            # try direct uppercase key or stripped variants
            entry = lex.get(g) or lex.get(g.lower())
        if entry:
            dur = int(round(entry.get("dur_ms", 1000) / max(rate, 0.01)))
            queue.append({
                "label": entry.get("label", g),
                "type": "clip",
                "asset": entry.get("asset"),
                "dur_ms": dur
            })
            if tween_ms and i < len(gloss) - 1:
                queue.append({"label": "_TWEEN", "type": "meta", "dur_ms": tween_ms})
        # silently skip OOV tokens
    return queue

def write_jsonl(path: str, obj: Dict[str, Any]):
    with open(path, "a", encoding="utf-8") as f:
        f.write(json.dumps(obj, ensure_ascii=False) + "\n")

def main():
    ap = argparse.ArgumentParser(description="Tail clean transcript, gloss with spaCy (or fallback), and emit sign queues.")
    ap.add_argument("--source", required=True, help="clean transcript file (one complete sentence per line)")
    ap.add_argument("--lex", required=True, help="path to lexicons.json")
    ap.add_argument("--out", required=True, help="output JSONL path for sign queues")
    ap.add_argument("--poll", type=float, default=0.3, help="polling interval (s)")
    ap.add_argument("--tween-ms", type=int, default=100, help="meta tween duration between clips")
    ap.add_argument("--sentence-pause-ms", type=int, default=250, help="pause after each sentence")
    ap.add_argument("--rate", type=float, default=1.0, help="playback rate scaling (e.g., 2.0 => halve durations)")
    ap.add_argument("--no-spacy", action="store_true", help="force rule-based fallback (ignore spaCy)")
    args = ap.parse_args()

    lex = load_lexicons(args.lex)

    use_spacy = USE_SPACY and not args.no_spacy
    nlp = spacy_pipeline() if use_spacy else None
    if use_spacy and nlp is None:
        use_spacy = False

    print("[glossify] starting. spaCy:", "on" if use_spacy else "off (fallback)")

    # keep a small cache to avoid re-emitting the exact same sentence back-to-back
    last_line = None

    try:
        for line in follow_lines(args.source, args.poll):
            line = SPACE_RE.sub(" ", line).strip()
            if not line:
                continue
            if line == last_line:
                continue
            last_line = line

            gloss = sent_to_gloss_spacy(nlp, line) if use_spacy else sent_to_gloss_basic(line)
            queue = map_gloss_to_queue(gloss, lex, tween_ms=args.tween_ms, rate=args.rate)

            obj = {
                "input": line,
                "gloss": gloss,
                "queue": queue,
                "sentence_pause_ms": args.sentence_pause_ms
            }
            write_jsonl(args.out, obj)
            print(f"[glossify] {line} -> {gloss} ({len(queue)} items)")
    except KeyboardInterrupt:
        print("\n[glossify] stopped.", file=sys.stderr)

if __name__ == "__main__":
    main()
