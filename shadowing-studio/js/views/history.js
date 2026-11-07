// Study log, completion history, backup/restore, storage info.
import { h, fmtDate, fmtDuration, todayKey, toast, saveFile, pickFile, confirmDialog, blobToBase64, base64ToBlob } from '../util.js';
import { db, STORES, requestPersist, storageEstimate } from '../db.js';
import { listLessons } from '../lessons.js';
import { allProgress, getDaily } from '../progress.js';
import { settings, replaceSettings } from '../settings.js';

export async function historyView(root) {
  const [lessons, progress, daily] = await Promise.all([listLessons(), allProgress(), getDaily()]);
  const byId = new Map(lessons.map(l => [l.id, l]));
  const total = [...progress.values()].reduce((s, p) => s + (p.totalSec || 0), 0);
  const completions = [...progress.values()].flatMap(p => p.completions.map(c => ({ ...c, lessonId: p.lessonId })))
    .sort((a, b) => b.at - a.at);
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    days.push({ k: todayKey(d), label: `${d.getMonth() + 1}/${d.getDate()}`, sec: daily[todayKey(d)] || 0 });
  }
  const max = Math.max(60, ...days.map(d => d.sec));
  let streak = 0;
  for (let i = days.length - 1; i >= 0; i--) { if (days[i].sec > 0) streak++; else if (i === days.length - 1) continue; else break; }
  const RAT = ['ほとんど', '3割', '半分', 'ほぼ全部'];

  root.replaceChildren(h('div.page',
    h('h1', '学習記録'),
    h('div.stats',
      h('div.stat', h('div.v', fmtDuration(total)), h('div.k', '合計学習時間')),
      h('div.stat', h('div.v', fmtDuration(daily[todayKey()] || 0)), h('div.k', '今日')),
      h('div.stat', h('div.v', `${completions.length}回`), h('div.k', '完了')),
      h('div.stat', h('div.v', `${streak}日`), h('div.k', '連続学習'))),
    h('h2', '直近14日'),
    h('div.bars', { role: 'img', 'aria-label': '直近14日の学習時間' }, days.map(d => h('div.bar',
      h('div.fill', { style: { height: `${(d.sec / max) * 100}%` }, title: `${d.label} ${fmtDuration(d.sec)}` }),
      h('span.bl', d.label)))),
    h('h2', '教材ごと'),
    h('div.table-wrap', h('table.tbl',
      h('thead', h('tr', h('th', '教材'), h('th', '学習時間'), h('th', 'ステップ'), h('th', '完了'))),
      h('tbody', [...progress.values()].filter(p => p.totalSec || p.completions.length || Object.keys(p.steps).length)
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(p => h('tr',
          h('td', h('a', { href: `#/lesson/${encodeURIComponent(p.lessonId)}/${p.lastStep || 1}` }, (byId.get(p.lessonId) || {}).title || p.lessonId), p.favorite ? ' ★' : ''),
          h('td', fmtDuration(p.totalSec)),
          h('td', `${Math.min(6, Object.keys(p.steps).length)}/6`),
          h('td', String(p.completions.length))))))),
    h('h2', '完了履歴'),
    completions.length ? h('ul.history', completions.map(c => h('li',
      h('span.small', fmtDate(c.at)), ' ',
      h('strong', (byId.get(c.lessonId) || {}).title || c.lessonId),
      c.quizTotal ? h('span.badge', `確認問題 ${c.quizScore}/${c.quizTotal}`) : null,
      c.firstRating != null && c.finalRating != null ? h('span.badge', `聞き取り ${RAT[c.firstRating]} → ${RAT[c.finalRating]}`) : null))) : h('p.empty', 'まだ完了した教材はありません。Step 6 の「完了を記録」で追加されます。')));
}

// ---------- backup ----------
const BACKUP = 'shadowing-studio/backup';

export async function exportBackup() {
  const data = {};
  for (const s of STORES) {
    const rows = await db.all(s);
    if (s === 'blobs') {
      data.blobs = [];
      for (const b of rows) data.blobs.push({ id: b.id, mime: b.mime || b.blob.type, name: b.name || '', data: await blobToBase64(b.blob) });
    } else data[s] = rows;
  }
  const payload = { format: BACKUP, version: 1, exportedAt: Date.now(), settings: settings(), data };
  return new Blob([JSON.stringify(payload)], { type: 'application/json' });
}

export async function restoreBackup(text, mode = 'replace') {
  const p = JSON.parse(text);
  if (p.format !== BACKUP) throw new Error('バックアップファイルではありません');
  if (mode === 'replace') for (const s of STORES) await db.clear(s);
  for (const s of STORES) {
    for (const row of p.data[s] || []) {
      if (s === 'blobs') await db.put('blobs', { id: row.id, mime: row.mime, name: row.name, blob: base64ToBlob(row.data, row.mime) });
      else await db.put(s, row);
    }
  }
  if (p.settings) replaceSettings(p.settings);
}

export async function settingsView(root, app) {
  const est = await storageEstimate();
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted().catch(() => false) : false;
  const counts = {};
  for (const s of ['lessons', 'recordings', 'reviews']) counts[s] = (await db.all(s)).length;
  const mb = n => `${(n / 1024 / 1024).toFixed(1)}MB`;

  root.replaceChildren(h('div.page',
    h('h1', '設定・バックアップ'),
    h('div.card',
      h('h2', 'この端末のデータ'),
      h('p', `自分の教材 ${counts.lessons}件・録音 ${counts.recordings}件・添削 ${counts.reviews}件`),
      est ? h('p.small', `使用量 約${mb(est.usage || 0)}${est.quota ? `（上限の目安 ${mb(est.quota)}）` : ''}`) : null,
      h('p.small', persisted ? '✓ 保存領域は「永続」に設定されています。' : 'ブラウザが容量不足のときにデータを消す可能性があります。定期的にバックアップしてください。iPhoneでは「ホーム画面に追加」して使うと消えにくくなります。'),
      !persisted ? h('button.btn.sm', { onclick: async () => { toast((await requestPersist()) ? '永続保存が有効になりました' : 'ブラウザに許可されませんでした'); settingsView(root, app); } }, '永続保存をリクエスト') : null),
    h('div.card',
      h('h2', 'バックアップと復元'),
      h('p.small', '学習履歴・お気に入り・自分の教材（音声を含む）・録音・添削をまとめて1つのファイルに書き出します。機種変更やブラウザのデータ削除の前に保存してください。'),
      h('div.row.wrap',
        h('button.btn.primary', {
          onclick: async e => {
            const btn = e.currentTarget;
            btn.disabled = true;
            try {
              const blob = await exportBackup();
              await saveFile(blob, `shadowing-studio-backup-${todayKey()}.json`, { preferShare: true });
            } finally { btn.disabled = false; }
          },
        }, '⬇ バックアップを書き出す'),
        h('button.btn', {
          onclick: async () => {
            const f = await pickFile('application/json,.json');
            if (!f) return;
            const choice = await confirmDialog('バックアップから復元します。現在のこの端末のデータは置き換えられます。よろしいですか？', '置き換えて復元');
            if (!choice) return;
            try { await restoreBackup(await f.text(), 'replace'); toast('復元しました'); app.navigate('#/library'); }
            catch (err) { toast(err.message || '復元できませんでした', 5000); }
          },
        }, '⬆ バックアップから復元'))),
    h('div.card',
      h('h2', 'すべて削除'),
      h('button.btn.danger', {
        onclick: async () => {
          if (!(await confirmDialog('この端末に保存された学習記録・自分の教材・録音・添削をすべて削除します。元に戻せません。', 'すべて削除'))) return;
          for (const s of STORES) await db.clear(s);
          try { localStorage.removeItem('shadowing-studio:settings'); } catch (_) { /* */ }
          replaceSettings({});
          toast('削除しました');
          app.navigate('#/library');
        },
      }, 'データをすべて削除')),
    h('div.card.about',
      h('h2', 'このアプリについて'),
      h('p', 'Shadowing Studio は、ログイン不要・サーバー不要で動く英語シャドーイング練習アプリです。録音や教材はこの端末の中（IndexedDB）に保存され、外部には送信されません。'),
      h('p.small', '同梱サンプル4本は本アプリのオリジナル教材です（英文・和訳・解説は CC BY 4.0）。サンプル音声は CMU ARCTIC「slt」音声（Festival HTS、再配布可能なライセンス）による合成音声で、実際の話し言葉の音声変化を完全には再現しません。解説は一般的な音声変化の傾向を示しています。'),
      h('p.small', 'iPhone：共有ボタン →「ホーム画面に追加」でアプリのように使えます。録音にはマイクの許可が必要です。'))));
}
