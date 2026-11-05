import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
// Exercise the actual startup functions with a simulated runtime, without a GPU or download.
const source = html.slice(html.indexOf('async function getRuntime()'), html.indexOf('function showEngineError(')).replace('import(url)', 'importRuntime(url)');
function fixture({ reload = async () => {}, importFailure = false, safe = false, mobile = false, smokePassed = false, model = 'Qwen3-0.6B-q4f16_1-MLC', reply = 'Hello!', hasF16 = true } = {}) {
  const elements = new Map(), instances = [], imports = [];
  const context = vm.createContext({
    setTimeout, clearTimeout, console,
    window: { isSecureContext: true },
    navigator: { gpu: { requestAdapter: async () => ({ features: new Set(hasF16?['shader-f16']:[]) }) } },
    $: id => {
      if (!elements.has(id)) elements.set(id, { textContent: '', hidden: false, value: 0, close() { this.closed = true; } });
      return elements.get(id);
    },
    importRuntime: async url => {
      imports.push(url);
      if (importFailure && imports.length === 1) throw new Error('test CDN unavailable');
      return { MLCEngine: class {
        constructor(options) { this.options=options;this.requests=[];this.chat = { completions: { create: async request => {this.requests.push(request);return {choices:[{message:{content:reply}}]};} } }; this.unloads = 0; instances.push(this); }
        reload(...args) { this.reloadArguments = args; return reload(); }
        async unload() { this.unloads++; }
      } };
    },
  });
  vm.runInContext(html.match(/<script id="kouhei-core">([\s\S]*?)<\/script>/)[1],context);
  vm.runInContext(html.match(/<script id="kouhei-diagnostics">([\s\S]*?)<\/script>/)[1],context);
  vm.runInContext(`
    const trace=StudyDiagnostics.journal({getItem:()=>null,setItem(){}});const RUNTIMES=['primary','fallback'];const SAFE_LOCAL=${safe},MOBILE_LOCAL=${mobile};const RECOVERY_MESSAGE='端末内AIを停止しています';
    let runtimePromise=null,engine=null,loadedModel='',loadVersion=0,loading=false,restartRequired=false;
    const state={model:${JSON.stringify(model)}},C=StudyCore;
    if(${smokePassed}){trace.startStartup('smoke',StudyDiagnostics.SMOKE_MODEL);trace.finishStartup('complete');}
    const guard=()=>!loading,renderEngine=()=>{},renderDiagnostics=()=>{},toast=()=>{};
    const showEngineError=e=>{$('engineError').textContent=e.message;$('engineError').hidden=false;};
    ${source}
  `, context);
  return { run: code => vm.runInContext(code, context), elements, instances, imports };
}

test('startup creates the main-window engine and becomes ready only after reload completes', async () => {
  const f = fixture();
  await f.run('loadModel()');
  assert.equal(f.instances.length, 1);
  assert.equal(f.instances[0].reloadArguments[0], 'Qwen3-0.6B-q4f16_1-MLC');
  assert.equal(f.run('loadedModel'), 'Qwen3-0.6B-q4f16_1-MLC');
  assert.equal(f.run('loading'), false);
  assert.equal(f.elements.get('engineDialog').closed, true);
});

test('runtime diagnostic can recover from a failed CDN without loading model weights', async () => {
  const f = fixture({ importFailure: true });
  await f.run('checkRuntime()');
  assert.deepEqual(f.imports, ['primary', 'fallback']);
  assert.equal(f.instances[0].reloadArguments, undefined);
  assert.equal(f.instances[0].unloads, 1);
  assert.match(f.elements.get('gpuStatus').textContent, /取得・初期化：成功/);
  assert.equal(f.run('loadedModel'), '');
});

test('failed model reload releases the engine and reports the actual failing stage', async () => {
  const f = fixture({ reload: async () => { throw new Error('test model fetch failed'); } });
  await f.run('loadModel()');
  assert.equal(f.run('engine'), null);
  assert.equal(f.run('loading'), false);
  assert.equal(f.instances[0].unloads, 1);
  assert.match(f.elements.get('engineError').textContent, /モデルの読み込みで停止しました。test model fetch failed/);
});

test('cancelling a pending reload cannot later mark the cancelled model ready', async () => {
  let started, finish;
  const didStart = new Promise(resolve => { started = resolve; });
  const pending = new Promise(resolve => { finish = resolve; });
  const f = fixture({ reload: () => { started(); return pending; } });
  const load = f.run('loadModel()');
  await didStart;
  await f.run('unload()');
  finish();
  await load;
  assert.equal(f.run('loadedModel'), '');
  assert.equal(f.run('engine'), null);
  assert.equal(f.run('loading'), false);
  assert.ok(f.instances[0].unloads >= 2);
  assert.equal(f.elements.has('engineDialog'), false);
});

 test('recovery mode does not import, initialize or load the local AI runtime', async () => {
  const f = fixture({safe:true});
  await f.run('loadModel()');
  await f.run('checkRuntime()');
  await f.run('runStartupTest()');
  assert.equal(f.imports.length,0);
  assert.equal(f.instances.length,0);
  assert.equal(f.run('loading'),false);
  assert.match(f.elements.get('engineError').textContent,/端末内AIを停止/);
});

test('mobile startup requires a successful inference test and rejects the desktop model',async()=>{
  const first=fixture({mobile:true,model:'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'});
  await first.run('loadModel()');assert.equal(first.imports.length,0);
  const large=fixture({mobile:true,smokePassed:true,model:'Qwen3-1.7B-q4f16_1-MLC'});
  await large.run('loadModel()');assert.equal(large.imports.length,0);
});

test('mobile users can explicitly load Qwen3 and Qwen3.5 with a bounded context after the inference test',async()=>{
  for(const model of ['Qwen3-0.6B-q4f16_1-MLC','Qwen3.5-0.8B-q4f16_1-MLC']){
    const blocked=fixture({mobile:true,model});
    await blocked.run('loadModel()');assert.equal(blocked.imports.length,0);
    const allowed=fixture({mobile:true,smokePassed:true,model});
    await allowed.run('loadModel()');
    assert.equal(allowed.instances[0].reloadArguments[0],model);
    assert.equal(allowed.instances[0].reloadArguments[1].context_window_size,2048);
    assert.equal(allowed.run('loadedModel'),model);
    assert.equal(allowed.run('trace.snapshot().startup.model'),model);
    assert.equal(allowed.run('trace.snapshot().startup.status'),'complete');
  }
});

test('the small-model test generates a short fixed reply, unloads, and unlocks the mobile Japanese model',async()=>{
  const f=fixture({mobile:true,model:'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'});
  await f.run('runStartupTest()');
  const probe=f.instances[0];
  assert.equal(probe.reloadArguments[0],'SmolLM2-135M-Instruct-q0f16-MLC');
  assert.equal(probe.reloadArguments[1].context_window_size,1024);
  assert.equal(probe.requests[0].max_tokens,16);
  assert.equal(probe.requests[0].messages.length,1);
  assert.equal(probe.unloads,1);
  assert.equal(f.run('engine'),null);
  assert.ok(f.run('trace.snapshot().smokePassedAt'));
  assert.equal(f.run('trace.snapshot().startup.status'),'complete');
  await f.run('loadModel()');
  assert.equal(f.instances[1].reloadArguments[0],'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
  assert.equal(f.instances[1].reloadArguments[1].context_window_size,2048);
  assert.equal(f.run('loadedModel'),'Qwen2.5-0.5B-Instruct-q4f16_1-MLC');
});

test('an empty test reply cannot unlock mobile inference and requires a clean page before retrying',async()=>{
  const f=fixture({mobile:true,reply:'   ',model:'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'});
  await f.run('runStartupTest()');
  assert.equal(f.run('trace.snapshot().smokePassedAt'),null);
  assert.equal(f.run('trace.snapshot().startup.errorCode'),'test-empty-response');
  assert.equal(f.run('restartRequired'),true);
  await f.run('loadModel()');
  assert.equal(f.instances.length,1);
});

test('the journal distinguishes shader compilation from download before recording a startup failure',async()=>{
  const f=fixture({reload:async()=>{f.instances[0].options.initProgressCallback({progress:.9,text:'Loading GPU shader modules[9/10]'});throw new Error('Device was lost');}});
  await f.run('runStartupTest()');
  assert.equal(f.run('trace.snapshot().startup.stage'),'shader-compile-9');
  assert.equal(f.run('trace.snapshot().startup.errorCode'),'gpu-device-lost');
  assert.equal(f.run('trace.snapshot().startup.status'),'failed');
  assert.equal(f.instances[0].unloads,1);
});

test('the mobile test does not silently fall back to a model with higher memory requirements',async()=>{
  const f=fixture({mobile:true,hasF16:false});
  await f.run('runStartupTest()');
  assert.equal(f.imports.length,0);
  assert.equal(f.run('trace.snapshot().startup.errorCode'),'shader-f16-unavailable');
});
