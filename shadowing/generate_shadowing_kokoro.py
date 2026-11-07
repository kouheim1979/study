#!/usr/bin/env python3
"""50-file shadowing audio generator, Kokoro-82M, US English."""
import csv
import json
import subprocess
import tempfile
import zipfile
from pathlib import Path
import numpy as np
import soundfile as sf
from kokoro import KPipeline

ROOT = Path("shadowing_kokoro_out")
ROOT.mkdir(exist_ok=True)
PACK = ROOT / "mp3"
PACK.mkdir(exist_ok=True)
VOICE = "af_heart"
LEVELS = {
 "s01-morning-routine": ("A1", [
  "I get up / at six thirty / every morning.",
  "First, / I open the window / and drink a glass of water.",
  "Then I make some toast / and check the news / on my phone.",
  "I leave home / at a quarter to eight.",
  "It's a simple routine, / but it helps me / start the day well."],
  "routine glass toast check leave quarter".split()),
 "s02-kyoto-weekend": ("A2", [
  "Last weekend, / I took a train to Kyoto / with my sister.",
  "We wanted to visit / some old temples / before it got crowded.",
  "So we got up early / and arrived at the first temple / at eight.",
  "It was quiet, / and the morning air / felt really fresh.",
  "In the afternoon, / we tried green tea sweets / at a small shop.",
  "It was a short trip, / but I want to go back / in autumn."],
  "weekend temple crowded arrive quiet fresh autumn".split()),
 "s03-working-from-home": ("B1", [
  "These days, / a lot of people work from home / at least a few days a week.",
  "It saves time / because you don't have to commute.",
  "You can also focus better / without the noise / of a busy office.",
  "On the other hand, / some people feel lonely / and find it hard / to stop working.",
  "That's why it's important / to set clear rules, / like when to start and finish.",
  "With the right balance, / working from home can be / both productive and comfortable."],
  "commute focus noise lonely important productive comfortable".split()),
 "s04-daily-walk": ("A2", [
  "My doctor told me / to walk for thirty minutes a day.",
  "At first, / I thought it would be boring.",
  "But now I really enjoy it, / especially in the evening.",
  "I listen to podcasts / and look at the trees / and the sky.",
  "After a few weeks, / I started sleeping better / and feeling less tired.",
  "Walking is easy, free, / and good for both body and mind."],
  "doctor minute boring especially listen tired mind".split())
}

pipeline = KPipeline(lang_code="a")

def generate(text, speed):
    results = list(pipeline(text, voice=VOICE, speed=speed, split_pattern=r"\n+"))
    if not results:
        raise RuntimeError("Speech synthesis produced no result: " + text)
    audio = np.concatenate([np.asarray(r.audio, dtype=np.float32).reshape(-1) for r in results])
    if not np.isfinite(audio).all() or not len(audio):
        raise RuntimeError("Audio was invalid: " + text)
    return audio

def trim(audio):
    sr = 24000
    hop = round(sr * .01)
    amps = np.array([np.sqrt(np.mean(audio[i:i+hop]**2)) for i in range(0, len(audio), hop)])
    limit = max(float(amps.max()) * .012, .0009)
    active = np.flatnonzero(amps > limit)
    if not len(active):
        raise RuntimeError("No audible speech found")
    lo = max(0, round(active[0]*hop - sr*.045))
    hi = min(len(audio), round((active[-1]+1)*hop + sr*.045))
    return audio[lo:hi]

def mp3(audio, filename, target_duration=None):
    with tempfile.TemporaryDirectory() as tmp:
        wav = Path(tmp)/"speech.wav"
        sf.write(wav, audio, 24000)
        cmd = ["ffmpeg","-hide_banner","-loglevel","error","-nostdin","-y","-i",str(wav)]
        if target_duration:
            tempo = (len(audio)/24000)/target_duration
            if .86 < tempo < 1.16:
                cmd += ["-af", "atempo=%.6f"%tempo]
        cmd += ["-ar","44100","-ac","1","-c:a","libmp3lame","-b:a","96k","-write_xing","0",str(filename)]
        subprocess.run(cmd,check=True)
        out = subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","default=nokey=1:noprint_wrappers=1",str(filename)])
        return round(float(out.strip()),2)

items = []
timings = []
for sid, (level, lines, words) in LEVELS.items():
    wpm = 150 if level=="B1" else 130
    for num, raw in enumerate(lines, 1):
        chunks = [x.strip() for x in raw.split("/")]
        sentence = " ".join(chunks)
        filename = "%s_%02d.mp3"%(sid,num)
        target = len(sentence.split())*60/wpm
        audio = trim(generate(sentence, 1.03 if level=="B1" else .93))
        duration = mp3(audio, PACK/filename, target)
        items.append({"filename":filename,"type":"sentence","level":level,"text":sentence,"chunks":chunks,"duration_s":duration,"target_wpm":wpm})
        row = {"filename":filename}
        for j, chunk in enumerate(chunks, 1):
            row["chunk%d_text"%j] = chunk
            row["chunk%d_start_s"%j] = "出せない"
            row["chunk%d_end_s"%j] = "出せない"
        timings.append(row)
        print(filename, duration, flush=True)
    for word in words:
        filename = "%s_w_%s.mp3"%(sid,word)
        # Punctuation for phrase boundary, no additional spoken word
        duration = mp3(trim(generate(word+".",.9)), PACK/filename)
        items.append({"filename":filename,"type":"word","level":level,"text":word,"duration_s":duration})
        print(filename,duration,flush=True)

assert len(items)==50 and len(timings)==23
with (PACK/"manifest.json").open("w",encoding="utf-8") as f:
    json.dump({"engine":"Kokoro-82M","voice":VOICE,"accent":"American English","format":"MP3 44100 Hz mono 96 kbps","items":items},f,ensure_ascii=False,indent=2)
with (PACK/"chunk_timings.csv").open("w",encoding="utf-8",newline="") as f:
    columns=["filename"]+[key for i in range(1,5) for key in ("chunk%d_text"%i,"chunk%d_start_s"%i,"chunk%d_end_s"%i)]
    writer=csv.DictWriter(f,fieldnames=columns)
    writer.writeheader()
    writer.writerows(timings)
(PACK/"README_ja.txt").write_text(
    "音声モデル: Kokoro-82M / voice: af_heart / American English\n"
    "全50 MP3: 23文、27単語。\n"
    "44.1kHzモノラル、96kbps CBR。チャンク記号/は発話から除去。\n"
    "正確なチャンク時刻は出せないためCSVに推測値は入れていません。\n"
    "公開前に発音と音声変化を耳で確認してください。\n"
    "モデルライセンス: Apache-2.0 (https://huggingface.co/hexgrad/Kokoro-82M)\n"
    "生成音声であることを明示することを推奨します。\n",
    encoding="utf-8"
)
archive=ROOT/"shadowing_audio_50files_kokoro.zip"
with zipfile.ZipFile(archive,"w",compression=zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(PACK.iterdir()):
        z.write(p,p.name)
print("DONE",archive,len(items),flush=True)