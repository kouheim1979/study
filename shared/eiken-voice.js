/* Eiken Voice Input (native Web Speech + optional AI transcription)
 * This is part of the user's English study apps. No audio is sent to the
 * AI server unless the user explicitly taps the "AI文字起こし" button.
 */
(function(global){
"use strict";
const API="https://eigo-quest-ai-kouheim-3013.vercel.app/api/transcribe";
let active=null,serial=0;
const supported=()=>!!(global.SpeechRecognition||global.webkitSpeechRecognition);
const log=(op,msg)=>{if(op&&op.state)try{op.state(msg)}catch(e){}};
function tracksStop(stream){if(stream)try{stream.getTracks().forEach(t=>t.stop())}catch(e){}}
function quiet(){try{global.speechSynthesis?.cancel()}catch(e){}}
function cancel(){
 const op=active;
 active=null;serial++;
 if(!op)return;
 op.cancelled=true;
 if(op.timer)clearTimeout(op.timer);
 if(op.controller)try{op.controller.abort()}catch(e){}
 if(op.recognition)try{op.recognition.abort()}catch(e){}
 if(op.recorder&&op.recorder.state!=="inactive")try{op.recorder.stop()}catch(e){}
 tracksStop(op.stream);
}
function begin(onState,onText){
 cancel();
 const op={id:serial,cancelled:false,state:onState,text:onText,timer:null,recognition:null,recorder:null,stream:null,controller:null};
 active=op;
 quiet(); 
 return op;
}
function valid(op){return active===op&&!op.cancelled}
function finish(op,msg){if(!valid(op))return;if(op.timer)clearTimeout(op.timer);op.timer=null;log(op,msg);active=null}
function errorText(err){
 const code=typeof err==="string"?err:err?.error||err?.name||"unknown";
 const names={
 "not-allowed":"マイクが許可されていません。Safariのサイト設定からマイクを許可してください。",
 "service-not-allowed":"このブラウザでは音声認識サービスが使えません。AI文字起こしを試してください。",
 "no-speech":"声が検出されませんでした。静かな場所で再度お試しください。",
 "audio-capture":"マイクが見つからないか、別のアプリで使用中です。",
 "network":"音声認識のネットワークに接続できません。AI文字起こしも選べます。",
 "aborted":"音声認識を終了しました。",
 "language-not-supported":"英語の音声認識が利用できません。",
 "NotAllowedError":"マイクが許可されていません。端末の設定とサイトのマイク権限をご確認ください。",
 "NotFoundError":"マイクが見つかりません。",
 "NotReadableError":"マイクが使用できません。ほかの録音アプリを閉じてください。",
 "SecurityError":"このページではマイクの利用が制限されています。Safariで直接開いてください。"
 };
 return names[code]||"音声認識に失敗しました（"+code+"）。AI文字起こしかキーボードのマイクを試してください。";
}
function nativeSpeech(options){
 const Rec=global.SpeechRecognition||global.webkitSpeechRecognition;
 if(!Rec){options.onState?.("このブラウザは直接音声認識に非対応です。『AI文字起こし』か、キーボードの🎤を使ってください。");return false}
 const op=begin(options.onState,options.onText);
 let heard=false,errored=false;
 try{
  const rec=new Rec();
  op.recognition=rec;
  rec.lang="en-US";rec.continuous=false;rec.interimResults=true;rec.maxAlternatives=1;
  rec.onstart=()=>{if(valid(op))log(op,"🟢 マイク起動中。英語で話してください。")};
  rec.onspeechstart=()=>{if(valid(op))log(op,"🎙 英語を聞き取っています…")};
  rec.onresult=ev=>{
   if(!valid(op))return;
   let finalText="",interim="";
   for(let i=ev.resultIndex||0;i<ev.results.length;i++){
    const p=(ev.results[i][0]?.transcript||"").trim();
    if(ev.results[i].isFinal)finalText+=" "+p;else interim+=" "+p;
   }
   if(finalText.trim()){
    heard=true;
    try{op.text?.(finalText.trim())}catch(e){}
    finish(op,"✅ 認識しました。続ける場合はもう一度マイクを押してください。");
    try{rec.stop()}catch(e){}
   }else if(interim.trim())log(op,"🔎 聞き取り中: "+interim.trim());
  };
  rec.onerror=ev=>{errored=true;finish(op,"⚠️ "+errorText(ev.error||ev))};
  rec.onend=()=>{if(valid(op))finish(op,errored?"⚠️ 音声認識を終了しました。":heard?"✅ 認識しました。":"⚠️ 音声が文字になりませんでした。iPhoneではAI文字起こしがおすすめです。")};
  op.timer=setTimeout(()=>{if(!valid(op)||heard)return;finish(op,"⌛ 音声認識が応答しませんでした。iPhoneのSafariで起きることがあります。『AI文字起こし』を試してください。");try{rec.abort()}catch(e){}},15000);
  log(op,"🎤 マイクの許可を求めています…");
  rec.start();
  return true;
 }catch(e){finish(op,"⚠️ "+errorText(e));return false}
}
function bestMime(){
 if(!global.MediaRecorder?.isTypeSupported)return "";
 return ["audio/mp4","audio/webm;codecs=opus","audio/webm","audio/ogg;codecs=opus"].find(m=>global.MediaRecorder.isTypeSupported(m))||"";
}
function base64(blob){
 return new Promise((resolve,reject)=>{
  const reader=new FileReader();
  reader.onload=()=>resolve(String(reader.result||"").split(",")[1]||"");
  reader.onerror=()=>reject(new Error("音声を読み込めませんでした。"));
  reader.readAsDataURL(blob);
 });
}
async function aiSpeech(options){
 const duration=Math.min(40,Math.max(5,Number(options.maxSeconds)||25));
 if(!navigator.mediaDevices?.getUserMedia||!global.MediaRecorder){
  options.onState?.("このブラウザでは録音に非対応です。Safariで直接開くか、キーボードの🎤を使ってください。");
  return false;
 }
 const op=begin(options.onState,options.onText);
 log(op,"🎤 マイクの許可を確認しています…");
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
  if(!valid(op)){tracksStop(stream);return false}
  op.stream=stream;
  const mime=bestMime();
  const rec=new MediaRecorder(stream,mime?{mimeType:mime}:{});
  op.recorder=rec;
  const chunks=[];
  rec.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data)};
  rec.onerror=()=>{if(valid(op)){tracksStop(op.stream);finish(op,"⚠️ 録音エラーが起きました。もう一度試してください。")}};
  rec.onstop=async()=>{
   tracksStop(op.stream);op.stream=null;
   if(!valid(op))return;
   if(op.timer)clearTimeout(op.timer);op.timer=null;
   const blob=new Blob(chunks,{type:rec.mimeType||mime||chunks[0]?.type||"audio/mp4"});
   if(blob.size<500){finish(op,"⚠️ 録音が短すぎました。少し長めに英語を話してください。");return}
   if(blob.size>2900000){finish(op,"⚠️ 録音が大きすぎます。短く区切って話してください。");return}
   log(op,"⏳ AIで文字起こししています…（録音データを外部サービスへ送信）");
   try{
    const audio=await base64(blob);
    if(!valid(op))return;
    op.controller=new AbortController();
    op.timer=setTimeout(()=>{try{op.controller.abort()}catch(e){}},42000);
    const response=await fetch(API,{
     method:"POST",mode:"cors",credentials:"omit",
     headers:{"Content-Type":"application/json"},
     body:JSON.stringify({audio,mediaType:blob.type}),
     signal:op.controller.signal
    });
    const data=await response.json().catch(()=>({}));
    if(!valid(op))return;
    if(!response.ok)throw new Error((data.error||"サーバーエラー")+"（HTTP "+response.status+"）");
    const value=String(data.text||"").trim();
    if(!value){finish(op,"⚠️ 音声を文字にできませんでした。静かな場所で再度話してください。");return}
    try{op.text?.(value)}catch(e){}
    finish(op,"✅ AI文字起こし完了。正しく認識されたか確認してください。");
   }catch(e){
    if(!valid(op))return;
    const message=e.name==="AbortError"?"文字起こしがタイムアウトしました。":
      /Failed to fetch|NetworkError|Load failed/i.test(String(e.message))?"AIサーバーに接続できません。後で試すか、キーボードの🎤をご利用ください。":String(e.message||"文字起こしが失敗しました。");
    finish(op,"⚠️ "+message);
   }
  };
  rec.start(1000);
  log(op,"🔴 録音中。英語で話して『録音を終了』を押してください（最大"+duration+"秒）。");
  op.timer=setTimeout(()=>{if(valid(op)&&rec.state==="recording")stopAI()},duration*1000);
  return true;
 }catch(e){
  tracksStop(op.stream);
  finish(op,"⚠️ "+errorText(e));
  return false;
 }
}
function stopAI(){
 const op=active;
 if(!op||!op.recorder||op.recorder.state==="inactive")return false;
 if(op.timer)clearTimeout(op.timer);op.timer=null;
 try{op.recorder.stop();log(op,"⏳ 音声を処理しています…");return true}catch(e){finish(op,"⚠️ 録音を終了できませんでした。");return false}
}
function isRecording(){return !!(active&&active.recorder&&active.recorder.state==="recording")}
global.EikenVoice={nativeSpeech,aiSpeech,stopAI,isRecording,cancel,supported};
})(window);