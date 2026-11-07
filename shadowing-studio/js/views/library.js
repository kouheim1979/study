// Lesson list with search, level/theme filters, favorites, and "continue where you left off".
import { h, $$, fmtTime, fmtDuration } from '../util.js';
import { listLessons, LEVELS } from '../lessons.js';
import { allProgress, getResume, STEPS } from '../progress.js';

const state = { q: '', level: '', theme: '', fav: false, sort: 'default' };

export async function libraryView(root) {
  const [lessons, progress, resume] = await Promise.all([listLessons(), allProgress(), getResume()]);
  const themes = [...new Set(lessons.map(l => l.theme).filter(Boolean))].sort();
  const levels = LEVELS.filter(lv => lessons.some(l => l.level === lv));

  const list = h('div.lesson-list', { 'aria-live': 'polite' });
  const countEl = h('span.small');
  const search = h('input.search', { type: 'search', placeholder: 'タイトル・本文・テーマで検索', value: state.q, 'aria-label': '教材を検索' });
  search.addEventListener('input', () => { state.q = search.value; draw(); });

  const chipRow = (items, key, allLabel) => {
    const row = h('div.chips.scroll', { role: 'radiogroup' },
      [['', allLabel], ...items.map(i => [i, i])].map(([v, label]) => h('button.chip', {
        type: 'button', role: 'radio', 'aria-checked': String(state[key] === v),
        onclick: e => {
          state[key] = v;
          $$('.chip', row).forEach(b => b.setAttribute('aria-checked', 'false'));
          e.currentTarget.setAttribute('aria-checked', 'true');
          draw();
        },
      }, label)));
    return row;
  };
  const favToggle = h('button.chip', { type: 'button', 'aria-pressed': String(state.fav), onclick: e => { state.fav = !state.fav; e.currentTarget.setAttribute('aria-pressed', String(state.fav)); draw(); } }, '★ お気に入り');
  const sortSel = h('select', { 'aria-label': '並び順', onchange: e => { state.sort = e.target.value; draw(); } },
    [['default', 'おすすめ順'], ['level', 'レベル順'], ['recent', '最近練習した順'], ['short', '短い順']].map(([v, l]) => h('option', { value: v, selected: state.sort === v }, l)));

  function draw() {
    const q = state.q.trim().toLowerCase();
    let items = lessons.filter(l =>
      (!state.level || l.level === state.level) &&
      (!state.theme || l.theme === state.theme) &&
      (!state.fav || (progress.get(l.id) || {}).favorite) &&
      (!q || [l.title, l.titleJa, l.theme, l.description, l.text, l.level].join(' ').toLowerCase().includes(q)));
    const lvIdx = l => { const i = LEVELS.indexOf(l.level); return i < 0 ? 99 : i; };
    if (state.sort === 'level') items.sort((a, b) => lvIdx(a) - lvIdx(b));
    if (state.sort === 'recent') items.sort((a, b) => ((progress.get(b.id) || {}).updatedAt || 0) - ((progress.get(a.id) || {}).updatedAt || 0));
    if (state.sort === 'short') items.sort((a, b) => (a.duration || 0) - (b.duration || 0));
    countEl.textContent = `${items.length}件`;
    list.replaceChildren(...(items.length ? items.map(l => card(l, progress.get(l.id))) : [h('p.empty', '条件に合う教材がありません。')]));
  }

  const resumeLesson = resume && lessons.find(l => l.id === resume.lessonId);
  root.replaceChildren(
    h('div.page',
      h('div.hero',
        h('h1', '教材をえらぶ'),
        h('p.lead', '音を聞く → 単語 → 意味 → リピート → シャドーイング → 理解の確認、の6ステップで1本ずつ仕上げます。')),
      resumeLesson ? h('a.card.resume', { href: `#/lesson/${encodeURIComponent(resumeLesson.id)}/${resume.step || 1}?t=${resume.pos || 0}` },
        h('div.small', '前回の続きから'),
        h('div.t', resumeLesson.title),
        h('div.small', `Step ${resume.step || 1}「${(STEPS[(resume.step || 1) - 1] || STEPS[0]).title}」・${fmtTime(resume.pos || 0)} から`)) : null,
      h('div.filters',
        search,
        chipRow(levels, 'level', 'すべてのレベル'),
        chipRow(themes, 'theme', 'すべてのテーマ'),
        h('div.row.wrap', favToggle, sortSel, countEl, h('span.grow'), h('a.btn.sm', { href: '#/mine' }, '＋ 自分の教材'))),
      list));
  draw();
}

function card(l, p) {
  p = p || { steps: {}, completions: [], totalSec: 0 };
  const done = Object.keys(p.steps || {}).length;
  return h('a.card.lesson-card', { href: `#/lesson/${encodeURIComponent(l.id)}/${p.lastStep || 1}` },
    h('div.lc-top',
      h('span.badge.lv', l.level || '—'),
      h('span.badge', l.theme || 'テーマなし'),
      l.kind === 'user' ? h('span.badge.mine', '自分の教材') : h('span.badge.sample', 'サンプル'),
      p.favorite ? h('span.star', { 'aria-label': 'お気に入り' }, '★') : null),
    h('div.t', l.title),
    l.titleJa ? h('div.small', l.titleJa) : null,
    l.description ? h('div.d', l.description) : null,
    h('div.lc-meta',
      h('span', `⏱ ${fmtTime(l.duration)}`),
      h('span', `${l.chunkCount || 0}チャンク`),
      h('span', `ステップ ${Math.min(6, done)}/6`),
      p.completions.length ? h('span', `完了 ${p.completions.length}回`) : null,
      p.totalSec ? h('span', `学習 ${fmtDuration(p.totalSec)}`) : null),
    h('div.progress', h('div', { style: { width: `${(Math.min(6, done) / 6) * 100}%` } })));
}
