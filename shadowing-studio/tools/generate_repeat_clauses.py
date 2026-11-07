#!/usr/bin/env python3
"""Generate entirely NEW Kokoro recordings, one complete clause per synthesis.

Step 4 uses its own concatenated audio track with exact measured PCM offsets.
No cutting, Rubber Band stretching, or token-estimated timestamps from the old
full-sentence shadowing recording. Steps 1/2/3/5/6 remain unchanged.
Run from the repository root with ffmpeg, numpy, soundfile and kokoro installed.
"""
import json
import re
import subprocess
import zipfile
from pathlib import Path

import numpy as np
from kokoro import KPipeline

BASE = Path("shadowing-studio")
SAMPLES = BASE / "samples"
AUDIO = SAMPLES / "audio"
STEMS = AUDIO / "repeat"
OUTPUT = Path("shadowing_kokoro_repeat_out")
VOICE = "af_heart"
SAMPLE_RATE = 24000
LEADING_SILENCE = .12
BETWEEN_SILENCE = .24
TRAILING_SILENCE = .22
# Speech is already slow at generation time. Displayed 1.0x uses 1.08x playback.
NATIVE_SPEED = {"A1": .58, "A2": .62, "B1": .71}
APP_BASE_RATE = 1.08

def alphabet(text):
    return re.sub(r"[^a-z0-9]", "", text.lower())

def encode_mp3(raw, filename):
    """Encode original Kokoro PCM; do not apply tempo stretching or segment slicing."""
    filename.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
        "-f", "f32le", "-ar", str(SAMPLE_RATE), "-ac", "1", "-i", "-",
        "-c:a", "libmp3lame", "-b:a", "128k", "-ar", "44100",
        "-ac", "1", "-write_xing", "0", str(filename)
    ], input=np.asarray(raw, dtype=np.float32).tobytes(), check=True)
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1", str(filename)
    ], text=True)
    result = float(out.strip())
    if result < .3:
        raise ValueError(f"Unusable MP3 generated: {filename}")
    return result

def trim_safely(raw):
    """Remove only genuine digital silence, keeping soft initial/final consonants."""
    hop = SAMPLE_RATE // 100
    envelope = np.array([
        float(np.sqrt(np.mean(raw[n:n+hop] ** 2)))
        for n in range(0, len(raw), hop)
    ])
    if not len(envelope):
        raise ValueError("Generated empty audio")
    threshold = max(.00045, float(np.max(envelope)) * .006)
    active = np.flatnonzero(envelope > threshold)
    if not len(active):
        raise ValueError("No audible speech found")
    lo = max(0, int(active[0] * hop - SAMPLE_RATE * .07))
    hi = min(len(raw), int((active[-1]+1) * hop + SAMPLE_RATE * .12))
    return np.asarray(raw[lo:hi], dtype=np.float32)

def speak(pipeline, text, level):
    # A comma at a standalone mid-sentence clause edge gives a natural breath;
    # it does not become a spoken word or appear in the learner's transcript.
    prompt = text if re.search(r"[,.!?;:]$", text) else text + ","
    waveforms = [
        np.asarray(x.audio, dtype=np.float32).reshape(-1)
        for x in pipeline(prompt, voice=VOICE, speed=NATIVE_SPEED[level],
                          split_pattern=r"\n+")
    ]
    if not waveforms:
        raise RuntimeError("Synthesis returned no audio: " + text)
    audio = np.concatenate(waveforms)
    if not np.all(np.isfinite(audio)):
        raise RuntimeError("Invalid PCM returned: " + text)
    audio = trim_safely(audio)
    secs = len(audio) / SAMPLE_RATE
    if secs > 11:
        raise ValueError(f"Overlong repeat unit ({secs:.1f}s): {text}")
    return audio

def silence(seconds):
    return np.zeros(round(SAMPLE_RATE * seconds), dtype=np.float32)

def make_units(lesson, parts):
    by_id = {c["id"]: c for c in lesson["chunks"]}
    if len(parts) != len(lesson["sentences"]):
        raise ValueError(f"Wrong sentence count in {lesson['id']}")
    units = []
    for si, group_list in enumerate(parts):
        sentence = lesson["sentences"][si]
        if not group_list or any(not group for group in group_list):
            raise ValueError("Empty repeating clause")
        ids = [cid for group in group_list for cid in group]
        if ids != sentence["chunkIds"]:
            raise ValueError(f"Clause IDs missing or out of sequence: {lesson['id']} {si+1}: {ids}")
        for pi, group in enumerate(group_list):
            chunks = [by_id[cid] for cid in group]
            phrase = " ".join(c["en"] for c in chunks)
            ja = "／".join(c["ja"] for c in chunks if c.get("ja"))
            if not phrase.strip():
                raise ValueError("Blank clause")
            units.append({
                "sentenceIndex": si, "part": pi+1, "partCount": len(group_list),
                "chunkIds": group, "en": phrase, "ja": ja
            })
        if alphabet(" ".join(by_id[cid]["en"] for cid in ids)) != alphabet(sentence["en"]):
            raise ValueError(f"English transcript mismatch: {lesson['id']} sentence {si+1}")
    return units

def main():
    groups = json.loads((SAMPLES / "repeat-clauses.json").read_text(encoding="utf-8"))
    if groups["schemaVersion"] != 1 or len(groups["lessons"]) != 4:
        raise ValueError("Repeat clause manifest must contain all four lessons")
    STEMS.mkdir(parents=True, exist_ok=True)
    OUTPUT.mkdir(parents=True, exist_ok=True)
    pipeline = KPipeline(lang_code="a")
    index = json.loads((SAMPLES / "index.json").read_text(encoding="utf-8"))
    if {x["id"] for x in index["lessons"]} != set(groups["lessons"]):
        raise ValueError("Repeat track manifest does not cover all sample lessons")
    all_units = []
    totals = {}
    for meta in index["lessons"]:
        sid = meta["id"]
        filename = SAMPLES / f"{sid}.json"
        lesson = json.loads(filename.read_text(encoding="utf-8"))
        level = lesson["level"]
        units = make_units(lesson, groups["lessons"][sid])
        pieces = [silence(LEADING_SILENCE)]
        offset = len(pieces[0]) / SAMPLE_RATE
        for unit in units:
            part = unit["part"]
            sentence = unit["sentenceIndex"] + 1
            stem_name = f"{sid}-s{sentence:02d}-p{part:02d}.mp3"
            speech = speak(pipeline, unit["en"], level)
            stem_duration = encode_mp3(speech, STEMS / stem_name)
            unit["audioStem"] = f"samples/audio/repeat/{stem_name}"
            unit["start"] = round(offset, 5)
            unit["end"] = round(offset + len(speech) / SAMPLE_RATE, 5)
            unit["duration"] = round(len(speech) / SAMPLE_RATE, 5)
            unit["stemDuration"] = round(stem_duration, 3)
            pieces.extend((speech, silence(BETWEEN_SILENCE)))
            offset += len(speech) / SAMPLE_RATE + BETWEEN_SILENCE
            all_units.append({"lesson": sid, **unit})
            print(f"{sid}: {sentence}-{part} [{unit['duration']:.2f}s] {unit['en']}", flush=True)
        pieces.append(silence(TRAILING_SILENCE))
        track = AUDIO / f"{sid}-repeat.mp3"
        total = encode_mp3(np.concatenate(pieces), track)
        if total < offset or abs(total - (offset+TRAILING_SILENCE)) > .20:
            raise ValueError(f"Unexpected MP3 length: {track} {total} vs {offset}")
        lesson["repeatAudio"] = f"samples/audio/{sid}-repeat.mp3"
        lesson["repeatAudioDuration"] = round(total, 4)
        lesson["repeatAudioGeneration"] = "independent_kokoro_clause_synthesis_v1_no_audio_cropping"
        lesson["repeatUnits"] = units
        filename.write_text(json.dumps(lesson, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        totals[sid] = {"clauses": len(units), "seconds": total}
    if len(all_units) != 45:
        raise ValueError(f"Expected 45 newly synthesized clauses, got {len(all_units)}")
    manifest = {
        "engine": "Kokoro-82M", "voice": VOICE,
        "method": "fresh_independent_clause_synthesis_not_existing_audio_extraction",
        "tempo_stretching": False, "crop_existing_audio": False,
        "nativeSpeedByLevel": NATIVE_SPEED, "appOneXRate": APP_BASE_RATE,
        "offsetBasis": "precise_PCM_sample_counts_not_token_predictions",
        "total": len(all_units), "tracks": totals, "items": all_units
    }
    (OUTPUT / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    with zipfile.ZipFile(OUTPUT / "shadowing-repeat-45clauses.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.write(OUTPUT/"manifest.json", "manifest.json")
        for sid in groups["lessons"]:
            z.write(AUDIO / f"{sid}-repeat.mp3", f"{sid}-repeat.mp3")
        for path in sorted(STEMS.glob("*.mp3")):
            z.write(path, f"clauses/{path.name}")
    print("COMPLETE", json.dumps(totals), flush=True)

if __name__ == "__main__":
    main()
