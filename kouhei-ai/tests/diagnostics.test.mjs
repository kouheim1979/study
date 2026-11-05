import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const html=await readFile(new URL('../index.html',import.meta.url),'utf8');
const source=html.match(/<script id="kouhei-diagnostics">([\s\S]*?)<\/script>/)[1];
const context=vm.createContext({setTimeout,clearTimeout,Uint32Array});
vm.runInContext(source,context);
const D=vm.runInContext('StudyDiagnostics',context);

test('journal preserves the last unfinished step across a page restart',()=>{
  let value;
  const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
  const first=D.journal(storage);first.start('model-start');first.step('model-reload');
  const next=D.journal(storage);
  assert.equal(next.snapshot().previous.code,'model-reload');
  next.start('diagnostic-start');next.end('diagnostic-passed');
  assert.equal(JSON.parse(value).active,null);
  for(let i=0;i<100;i++)next.record('test-event');
  assert.equal(next.snapshot().events.length,60);
});

test('a completed diagnostic survives a page restart and does not run again automatically',()=>{
  let value;
  const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
  const first=D.journal(storage);
  assert.equal(D.shouldAutoRun(first.snapshot().diagnostic),true);
  first.beginDiagnostic();first.stepDiagnostic('gpu-readback');
  first.finishDiagnostic({ok:true,shaderF16:true,maxBufferSize:1024});
  const next=D.journal(storage),d=next.snapshot().diagnostic;
  assert.equal(d.status,'complete');
  assert.equal(d.result.ok,true);
  assert.equal(d.result.maxBufferSize,1024);
  assert.ok(d.completedAt);
  assert.equal(D.shouldAutoRun(d),false);
});

test('a diagnostic interrupted by navigation keeps its last stage without an automatic retry loop',()=>{
  let value;
  const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
  const first=D.journal(storage);
  first.beginDiagnostic();first.stepDiagnostic('gpu-shader');
  const next=D.journal(storage),d=next.snapshot().diagnostic;
  assert.equal(d.status,'interrupted');
  assert.equal(d.stage,'gpu-shader');
  assert.equal(d.result,null);
  assert.equal(next.snapshot().previous.code,'gpu-shader');
  assert.equal(D.shouldAutoRun(d),false);
});

test('storage errors keep the current result in memory and expose that it could not be saved',()=>{
  const trace=D.journal({getItem(){throw new Error('blocked');},setItem(){throw new Error('quota');}});
  trace.beginDiagnostic();trace.finishDiagnostic({ok:false,reason:'gpu-timeout'});
  assert.equal(trace.snapshot().diagnostic.result.reason,'gpu-timeout');
  assert.equal(trace.snapshot().storageWritable,false);
});

test('a page restart during model loading preserves the stage and requires the small-model test again',()=>{
  let value;const storage={getItem:()=>value,setItem:(_,v)=>{value=v;}};
  const first=D.journal(storage);
  first.startStartup('smoke',D.SMOKE_MODEL);first.finishStartup('complete');
  assert.ok(first.snapshot().smokePassedAt);
  first.startStartup('model','Qwen2.5-0.5B-Instruct-q4f16_1-MLC');first.step('weights-to-gpu-6');
  const next=D.journal(storage),saved=next.snapshot();
  assert.equal(saved.startup.status,'interrupted');
  assert.equal(saved.startup.stage,'weights-to-gpu-6');
  assert.equal(saved.smokePassedAt,null);
});

test('restored diagnostic results only contain approved diagnostic fields',()=>{
  const value=JSON.stringify({diagnostic:{version:'1.0.4',status:'complete',stage:'gpu-passed',result:{ok:true,shaderF16:true,token:'private',messages:['private'],maxBufferSize:Infinity}}});
  const trace=D.journal({getItem:()=>value,setItem(){}});
  assert.deepEqual(JSON.parse(JSON.stringify(trace.snapshot().diagnostic.result)),{ok:true,shaderF16:true});
});

test('the UI blocks empty-result sharing and enables it after the actual diagnostic completes',async()=>{
  const elements=new Map(),trace=D.journal({getItem:()=>null,setItem(){}});
  let copied;
  const ui=vm.createContext({
    StudyDiagnostics:D,trace,SAFE_LOCAL:true,MOBILE_LOCAL:true,restartRequired:false,state:{model:'Qwen2.5-0.5B-Instruct-q4f16_1-MLC'},
    window:{isSecureContext:true},
    navigator:{userAgent:'test',platform:'test',clipboard:{writeText:async text=>{copied=JSON.parse(text);}}},
    $:id=>{if(!elements.has(id))elements.set(id,{textContent:'',value:'',disabled:false});return elements.get(id);}
  });
  const uiSource=html.slice(html.indexOf('function diagnosticsReport()'),html.indexOf('// Use the supported main-window engine.'));
  vm.runInContext(`let loading=false,busy=false,diagnosticBusy=false;const guard=()=>true;function renderEngine(){renderDiagnostics();}${uiSource}`,ui);
  vm.runInContext('renderDiagnostics();copyDiagnostics()',ui);
  assert.equal(elements.get('copyDiagnostics').disabled,true);
  assert.equal(copied,undefined);
  await vm.runInContext('runDiagnostics()',ui);
  vm.runInContext('copyDiagnostics()',ui);
  assert.equal(elements.get('copyDiagnostics').disabled,false);
  assert.equal(copied.diagnosticState,'complete');
  assert.equal(copied.result.reason,'gpu-unavailable');
  assert.match(elements.get('diagnosticResult').textContent,/診断完了/);
});

test('missing GPU finishes without importing a model or runtime',async()=>{
  const result=await D.probeGPU(undefined);
  assert.equal(result.ok,false);
  assert.equal(result.reason,'gpu-unavailable');
});

function fakeGPU(fail=false){
  const buffers=[];let destroyed=false;
  const device={
    createBuffer:options=>{const b={...options,destroyed:false,destroy(){this.destroyed=true;},mapAsync:async()=>{},getMappedRange:()=>new Uint32Array([2,4,6,8]).buffer,unmap(){}};buffers.push(b);return b;},
    queue:{writeBuffer(){},submit(){}},createShaderModule:()=>({}),
    createComputePipelineAsync:async()=>{if(fail)throw new Error('shader failure');return {getBindGroupLayout:()=>({})};},
    createBindGroup:()=>({}),
    createCommandEncoder:()=>({beginComputePass:()=>({setPipeline(){},setBindGroup(){},dispatchWorkgroups(){},end(){}}),copyBufferToBuffer(){},finish(){return {};}}),
    destroy(){destroyed=true;},
  };
  return {gpu:{requestAdapter:async()=>({features:new Set(['shader-f16']),limits:{maxBufferSize:1024,maxStorageBufferBindingSize:512},requestDevice:async()=>device})},buffers,isDestroyed:()=>destroyed};
}

test('small compute probe uses only two 16-byte buffers and frees them on success',async()=>{
  const f=fakeGPU(),stages=[];
  const result=await D.probeGPU(f.gpu,s=>stages.push(s));
  assert.equal(result.ok,true);
  assert.deepEqual(f.buffers.map(b=>b.size),[16,16]);
  assert.ok(f.buffers.every(b=>b.destroyed));assert.ok(f.isDestroyed());
  assert.equal(stages.at(-1),'gpu-passed');
});

test('GPU resources are also destroyed if shader initialization fails',async()=>{
  const f=fakeGPU(true);
  await assert.rejects(D.probeGPU(f.gpu),/shader failure/);
  assert.ok(f.buffers.every(b=>b.destroyed));assert.ok(f.isDestroyed());
});

test('timeout returns promptly if adapter lookup hangs',async()=>{
  await assert.rejects(D.probeGPU({requestAdapter:()=>new Promise(()=>{})},()=>{},10),/GPU_TIMEOUT/);
});
