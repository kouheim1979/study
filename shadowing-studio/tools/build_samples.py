#!/usr/bin/env python3
"""Build the bundled sample lessons (JSON + MP3) for Shadowing Studio.

Requires: festival, festvox-us-slt-hts (CMU ARCTIC "slt" HTS voice), ffmpeg.
  sudo apt-get install festival festvox-us-slt-hts ffmpeg
Run from anywhere:  python3 shadowing-studio/tools/build_samples.py

Each sentence is synthesized as a whole (natural prosody); Festival's word
timings are used to place chunk boundaries, so text, translation, words and
chunk playback positions all line up with the audio.
"""
import json, os, subprocess, sys, tempfile, wave, array

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "samples")
sys.path.insert(0, HERE)
from samples_content import LESSONS  # noqa: E402

LEAD = 0.35      # silence before the first sentence
GAP = 0.55       # silence between sentences
WORD_GAP = 0.45  # silence between vocabulary words
VOICE = "(voice_cmu_us_slt_arctic_hts)"
STRETCH = 1.06   # very slightly slower than default


def synth(texts, tmp):
    """Synthesize each text to tmp/NN.wav; return list of word timing lists."""
    lines = [VOICE, f"(Parameter.set 'Duration_Stretch {STRETCH})"]
    for i, t in enumerate(texts):
        assert '"' not in t and "\\" not in t
        wav = os.path.join(tmp, f"{i:03d}.wav")
        lines.append(f'(set! utt (SynthText "{t}"))')
        lines.append(f'(utt.save.wave utt "{wav}" \'riff)')
        lines.append(f'(format t "UTT\\t{i}\\n")')
        lines.append('(mapcar (lambda (w) (format t "W\\t%s\\t%s\\t%s\\n" (item.name w) '
                     '(item.feat w "R:SylStructure.daughter1.daughter1.segment_start") '
                     '(item.feat w "R:SylStructure.daughtern.daughtern.end"))) '
                     "(utt.relation.items utt 'Word))")
    scm = os.path.join(tmp, "run.scm")
    with open(scm, "w") as f:
        f.write("\n".join(lines) + "\n")
    out = subprocess.run(["festival", "-b", scm], capture_output=True, text=True, check=True).stdout
    words = [[] for _ in texts]
    cur = None
    for line in out.splitlines():
        p = line.split("\t")
        if p[0] == "UTT":
            cur = int(p[1])
        elif p[0] == "W":
            words[cur].append((p[1], float(p[2]), float(p[3])))
    return words


def read_wav(path):
    with wave.open(path) as w:
        assert w.getnchannels() == 1 and w.getsampwidth() == 2
        rate = w.getframerate()
        data = array.array("h", w.readframes(w.getnframes()))
    return rate, data


def silence(rate, sec):
    return array.array("h", [0] * int(round(rate * sec)))


def to_mp3(rate, pcm, dst, tmp):
    wav = os.path.join(tmp, "out.wav")
    with wave.open(wav, "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(rate)
        w.writeframes(pcm.tobytes())
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", wav, "-ar", "44100", "-ac", "1",
                    "-codec:a", "libmp3lame", "-b:a", "64k", "-af", "loudnorm=I=-18:TP=-2",
                    dst], check=True)


def r3(x):
    return round(x + 1e-9, 3)


def build_lesson(L):
    with tempfile.TemporaryDirectory() as tmp:
        texts = [" ".join(c[0] for c in s["chunks"]) for s in L["sentences"]]
        timings = synth(texts, tmp)
        rate = None
        pcm = array.array("h")
        chunks, sentences = [], []
        cid = 0
        for si, (s, words) in enumerate(zip(L["sentences"], timings)):
            r, data = read_wav(os.path.join(tmp, f"{si:03d}.wav"))
            if rate is None:
                rate = r
                pcm.extend(silence(rate, LEAD))
            offset = len(pcm) / rate
            sent_len = len(data) / rate
            toks = [c[0].split() for c in s["chunks"]]
            n = sum(len(t) for t in toks)
            if n != len(words):
                raise SystemExit(f"{L['id']} sentence {si}: {n} tokens vs {len(words)} words {words}")
            wi = 0
            bounds = []  # (first word start, last word end) per chunk
            for t in toks:
                ws = words[wi:wi + len(t)]
                bounds.append((ws[0][1], ws[-1][2]))
                wi += len(t)
            first_id = cid
            for ci, (c, (ws, we)) in enumerate(zip(s["chunks"], bounds)):
                if ci == 0:
                    start = max(0.0, ws - 0.12)
                else:
                    start = (bounds[ci - 1][1] + ws) / 2
                if ci == len(bounds) - 1:
                    end = min(sent_len, we + 0.18)
                else:
                    end = (we + bounds[ci + 1][0]) / 2
                chunks.append({
                    "id": f"c{cid + 1}", "start": r3(offset + start), "end": r3(offset + end),
                    "en": c[0], "ja": c[1], "note": c[2], "sentence": si,
                })
                cid += 1
            sentences.append({"en": texts[si], "ja": s["ja"],
                              "chunkIds": [f"c{k + 1}" for k in range(first_id, cid)]})
            pcm.extend(data)
            pcm.extend(silence(rate, GAP if si < len(L["sentences"]) - 1 else 0.6))
        duration = len(pcm) / rate
        audio_name = f"{L['id']}.mp3"
        to_mp3(rate, pcm, os.path.join(OUT, "audio", audio_name), tmp)

    # vocabulary audio
    with tempfile.TemporaryDirectory() as tmp:
        wl = [w[0] for w in L["words"]]
        wt = synth(wl, tmp)
        pcm = array.array("h")
        rate = None
        words = []
        for i, (w, tim) in enumerate(zip(L["words"], wt)):
            r, data = read_wav(os.path.join(tmp, f"{i:03d}.wav"))
            if rate is None:
                rate = r
                pcm.extend(silence(rate, 0.25))
            off = len(pcm) / rate
            s0 = max(0.0, tim[0][1] - 0.08)
            e0 = min(len(data) / rate, tim[-1][2] + 0.15)
            pcm.extend(data)
            pcm.extend(silence(rate, WORD_GAP))
            in_chunk = next((c["id"] for c in chunks
                             if w[0].lower() in [x.strip(",.?!").lower() for x in c["en"].split()]), None)
            words.append({"w": w[0], "ipa": w[1], "pos": w[2], "ja": w[3], "tip": w[4],
                          "start": r3(off + s0), "end": r3(off + e0), "chunkId": in_chunk})
        words_name = f"{L['id']}-words.mp3"
        to_mp3(rate, pcm, os.path.join(OUT, "audio", words_name), tmp)

    lesson = {
        "id": L["id"], "title": L["title"], "titleJa": L["titleJa"], "level": L["level"],
        "theme": L["theme"], "description": L["description"],
        "audio": f"samples/audio/{audio_name}", "wordsAudio": f"samples/audio/{words_name}",
        "duration": r3(duration), "chunks": chunks, "sentences": sentences, "words": words,
        "quiz": [{"q": q, "choices": c, "answer": a} for q, c, a in L["quiz"]],
        "source": {"type": "sample", "credit": "Shadowing Studio オリジナル教材。音声は CMU ARCTIC slt 音声（Festival HTS）による合成。",
                   "license": "CC BY 4.0（本文・訳・解説）／音声は合成音声（再配布可）"},
    }
    with open(os.path.join(OUT, f"{L['id']}.json"), "w", encoding="utf-8") as f:
        json.dump(lesson, f, ensure_ascii=False, indent=1)
    return lesson


def main():
    os.makedirs(os.path.join(OUT, "audio"), exist_ok=True)
    index = []
    for L in LESSONS:
        les = build_lesson(L)
        index.append({k: les[k] for k in ("id", "title", "titleJa", "level", "theme", "description", "duration")}
                     | {"file": f"samples/{les['id']}.json", "chunkCount": len(les["chunks"]),
                        "text": " ".join(s["en"] for s in les["sentences"])})
        print(f"built {les['id']}: {les['duration']:.1f}s, {len(les['chunks'])} chunks")
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"version": 1, "lessons": index}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
