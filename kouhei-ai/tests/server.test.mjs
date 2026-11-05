import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.mjs';

test('gateway verifies origin and token, validates input, and keeps the provider key server-side', async t => {
  const calls = [];
  const server = createApp({
    apiKey: 'test-provider-key', accessToken: 'test-access-token', model: 'test-model',
    allowedOrigins: ['https://kouheim1979.github.io'],
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({ output: [{ content: [{ type: 'output_text', text: 'テスト用の回答' }] }] });
    },
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}/api/chat`;
  const payload = JSON.stringify({ messages: [{ role: 'user', content: '相談' }] });
  const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer test-access-token', Origin: 'https://kouheim1979.github.io' };
  const request = (h = headers, body = payload) => fetch(url, { method: 'POST', headers: h, body });
  assert.equal((await request({ ...headers, Authorization: 'Bearer incorrect' })).status, 401);
  assert.equal((await request({ ...headers, Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await request(headers, '{')).status, 400);
  assert.equal((await request(headers, JSON.stringify({ messages: [{ role: 'tool', content: 'bad' }] }))).status, 400);
  assert.equal(calls.length, 0);
  const response = await request();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), headers.Origin);
  assert.deepEqual(await response.json(), { reply: 'テスト用の回答' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer test-provider-key');
  const upstream = JSON.parse(calls[0].options.body);
  assert.equal(upstream.store, false);
  assert.equal(upstream.model, 'test-model');
  assert.deepEqual(upstream.input, [{ role: 'user', content: '相談' }]);
  const page = await (await fetch(url.replace('/api/chat', '/'))).text();
  assert.ok(page.includes('AI相談室'));
  assert.ok(!page.includes('test-provider-key'));
});

test('provider errors are reported without leaking provider diagnostics', async t => {
  const server = createApp({ apiKey: 'test-key', accessToken: 'token', fetchImpl: async () => Response.json({ error: { message: 'secret diagnostic' } }, { status: 401 }) });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => server.close(resolve)));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/chat`, { method: 'POST', headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: '相談' }] }) });
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('secret diagnostic'));
});
