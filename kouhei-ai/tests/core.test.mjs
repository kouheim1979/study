import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.match(/<script id="kouhei-core">([\s\S]*?)<\/script>/)[1];
const context = vm.createContext({ crypto: webcrypto, URL });
vm.runInContext(source, context);
const C = vm.runInContext('StudyCore', context);

test('the Japanese lightweight model has a short context and does not receive Qwen3 thinking markers',()=>{
  const state=C.newState(),chat=state.chats[0];
  chat.messages.push({role:'user',content:'質問'.repeat(250),status:'ok'});
  const messages=C.buildMessages(state,chat,[],true);
  assert.equal(messages.at(-1).content,chat.messages[0].content);
  assert.ok(messages.reduce((n,m)=>n+m.content.length,0)<=1400);
  assert.ok(!messages[0].content.includes('/no_think'));
  assert.equal(C.generationOptions(state.model).extra_body,undefined);
  assert.equal(C.generationOptions(state.model).max_tokens,256);
  assert.equal(C.generationOptions('Qwen3-0.6B-q4f16_1-MLC').extra_body.enable_thinking,false);
});

test('backup round trip preserves content but never imports a token or executable role', () => {
  const state = C.newState();
  state.sessionToken = 'must-not-survive';
  state.chats[0].messages.push({ id: 'one', role: 'assistant', content: '中断した応答', status: 'pending' });
  const restored = C.normalizeState(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.sessionToken, undefined);
  assert.equal(restored.chats[0].messages[0].status, 'interrupted');
  state.chats[0].messages[0].role = 'system';
  assert.throws(() => C.normalizeState(state), /形式/);
});

test('Qwen3 trial choices survive backup and use the mobile conversation and response limits',()=>{
  for(const model of ['Qwen3-0.6B-q4f16_1-MLC',C.QWEN35_MODEL]){
    const state=C.newState();state.model=model;
    const chat=state.chats[0];
    for(let i=0;i<12;i++)chat.messages.push({role:i%2?'assistant':'user',content:'過去の会話'.repeat(50),status:'ok'});
    chat.messages.push({role:'user',content:'今日の質問',status:'ok'});
    const messages=C.buildMessages(state,chat,[],true,true);
    assert.equal(messages.at(-1).content,'今日の質問');
    assert.ok(messages.reduce((n,m)=>n+m.content.length,0)<=1400);
    assert.equal(C.generationOptions(model,true).max_tokens,256);
    assert.equal(C.generationOptions(model,true).extra_body.enable_thinking,false);
    assert.equal(C.normalizeState(state).model,model);
  }
});

test('corrupt and duplicate backup content fails without silently resetting it', () => {
  assert.throws(() => C.normalizeState({}), /バックアップ/);
  const state = C.newState();
  state.chats.push(state.chats[0]);
  assert.throws(() => C.normalizeState(state), /重複/);
});

test('Japanese retrieval supplies relevant references within a context budget', () => {
  const refs = C.retrieve('PLCの設計レビューを整理', [
    { name: '英語', text: '毎日1文を発音する。' },
    { name: '制御', text: 'PLCの設計レビューでは通信条件とインターロックを確認する。'.repeat(40) },
  ], 650);
  assert.equal(refs[0].name, '制御');
  assert.ok(refs.reduce((sum, r) => sum + r.text.length, 0) <= 650);
});

test('model context excludes errors and pending text while preserving newest question', () => {
  const state = C.newState(), chat = state.chats[0];
  for (let i = 0; i < 20; i++) chat.messages.push({ role: i % 2 ? 'assistant' : 'user', content: String(i).repeat(100), status: 'ok' });
  chat.messages.push({ role: 'assistant', content: 'ignored', status: 'error' }, { role: 'user', content: '最後の質問', status: 'ok' }, { role: 'assistant', content: '', status: 'pending' });
  const messages = C.buildMessages(state, chat, [], true);
  assert.equal(messages[0].role, 'system');
  assert.equal(messages[1].role, 'user');
  assert.equal(messages.at(-1).content, '最後の質問');
  assert.ok(messages.every(m => m.content !== 'ignored'));
  assert.ok(messages.reduce((sum, m) => sum + m.content.length, 0) <= 3000);
});

test('CSV import handles quoted multiline Japanese and does not confuse backups with notes', () => {
  const text = C.importText('data.csv', '\uFEFFNo.,日時,発言本文,注記\r\n1,2026-09-19,"制御,設計\n確認",原文\r\n');
  assert.match(text, /発言本文: 制御,設計\n確認/);
  assert.match(text, /日時: 2026-09-19/);
  assert.throws(() => C.importText('backup.json', JSON.stringify(C.newState())), /バックアップ/);
  assert.throws(() => C.parseCSV('"broken'), /引用符/);
});

test('connection URLs reject embedded secrets, insecure remote servers and active schemes', () => {
  assert.equal(C.validateEndpoint('https://example.com/api/chat'), 'https://example.com/api/chat');
  assert.equal(C.validateEndpoint('http://127.0.0.1:8787/api/chat'), 'http://127.0.0.1:8787/api/chat');
  for (const url of ['javascript:alert(1)', 'http://example.com/api/chat', 'https://name:secret@example.com/', 'https://example.com/?token=secret']) assert.throws(() => C.validateEndpoint(url));
  assert.equal(C.stripThinking('<think>内部の推論</think>回答'), '回答');
});
