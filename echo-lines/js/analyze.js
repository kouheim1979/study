// Turns plain English text into a lesson: sentences, chunks, key words, sound-change notes, quiz.
// Everything is rule-based and runs on the device (no network).

const STOP = new Set(`a an the and or but so if then than as of at by for from in into on onto to with without about
over under up down out off again also just only very too much many more most some any no not nor all both each
few other such own same can could will would shall should may might must do does did done doing have has had having
be is am are was were been being i me my mine myself you your yours yourself he him his himself she her hers herself
it its itself we us our ours ourselves they them their theirs themselves this that these those what which who whom whose
when where why how there here now then today yes yeah oh ok okay well get got gets go goes going went gone come came comes
make made makes take took takes see saw seen say said says know knew think thought want wanted like liked one two three
four five six seven eight nine ten first last next new old good great little big long day days time times way thing things
really still even never always often sometimes every lot lots back after before because while until since let lets
don't doesn't didn't can't won't isn't aren't wasn't weren't i'm you're he's she's it's we're they're i've you've we've
they've i'll you'll he'll she'll we'll they'll i'd you'd he'd she'd we'd they'd that's there's what's let's mr mrs ms
please thank thanks people something anything everything nothing someone everyone anyone around maybe yesterday tomorrow`.split(/\s+/));

const FUNCTION_WEAK = {
  to: 'to', for: 'for', and: 'and', of: 'of', can: 'can', a: 'a', an: 'an', the: 'the', at: 'at', from: 'from',
  them: 'them', him: 'him', her: 'her', your: 'your', was: 'was', were: 'were', have: 'have', has: 'has',
  some: 'some', than: 'than', as: 'as', but: 'but', or: 'or', are: 'are', that: 'that', you: 'you',
};

const SILENT = {
  listen: 't', often: 't（発音する人もいます）', castle: 't', whistle: 't', fasten: 't', christmas: 't',
  walk: 'l', talk: 'l', half: 'l', calm: 'l', palm: 'l', salmon: 'l', could: 'l', would: 'l', should: 'l',
  know: 'k', knew: 'k', knee: 'k', knife: 'k', knock: 'k', knowledge: 'k',
  write: 'w', wrong: 'w', wrote: 'w', answer: 'w', two: 'w', who: 'w',
  autumn: 'n', column: 'n', hour: 'h', honest: 'h', honor: 'h', island: 's', wednesday: '最初の d',
  comb: 'b', climb: 'b', doubt: 'b', debt: 'b', thumb: 'b', lamb: 'b', sign: 'g', foreign: 'g', design: 'g',
  receipt: 'p', psychology: 'p', cupboard: 'p', business: '2つ目の i（2音節）', vegetable: '真ん中の e（3〜4音節）',
  comfortable: 'or（3音節「カンフタブル」）', interesting: '2つ目の e（3音節になることも）', chocolate: '2つ目の o',
  different: '2つ目の e（2音節になることも）', every: '2つ目の e（2音節）', family: 'i（2音節になることも）',
};

const REDUCTIONS = [
  [/\bwant to\b/i, 'want to → 「ワナ」(wanna) に近く聞こえることがあります'],
  [/\bwants to\b/i, 'wants to → 「ワンツタ」のように to が弱くなります'],
  [/\bgoing to\b(?! \w+ing)/i, 'going to → 「ゴナ」(gonna) に近く聞こえることがあります'],
  [/\bgot to\b/i, 'got to → 「ガラ」(gotta) に近く聞こえることがあります'],
  [/\bhave to\b/i, 'have to → 「ハフタ」。v が f に近くなります'],
  [/\bhas to\b/i, 'has to → 「ハスタ」。s が濁らなくなります'],
  [/\bkind of\b/i, 'kind of → 「カインダ」(kinda)'],
  [/\bout of\b/i, 'out of → 「アウラ」(outta) に近くなります'],
  [/\blet me\b/i, 'let me → 「レミ」(lemme)'],
  [/\bgive me\b/i, 'give me → 「ギミ」(gimme)'],
  [/\bdon't know\b/i, "don't know → 「ドンノウ」。t がほぼ消えます"],
  [/\bdo you\b/i, 'do you → 「ドゥユ／ジュ」。弱く速く言います'],
  [/\ba lot of\b/i, 'a lot of → 「アラロヴ」。t の弾音化と of の弱形'],
  [/\bused to\b/i, 'used to → 「ユーストゥ」。d は発音しません'],
  [/\bsupposed to\b/i, 'supposed to → 「サポウストゥ」。d が消えます'],
  [/\bought to\b/i, 'ought to → 「オーラ」に近くなります'],
];

const VOWEL_START_EXCEPT = /^(u[nr]?i|use|usu|euro|one|once|unit|uni)/i;
const H_SILENT = /^(hour|honest|honor|honour|heir)/i;
const FLAP_WORDS = /^(better|water|little|city|pretty|matter|letter|bottle|computer|party|later|getting|meeting|writing|waiting|sitting|putting|setting|cutting|forty|thirty|twenty|beautiful|butter|daughter|exciting|whatever|totally|actually|item|data|photo|potato|tomato|duty|notice|metal|total|hospital|visiting|started|limited|created|bottom|automatic|community|security|quality|ability|activity|opportunity|university|party|dirty|shorter|starter|matter)$/i;

const clean = w => w.toLowerCase().replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/’/g, "'");

function startsWithVowelSound(w) {
  if (H_SILENT.test(w)) return true;
  if (VOWEL_START_EXCEPT.test(w)) return false;
  return /^[aeiou]/.test(w);
}
/** Returns 'vowel' | 'consonant' | 'r' | 'y' | 'w' describing how the word ends (letter-based estimate). */
function endSound(w) {
  if (/(ay|ey|oy|uy)$/.test(w) || /^(i|my|by|why|be|he|she|we|me|see|free|three|tree|tea|key|lay|day|say|way)$/.test(w)) return 'y';
  if (/(ow|ew|ou|oo|o|ue)$/.test(w) && !/(ough)$/.test(w) && w !== 'to' && w !== 'do' && w !== 'who') return 'w';
  if (/^(to|do|who|two|too|you|through|new|few)$/.test(w)) return 'w';
  if (/(r|re)$/.test(w) && !/(ere|ire|ure)$/.test(w) || /^(were|are|more|there|where|here|their|our|your|for|or)$/.test(w)) return 'r';
  if (/[aeiou]$/.test(w) && !/[^aeiou]e$/.test(w)) return 'vowel';
  if (/(ee|ea|ie)$/.test(w)) return 'y';
  return 'consonant';
}
function lastConsonant(w) {
  const m = w.replace(/e$/, '').match(/([b-df-hj-np-tv-z]+)$/);
  return m ? m[1] : '';
}

/** Sound notes for a word sequence (pairs inside a sentence). Returns [{i, text}] where i = index of first word. */
export function soundNotes(words) {
  const notes = [];
  const lw = words.map(clean);
  // fixed reductions (want to -> wanna ...) take priority over pair rules
  const skip = new Set();
  const joined = lw.join(' ');
  for (const [re, text] of REDUCTIONS) {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(joined))) {
      const i = joined.slice(0, m.index).split(' ').filter(Boolean).length;
      const len = m[0].split(' ').length;
      notes.push({ i, kind: 'reduce', text });
      for (let k = i; k < i + len - 1; k++) skip.add(k);
    }
  }
  for (let i = 0; i < lw.length; i++) {
    const w = lw[i];
    if (!w) continue;
    if (SILENT[w]) notes.push({ i, kind: 'silent', text: `${w}：${SILENT[w]} は発音しない／弱く読みます` });
    if (FLAP_WORDS.test(w)) notes.push({ i, kind: 'flap', text: `${w}：t（tt）が弾音化して「ラ行」に近く聞こえます（米音）` });
    const n = lw[i + 1];
    if (!n || skip.has(i)) continue;
    const pair = `${words[i].replace(/[^A-Za-z0-9']+$/, '')} ${words[i + 1].replace(/^[^A-Za-z0-9']+/, '').replace(/[^A-Za-z0-9']+$/, '')}`;
    const pause = /[,.;:!?]$/.test(words[i]); // punctuation breaks the link
    if (pause) continue;
    const es = endSound(w);
    const lc = lastConsonant(w);
    // assimilation with "you/your"
    if (/^(you|your|you're|yourself)$/.test(n)) {
      if (/t$/.test(w)) { notes.push({ i, kind: 'assim', text: `${pair}：t + y が混ざって「チュ」に近くなります` }); continue; }
      if (/d$/.test(w)) { notes.push({ i, kind: 'assim', text: `${pair}：d + y が混ざって「ジュ」に近くなります` }); continue; }
      if (/s$/.test(w) && !/ss$/.test(w) && /^(is|was|as|has|does|his|hers|its)$/.test(w)) { notes.push({ i, kind: 'assim', text: `${pair}：z + y が混ざって「ジュ」に近くなります` }); continue; }
      if (/s{1,2}$/.test(w)) { notes.push({ i, kind: 'assim', text: `${pair}：s + y が混ざって「シュ」に近くなります` }); continue; }
    }
    if (startsWithVowelSound(n)) {
      if (/[aeiour]t$/.test(w) || /^(it|at|get|got|let|put|not|what|but|lot|that|out|about|sit|set|bit|eat|meet|wait)$/.test(w)) {
        notes.push({ i, kind: 'flap', text: `${pair}：t が次の母音とつながり、弾音化して「ラ行」に近く聞こえます（米音）` });
      } else if (es === 'consonant') {
        notes.push({ i, kind: 'link', text: `${pair}：語末の子音と次の母音がつながり、1語のように聞こえます` });
      } else if (es === 'r') {
        notes.push({ i, kind: 'link', text: `${pair}：r の音でなめらかにつながります` });
      } else if (es === 'y') {
        notes.push({ i, kind: 'link', text: `${pair}：間に軽い「y」の音が入ってつながります` });
      } else if (es === 'w') {
        notes.push({ i, kind: 'link', text: `${pair}：間に軽い「w」の音が入ってつながります` });
      }
      continue;
    }
    // same / similar consonant across the boundary
    const first = n[0];
    const lastLetter = w.replace(/e$/, '').slice(-1);
    const same = es === 'consonant' && lastLetter === first || (lastLetter === 'k' && first === 'c') || (lastLetter === 'c' && first === 'k') ||
      (/^[td]$/.test(lastLetter) && /^[td]$/.test(first)) || (/^[sz]$/.test(lastLetter) && /^[sz]$/.test(first));
    if (same && /[b-df-hj-np-tv-z]/.test(first)) {
      notes.push({ i, kind: 'drop', text: `${pair}：同じ（似た）子音が続くので、1回分だけ発音します` });
      continue;
    }
    if (/[tdpbkg]$/.test(lc) && /^[b-df-hj-np-tv-z]/.test(n) && w.length > 1) {
      notes.push({ i, kind: 'drop', text: `${pair}：語末の ${lc.slice(-1)} は破裂させず、止めるだけ（脱落）になりやすいです` });
    }
  }
  return notes;
}

export function weakForms(words) {
  const found = [];
  for (const w of words.map(clean)) if (FUNCTION_WEAK[w] && !found.includes(w)) found.push(w);
  return found;
}

/** Split text into sentences, then chunks (commas, connectors, long phrases). */
export function splitSentences(text) {
  const t = text.replace(/\r/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    .replace(/^\s*\d+\s*$/gm, '') // srt numbers
    .replace(/^\s*\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s*-->.*$/gm, '') // srt/vtt timing
    .replace(/^WEBVTT.*$/m, '')
    .replace(/^\s*[A-Z][A-Za-z]{0,15}\s*:\s+/gm, '') // speaker labels "Tom: "
    .split('\n').map(s => s.trim()).filter(Boolean).join(' ')
    .replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  const re = /[^.!?]+(?:[.!?]+["')\]]*|$)/g;
  let m;
  while ((m = re.exec(t))) {
    let s = m[0].trim();
    if (!s) continue;
    // keep abbreviations (Mr. Dr. etc.) with the following sentence
    if (out.length && /\b(Mr|Mrs|Ms|Dr|St|vs|etc|e\.g|i\.e)\.$/i.test(out[out.length - 1])) out[out.length - 1] += ' ' + s;
    else out.push(s);
  }
  return out;
}

const CONNECTORS = /^(and|but|or|so|because|when|while|if|that|which|who|where|after|before|until|since|although|though|to|with|for|without|than|as|like)$/i;
export function splitChunks(sentence, maxWords = 6) {
  let parts = sentence.split(/(?<=[,;:])\s+/);
  const out = [];
  for (const p of parts) out.push(...splitLong(p, maxWords));
  // merge 1-word pieces ("Hi," / "please.") into a neighbour
  const merged = [];
  for (let i = 0; i < out.length; i++) {
    const p = out[i];
    const one = p.split(' ').length === 1;
    if (one && merged.length) merged[merged.length - 1] += ' ' + p;
    else if (one && i + 1 < out.length) { out[i + 1] = p + ' ' + out[i + 1]; }
    else merged.push(p);
  }
  return merged;
}
function splitLong(p, maxWords) {
  const w = p.split(' ');
  if (w.length <= maxWords) return [p];
  for (let i = Math.min(w.length - 2, maxWords); i >= 2; i--) {
    if (CONNECTORS.test(w[i])) return [w.slice(0, i).join(' '), ...splitLong(w.slice(i).join(' '), maxWords)];
  }
  for (let i = 2; i < w.length - 2; i++) {
    if (CONNECTORS.test(w[i])) return [w.slice(0, i).join(' '), ...splitLong(w.slice(i).join(' '), maxWords)];
  }
  if (w.length > maxWords + 3) {
    const half = Math.ceil(w.length / 2);
    return [w.slice(0, half).join(' '), ...splitLong(w.slice(half).join(' '), maxWords)];
  }
  return [p];
}

export function keywords(text, max = 10) {
  const seen = new Map();
  const proper = new Set();
  const toks = text.split(/\s+/);
  toks.forEach((raw, i) => {
    const bare = raw.replace(/^[^A-Za-z]+/, '');
    const sentenceStart = i === 0 || /[.!?]["')\]]*$/.test(toks[i - 1]);
    if (/^[A-Z]/.test(bare) && !sentenceStart) proper.add(clean(raw)); // names, places
  });
  for (const raw of toks) {
    const w = clean(raw);
    if (!w || w.length < 4 || STOP.has(w) || /\d/.test(w) || w.includes("'")) continue;
    seen.set(w, (seen.get(w) || 0) + 1);
  }
  for (const p of proper) seen.delete(p);
  // prefer longer / less common-looking words, keep first-appearance order for display
  const ranked = [...seen.keys()].map((w, idx) => ({ w, idx, score: w.length + (seen.get(w) > 1 ? 2 : 0) + (SILENT[w] ? 3 : 0) + (FLAP_WORDS.test(w) ? 2 : 0) }))
    .sort((a, b) => b.score - a.score).slice(0, max).sort((a, b) => a.idx - b.idx);
  return ranked.map(r => r.w);
}

export function estimateLevel(sentences) {
  const words = sentences.join(' ').match(/[A-Za-z']+/g) || [];
  if (!words.length) return 'A1';
  const perSentence = words.length / Math.max(1, sentences.length);
  const longRatio = words.filter(w => w.length >= 8).length / words.length;
  const score = perSentence / 4 + longRatio * 20;
  if (score < 3.2) return 'A1';
  if (score < 4.4) return 'A2';
  if (score < 5.8) return 'B1';
  if (score < 7.2) return 'B2';
  return 'C1';
}

/** Build a complete lesson object from raw text (+ optional Japanese lines). */
export function buildLesson({ text, ja = '', title = '', theme = '', maxWords = 6 }) {
  const sentences = splitSentences(text);
  const jaLines = ja.replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
  const chunks = [];
  sentences.forEach((s, si) => {
    const parts = splitChunks(s, maxWords);
    const allWords = s.split(' ');
    const notes = soundNotes(allWords);
    let wi = 0;
    parts.forEach(p => {
      const n = p.split(' ').length;
      const myNotes = notes.filter(x => x.i >= wi && x.i < wi + n).map(x => x.text);
      const weak = weakForms(p.split(' '));
      if (weak.length) myNotes.push(`弱く短く読まれやすい語：${weak.join('・')}`);
      chunks.push({ id: `c${chunks.length + 1}`, en: p, ja: '', s: si, notes: myNotes });
      wi += n;
    });
  });
  const words = keywords(sentences.join(' ')).map(w => ({ w, ja: '', note: SILENT[w] ? `${SILENT[w]} は発音しない／弱く読みます` : (FLAP_WORDS.test(w) ? 't が弾音化しやすい（米音）' : '') }));
  const autoTitle = title.trim() || (sentences[0] || 'Untitled').split(' ').slice(0, 6).join(' ').replace(/[,.;:!?]+$/, '');
  return {
    title: autoTitle, theme: theme.trim(), level: estimateLevel(sentences), text,
    sentences: sentences.map((en, i) => ({ en, ja: jaLines[i] || '' })),
    chunks, words,
  };
}

/** Auto cloze questions from key words (up to n). */
export function makeCloze(lesson, n = 5, seed = 1) {
  const kw = lesson.words.map(w => w.w);
  if (kw.length < 3) return [];
  let r = seed;
  const rand = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const qs = [];
  const used = new Map();
  const cands = kw.map(w => ({ w, s: lesson.sentences.find(x => new RegExp(`\\b${w}\\b`, 'i').test(x.en)) })).filter(c => c.s);
  // one question per sentence first, then allow repeats
  const order = [...cands.filter((c, i) => cands.findIndex(d => d.s === c.s) === i), ...cands.filter((c, i) => cands.findIndex(d => d.s === c.s) !== i)];
  for (const { w, s } of order) {
    used.set(s, (used.get(s) || 0) + 1);
    const others = kw.filter(x => x !== w).sort(() => rand() - 0.5).slice(0, 2);
    const choices = [w, ...others].sort(() => rand() - 0.5);
    qs.push({ q: s.en.replace(new RegExp(`\\b${w}\\b`, 'i'), '＿＿＿＿'), choices, answer: choices.indexOf(w), sentence: s.en });
    if (qs.length >= n) break;
  }
  return qs;
}
