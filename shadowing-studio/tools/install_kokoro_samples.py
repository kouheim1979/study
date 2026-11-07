#!/usr/bin/env python3
"""Install the exact 50 Kokoro MP3 stems into Shadowing Studio.

Create continuous lesson/word tracks for the existing player, preserving all
original sentence/chunk/word IDs. Chunk boundaries are *model-derived estimates*
from Kokoro token durations, never claimed to be exact forced alignment.
Run after shadowing/generate_shadowing_kokoro.py in the repo root.
"""
import json
import re
import subprocess
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
REPO = ROOT.parent
AUDIO = ROOT / "samples" / "audio"
SRC = REPO / "shadowing_kokoro_out" / "mp3"
SAMPLE = ROOT / "samples"
FRAME_RATE = 44100
VOICE = "af_heart"

def letters(s):
    return re.sub(r"[^a-z]", "", s.lower())

def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)

def decode(path):
    result = subprocess.check_output([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-i", str(path),
        "-f", "f32le", "-acodec", "pcm_f32le", "-ar", str(FRAME_RATE), "-ac", "1", "-"
    ])
    audio = np.frombuffer(result, dtype=np.float32)
    if len(audio) < FRAME_RATE // 8 or not np.isfinite(audio).all():
        raise ValueError(f"Bad decoded audio: {path}")
    return audio

def write_mp3(path, pieces):
    audio = np.concatenate(pieces).astype(np.float32)
    run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-f", "f32le", "-ar", str(FRAME_RATE), "-ac", "1", "-i", "-",
        "-c:a", "libmp3lame", "-b:a", "96k", "-ar", str(FRAME_RATE),
        "-ac", "1", "-write_xing", "0", str(path)
    ], input=audio.tobytes())
    duration = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(path)
    ])
    return float(duration.strip())

def silence(seconds):
    return np.zeros(round(FRAME_RATE*seconds), dtype=np.float32)

def spans_to_chunk_cuts(item, length):
    """Estimate boundaries only from actual Kokoro predicted token spans."""
    spans = [x for x in item["token_spans"] if letters(x["text"])]
    actual = "".join(letters(x["text"]) for x in spans)
    expected = letters(item["text"])
    if actual != expected:
        raise ValueError(f"Token transcript mismatch for {item['filename']}: {actual!r} != {expected!r}")
    boundaries = []
    running = 0
    tokens_by_end = {}
    for i, token in enumerate(spans):
        running += len(letters(token["text"]))
        tokens_by_end[running] = i
    for j in range(1, len(item["chunks"])):
        cut = len(letters(" ".join(item["chunks"][:j])))
        if cut not in tokens_by_end:
            raise ValueError(f"No token boundary at chunk {j} of {item['filename']}")
        idx = tokens_by_end[cut]
        if idx + 1 >= len(spans):
            raise ValueError(f"Missing next token for {item['filename']}")
        # Middle between the last word and the next (overlapping/coarticulated
        # speech is expected, so this remains an approximate boundary).
        left, right = spans[idx], spans[idx+1]
        boundary = .5 * (float(left["end"])+float(right["start"]))
        boundaries.append(max(0.015, min(length-.015, boundary)))
    if boundaries != sorted(boundaries):
        raise ValueError(f"Non-monotonic chunk cuts: {item['filename']}")
    return [0.0, *boundaries, length]

def check_lesson(lesson):
    cs = lesson["chunks"]
    if any(c["start"] < 0 or c["end"] <= c["start"] or c["end"] > lesson["duration"] for c in cs):
        raise ValueError(f"Invalid chunk time in {lesson['id']}")
    for a,b in zip(cs,cs[1:]):
        if b["start"] < a["start"] or a["end"] > b["start"] + .06:
            raise ValueError(f"Overlapping chunk times in {lesson['id']}")
    ws=lesson["words"]
    if any(w["end"] <= w["start"] or w["start"] < 0 for w in ws):
        raise ValueError(f"Invalid word time in {lesson['id']}")

def main():
    source_manifest = json.loads((SRC / "manifest.json").read_text(encoding="utf-8"))
    items = source_manifest["items"]
    assert len(items) == 50
    by_file = {x["filename"]: x for x in items}
    assert len(by_file)==50
    AUDIO.mkdir(exist_ok=True, parents=True)

    # Keep exact 23 sentence files + 27 word files available as user requested.
    for name in by_file:
        (AUDIO / name).write_bytes((SRC / name).read_bytes())

    index_path = SAMPLE / "index.json"
    index = json.loads(index_path.read_text(encoding="utf-8"))
    derived = {"model": "Kokoro-82M", "voice": VOICE,
               "chunk_timings": "Kokoro predicted token durations; approximate; not manually verified",
               "lessons": {}}
    for meta in index["lessons"]:
        sid=meta["id"]
        path=SAMPLE / (sid+".json")
        lesson=json.loads(path.read_text(encoding="utf-8"))
        chunks=lesson["chunks"]
        expected_sents=lesson["sentences"]
        parts=[silence(.08)]
        offset=len(parts[0])/FRAME_RATE
        c_out=[]
        chunk_by_id={c["id"]: c for c in chunks}
        measured=[]
        for si,sent in enumerate(expected_sents):
            name=f"{sid}_{si+1:02d}.mp3"
            item=by_file[name]
            if item["type"] != "sentence" or letters(item["text"]) != letters(sent["en"]):
                raise ValueError(f"Sentence text mismatch: {name}")
            audio=decode(AUDIO/name)
            length=len(audio)/FRAME_RATE
            phrase_chunks=[chunk_by_id[cid] for cid in sent["chunkIds"]]
            if [letters(c["en"]) for c in phrase_chunks] != [letters(x) for x in item["chunks"]]:
                raise ValueError(f"Chunk texts mismatch: {name}")
            cuts=spans_to_chunk_cuts(item,length)
            assert len(cuts)==len(phrase_chunks)+1
            for old, start, end in zip(phrase_chunks,cuts,cuts[1:]):
                old["start"]=round(offset+start, 3)
                old["end"]=round(offset+end, 3)
                c_out.append(old)
            measured.append({"file":name,"duration":round(length,3),
                             "sentence_start":round(offset,3),
                             "estimated_chunk_bounds": [round(x+offset,3) for x in cuts]})
            parts.append(audio)
            offset+=length
            # Audible separation between sentences for text reading.
            parts.append(silence(.38))
            offset+=.38
        if [c["id"] for c in chunks] != [c["id"] for c in c_out]:
            raise ValueError(f"Changed chunk IDs/order: {sid}")
        lesson["duration"]=round(write_mp3(AUDIO / (sid+".mp3"),parts),3)
        meta["duration"]=lesson["duration"]

        # Word practice player uses one continuous audio file with measured
        # exact per-word *file* segment boundaries, not inferred word lengths.
        word_parts=[silence(.08)]
        woff=.08
        for w in lesson["words"]:
            name=f"{sid}_w_{w['w']}.mp3"
            item=by_file[name]
            if item["type"] != "word" or item["text"] != w["w"]:
                raise ValueError(f"Word mismatch: {name}")
            audio=decode(AUDIO/name)
            length=len(audio)/FRAME_RATE
            w["start"]=round(woff,3)
            w["end"]=round(woff+length,3)
            word_parts.append(audio)
            word_parts.append(silence(.35))
            woff+=length+.35
        write_mp3(AUDIO / (sid+"-words.mp3"),word_parts)

        lesson["source"]={
            "type":"sample",
            "credit":"Shadowing Studio original lesson; AI voice: Kokoro-82M, af_heart (American English)",
            "license":"Text CC BY 4.0; Kokoro-82M model Apache 2.0"
        }
        lesson["timingMethod"]="kokoro_predicted_token_durations_approximate"
        check_lesson(lesson)
        path.write_text(json.dumps(lesson,ensure_ascii=False,indent=2)+"\n", encoding="utf-8")
        derived["lessons"][sid] = measured
        print(f"Integrated {sid}: {len(expected_sents)} sentences, {len(lesson['words'])} words, "
              f"{len(chunks)} phrase chunks, total {lesson['duration']:.2f}s", flush=True)

    index["version"]=2
    index_path.write_text(json.dumps(index,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    (SAMPLE / "kokoro-alignment.json").write_text(
        json.dumps(derived,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    # Force the installed PWA to discard the former cached synthetic voice.
    sw=ROOT/"sw.js"
    content=sw.read_text(encoding="utf-8")
    content=re.sub(r"const VERSION = '[^']+';", "const VERSION = 'ss-v2-kokoro';", content)
    # Pre-cache 50 stems for offline use as well as continuous 8 track files.
    marker='"\u0073amples/audio/s04-daily-walk-words.mp3"'
    if marker not in content:
        raise ValueError("Unexpected service-worker cache list")
    paths=[f'"samples/audio/{name}"' for name in sorted(by_file)]
    content=content.replace(marker, marker+",\n "+",\n ".join(paths))
    sw.write_text(content,encoding="utf-8")
    assert len(list(AUDIO.glob("*_w_*.mp3")))==27
    assert len(list(AUDIO.glob("s??-*_??.mp3")))==23
    print("Integrated full 50 stems + 8 continuous tracks and refreshed offline cache.",flush=True)

if __name__=="__main__":
    main()
