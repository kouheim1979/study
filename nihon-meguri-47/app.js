import { PREFECTURES, QUESTIONS, CATEGORIES, SOURCES, makeRound, shuffle } from './data.js?v=20260909-modes-2';

const app=document.querySelector('#app');
const icons={
 shuffle:'<path d="m18 14 4 4-4 4M18 2l4 4-4 4M2 18h2.5a6 6 0 0 0 5-3l5-6a6 6 0 0 1 5-3H22M2 6h2.5a6 6 0 0 1 5 3l5 6a6 6 0 0 0 5 3H22"/>',
 pin:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
 flag:'<path d="M4 22V3m0 1c6-6 10 6 16 0v11c-6 6-10-6-16 0"/>',
 utensils:'<path d="M4 2v6a3 3 0 0 0 6 0V2M7 2v20M20 22V2c-5 3-6 10 0 10"/>',
 gem:'<path d="m6 3-5 6 11 13L23 9l-5-6ZM1 9h22M6 3l6 19 6-19M6 3h12"/>',
 ruler:'<path d="m15 2 7 7L9 22l-7-7ZM12 5l3 3M9 8l2 2M6 11l3 3M3 14l2 2"/>',
 arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',
 back:'<path d="M20 12H4m6-6-6 6 6 6"/>',
 check:'<path d="m5 12 4 4L19 6"/>',
 close:'<path d="m6 6 12 12M18 6 6 18"/>',
 trophy:'<path d="M8 21h8m-4-5v5M7 3h10v8a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4"/>',
 repeat:'<path d="m17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3"/>',
 book:'<path d="M12 21V5m0 0C8 2 4 2 2 3v16c3-1 6-1 10 2 4-3 7-3 10-2V3c-2-1-6-1-10 2Z"/>',
 compass:'<circle cx="12" cy="12" r="10"/><path d="m16 8-2 6-6 2 2-6Z"/>',
};
const icon=(name,cls='')=>`<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]||icons.pin}</svg>`;
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ruby=(text,kana)=>`<ruby><span>${escape(text)}</span><rp>（</rp><rt>${escape(kana||'')}</rt><rp>）</rp></ruby>`;
const getCategory=id=>CATEGORIES.find(c=>c.id===id);
let screen='home',category='mix',round=[],index=0,answers=[],isReview=false;
let furigana=true;
let landmarkMode='prefecture';
const landmarkModes=[
 {id:'landmark',name:'この県の名所は？',note:'都道府県を見て、名所を選ぶ'},
 {id:'prefecture',name:'この名所はどこ？',note:'名所を見て、都道府県を選ぶ'},
];

document.querySelector('.site-header').innerHTML=`
 <a class="brand" href="./" data-action="home" aria-label="日本めぐり47 ホーム">
  <span class="brand-mark">47<span class="brand-dot"></span></span>
  <span>日本めぐり<small>都道府県クイズ</small></span>
 </a>
 <label class="reading-toggle"><input type="checkbox" id="reading" checked><span class="switch-track" aria-hidden="true"></span><span>ふりがな</span></label>`;

function mapMarkup({home=false,active=null}={}){
 const visited=new Set(answers.filter(a=>a.correct).map(a=>a.question.prefId));
 const regionIds=['北海道','東北','関東','中部','近畿','中国','四国','九州・沖縄'];
 return `<aside class="map-panel ${home?'map-home':''}" aria-label="${home?'全国47都道府県のタイルマップ':'今回の正解マップ'}">
  <div class="map-top"><span class="eyebrow">${home?'JAPAN / 47 PREFECTURES':'YOUR JOURNEY'}</span>${icon('compass')}</div>
  <div class="map-heading"><h2>${home?'47のふるさとを、<br>ひとつずつ。':'今回の正解マップ'}</h2>${home?'<p>北から南まで、何問わかるかな？</p>':`<p><strong>${visited.size}</strong> 都道府県で正解！</p>`}</div>
  <div class="tile-map" aria-hidden="true">${PREFECTURES.map(p=>`<span class="map-tile region-${regionIds.indexOf(p.region)} ${visited.has(p.id)?'visited':''} ${active===p.id?'active':''} ${p.id===1?'hokkaido':''}" style="grid-column:${p.x+1}${[1,2,7].includes(p.id)?' / span 2':''};grid-row:${p.y+1}${[1,14,30,46].includes(p.id)?' / span 2':''}">${p.short}</span>`).join('')}</div>
  <div class="map-bottom"><span class="map-key"><i></i>${home?'全国47都道府県を収録':'青い県は正解済み'}${active?'・枠は今の答え':''}</span><span class="map-caption">位置・形を簡略化した図</span></div>
 </aside>`;
}

function footer(){
 return `<footer class="site-footer"><span>日本めぐり47</span><details class="sources"><summary>出典・データについて</summary><div class="source-content"><p>県庁所在地・名所・郷土料理・伝統工芸の公開資料を参考に、クイズと解説を作成しています。</p>${Object.values(SOURCES).map(s=>`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${s.name} ↗</a>`).join('')}<p>面積は2026年4月1日時点。境界未定地域を含む参考値も含めた国土地理院の順位を使用しています。地図は位置と形を簡略化したタイル図です。成績はこの画面を開いている間だけ保持されます。</p></div></details></footer>`;
}

function renderHome(){
 const chosen=getCategory(category);
 app.innerHTML=`<div class="home-layout">
  <section class="start-panel" aria-labelledby="home-title">
   <div class="intro"><span class="section-kicker"><span class="tiny-line"></span> 47都道府県・4択クイズ</span><h1 id="home-title" tabindex="-1">クイズで、<br>日本一周。</h1><p>知っている場所も、まだ知らない場所も。<br>10問のクイズでめぐってみよう。</p></div>
   <fieldset class="category-field"><legend><span>ジャンルを選ぶ</span><span class="field-note">1回10問</span></legend>
    <div class="category-grid">${CATEGORIES.map(c=>`<label class="category-card ${category===c.id?'selected':''}" data-category="${c.id}"><input type="radio" name="category" value="${c.id}" ${category===c.id?'checked':''}><span class="category-icon ${c.color}">${icon(c.icon)}</span><span class="category-copy"><strong>${c.name}</strong><small>${c.note}</small></span><span class="radio-mark" aria-hidden="true">${icon('check')}</span></label>`).join('')}</div>
   </fieldset>
   <fieldset class="category-field landmark-mode-field" id="landmark-modes" ${category==='mix'||category==='landmark'?'':'hidden'}><legend><span>名所クイズのモード</span></legend>
    <div class="category-grid">${landmarkModes.map(m=>`<label class="category-card mode-card ${landmarkMode===m.id?'selected':''}" data-mode="${m.id}"><input type="radio" name="landmark-mode" value="${m.id}" ${landmarkMode===m.id?'checked':''}><span class="category-copy"><strong>${m.name}</strong><small>${m.note}</small></span><span class="radio-mark" aria-hidden="true">${icon('check')}</span></label>`).join('')}</div>
   </fieldset>
   <button class="primary start-button" data-action="start"><span>${icon('compass')}10問に挑戦する</span>${icon('arrow')}</button>
   <p class="start-note" id="start-note">${chosen.id==='mix'?'5ジャンルからバランスよく出題':`${QUESTIONS.filter(q=>q.category===category).length}問からランダムに出題`}<span>時間制限なし</span></p>
  </section>
  ${mapMarkup({home:true})}
 </div>${footer()}`;
}

function journey(){
 return `<div class="journey-track" aria-label="${answers.length}問回答済み / 全${round.length}問">${round.map((q,i)=>`<span class="journey-stop ${answers[i]?(answers[i].correct?'done-correct':'done-wrong'):i===index?'current':''}" aria-label="${i+1}問目 ${answers[i]?(answers[i].correct?'正解':'不正解'):i===index?'回答中':'未回答'}">${answers[i]?icon(answers[i].correct?'check':'close'):i+1}</span>`).join('')}</div>`;
}

function renderQuiz(focusQuestion=false){
 const q=round[index];
 const cat=getCategory(q.category);
 const answered=answers[index];
 const score=answers.filter(a=>a.correct).length;
 app.innerHTML=`<div class="quiz-topbar"><button class="text-button" data-action="home">${icon('back')}ホーム</button><span class="round-mode">${isReview?'まちがい復習':getCategory(category).name}</span><span class="score-pill">${icon('check')}<strong>${score}</strong> 正解</span></div>
  <div class="quiz-layout"><section class="question-panel" aria-label="クイズ">
   <div class="question-meta"><span class="question-category ${cat.color}">${icon(cat.icon)}${cat.name}</span><span class="question-count"><strong>${String(index+1).padStart(2,'0')}</strong><span> / ${String(round.length).padStart(2,'0')}</span></span></div>
   <progress class="quiz-progress" max="${round.length}" value="${answers.length}" aria-label="回答した問題数"></progress>
   <div class="question-copy"><span class="question-lead">${q.category==='capital'?'この都道府県の…':q.category==='area'?'広さをくらべてみよう':q.category==='landmark'?(q.landmarkMode==='landmark'?'この都道府県の名所を探そう':'ここは、どこ？'):q.category==='craft'?'職人の技をめぐろう':'名物から探してみよう'}</span><h1 id="question-title" tabindex="-1">${ruby(q.title,q.kana)}</h1><p>${q.prompt}</p>${q.category==='area'?'<small class="area-date">2026年4月1日時点の面積で出題</small>':''}</div>
   <div class="answer-grid" role="group" aria-label="4つの選択肢">${q.options.map((o,i)=>`<button class="answer-button ${answered?(o.correct?'answer-correct':answered.selected===i?'answer-wrong':'answer-muted'):''}" data-answer="${i}" ${answered?'disabled':''}><span class="answer-number">${i+1}</span><span class="answer-label">${ruby(o.label,o.kana)}</span>${answered&&(o.correct||answered.selected===i)?`<span class="answer-status">${icon(o.correct?'check':'close')}<span>${o.correct?'正解':'選んだ答え'}</span></span>`:''}</button>`).join('')}</div>
   <div id="answer-feedback" class="feedback-slot" aria-live="polite" aria-atomic="true">${answered?feedbackMarkup(answered):'<p class="answer-hint">答えをひとつ選んでね。<span class="keyboard-hint">キーボードの 1〜4 でも回答できます</span></p>'}</div>
   ${journey()}
  </section>${mapMarkup({active:answered?q.prefId:null})}</div>${footer()}`;
 if(focusQuestion)document.querySelector('#question-title').focus({preventScroll:true});
}

function feedbackMarkup(answer){
 const q=answer.question;
 const correct=q.options.find(o=>o.correct);
 const p=PREFECTURES.find(p=>p.id===q.prefId);
 return `<div class="feedback ${answer.correct?'positive':'negative'}"><div class="feedback-heading"><span class="feedback-icon">${icon(answer.correct?'check':'book')}</span><div><h2>${answer.correct?'正解！ その調子。':'おぼえて、次へいこう。'}</h2>${answer.correct?'':`<p>正解は <strong>${escape(correct.label)}</strong></p>`}</div></div><p class="explanation">${q.category!=='capital'&&q.category!=='area'?`<strong>${p.name}</strong>。`:''}${escape(q.explanation)}</p>${q.areaOptions?`<div class="area-comparison">${q.areaOptions.map(p=>`<div><span>${p.name}</span><span>全国${p.rank}位</span></div>`).join('')}</div>`:''}<a class="question-source" href="${SOURCES[q.category].url}" target="_blank" rel="noopener noreferrer">${q.category==='area'?'面積データ':q.category==='craft'?'伝統工芸の資料':q.category==='capital'?'都道府県庁一覧':q.category==='food'?'郷土料理の資料':'観光地の資料'}を見る ↗</a></div><button class="primary next-button" data-action="next" id="next-button"><span>${index===round.length-1?'結果を見る':'次の問題へ'}</span>${icon('arrow')}</button>`;
}

function resultMessage(score,total){
 const ratio=score/total;
 return ratio===1?['全問正解！','日本めぐりの達人','すべての問題をクリア。別のジャンルにも挑戦してみよう。']:ratio>=.8?['すばらしい旅でした！','日本めぐりの名人','日本のこと、よく知っているね。あと少しで全問正解！']:ratio>=.5?['いい旅でした！','日本めぐりの旅人','知っている場所が増えたね。まちがえた問題も、もう一度。']:['ここから、旅のはじまり。','日本めぐりの見習い','今日出会った答えを、少しずつ覚えていこう。'];
}

function renderResult(){
 const score=answers.filter(a=>a.correct).length;
 const missed=answers.filter(a=>!a.correct);
 const [headline,title,message]=resultMessage(score,round.length);
 app.innerHTML=`<div class="result-layout"><section class="result-panel" aria-labelledby="result-title">
  <span class="section-kicker">${isReview?'REVIEW COMPLETE':'JOURNEY COMPLETE'}</span>
  <div class="result-trophy">${icon('trophy')}</div><h1 id="result-title" tabindex="-1">${headline}</h1>
  <div class="result-score"><strong>${score}</strong><span>/ ${round.length}<small>問正解</small></span></div>
  <span class="result-rank">${title}</span><p class="result-message">${message}</p>
  <div class="result-actions">${missed.length?`<button class="primary" data-action="review">${icon('repeat')}まちがえた${missed.length}問を復習</button>`:`<button class="primary" data-action="start">${icon('repeat')}新しい10問に挑戦</button>`}<button class="secondary" data-action="home">ジャンルを選びなおす</button></div>
 </section>${mapMarkup()}</div>
 <section class="review-section"><div class="section-heading"><h2>今回のふりかえり</h2><span>${round.length}問の記録</span></div><div class="review-list">${answers.map((a,i)=>`<details class="review-item ${a.correct?'review-correct':'review-wrong'}"><summary><span class="review-number">${String(i+1).padStart(2,'0')}</span><span class="review-symbol">${icon(a.correct?'check':'close')}<span class="sr-only">${a.correct?'正解':'不正解'}</span></span><span class="review-subject"><small>${getCategory(a.question.category).name}</small><strong>${escape(a.question.title)}</strong></span><span class="review-answer">${escape(a.question.options.find(o=>o.correct).label)}</span><span class="review-plus" aria-hidden="true">+</span></summary><div class="review-explanation"><p>${a.question.prompt}</p>${!a.correct?`<p>選んだ答え：${escape(a.question.options[a.selected].label)}</p>`:''}<p><strong>正解：${escape(a.question.options.find(o=>o.correct).label)}</strong></p><p>${escape(a.question.explanation)}</p><a href="${SOURCES[a.question.category].url}" target="_blank" rel="noopener noreferrer">参考資料 ↗</a></div></details>`).join('')}</div></section>${footer()}`;
 document.querySelector('#result-title').focus({preventScroll:true});
}

function start(){
 round=makeRound(category,10,Math.random,landmarkMode);index=0;answers=[];isReview=false;screen='quiz';
 renderQuiz(true);window.scrollTo({top:0,behavior:'instant'});
}
function answer(selected){
 if(screen!=='quiz'||answers[index]||!round[index].options[selected])return;
 const question=round[index];
 answers.push({question,selected,correct:!!question.options[selected].correct});
 renderQuiz();
 document.querySelector('#announcer').textContent=`${question.options[selected].correct?'正解です。':'正解は'+question.options.find(o=>o.correct).label+'です。'} ${question.explanation}`;
 const next=document.querySelector('#next-button');
 next.focus({preventScroll:true});
 // 解説を読んでから進められるよう、自動では次の問題へ送らない。
 document.querySelector('#answer-feedback').scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'nearest'});
}
function next(){
 if(screen!=='quiz'||!answers[index])return;
 if(index===round.length-1){screen='result';renderResult();window.scrollTo({top:0,behavior:'instant'});}
 else {index++;renderQuiz(true);window.scrollTo({top:0,behavior:'instant'});}
}
function review(){
 const missed=answers.filter(a=>!a.correct);
 if(screen!=='result'||!missed.length)return;
 round=shuffle(missed.map(a=>({...a.question,options:shuffle(a.question.options)})));
 index=0;answers=[];isReview=true;screen='quiz';renderQuiz(true);window.scrollTo({top:0,behavior:'instant'});
}
function home(){screen='home';answers=[];round=[];index=0;isReview=false;renderHome();window.scrollTo({top:0,behavior:'instant'});document.querySelector('#home-title').focus({preventScroll:true});}

document.addEventListener('click',event=>{
 const action=event.target.closest('[data-action]');
 if(action){event.preventDefault();({start,next,review,home}[action.dataset.action])?.();return;}
 const option=event.target.closest('[data-answer]');
 if(option)answer(Number(option.dataset.answer));
});
document.addEventListener('change',event=>{
 if(event.target.name==='category'){
  category=event.target.value;
  document.querySelector('#landmark-modes').hidden=category!=='mix'&&category!=='landmark';
  document.querySelectorAll('[data-category]').forEach(card=>card.classList.toggle('selected',card.dataset.category===category));
  document.querySelector('#start-note').innerHTML=`${category==='mix'?'5ジャンルからバランスよく出題':`${QUESTIONS.filter(q=>q.category===category).length}問からランダムに出題`}<span>時間制限なし</span>`;
 }
 if(event.target.name==='landmark-mode'){
  landmarkMode=event.target.value;
  document.querySelectorAll('[data-mode]').forEach(card=>card.classList.toggle('selected',card.dataset.mode===landmarkMode));
 }
 if(event.target.id==='reading'){furigana=event.target.checked;document.body.classList.toggle('hide-readings',!furigana);}
});
document.addEventListener('keydown',event=>{
 if(event.repeat||event.altKey||event.ctrlKey||event.metaKey||event.target.closest('input,textarea,select'))return;
 if(screen==='quiz'&&!answers[index]&&/^[1-4]$/.test(event.key)){event.preventDefault();answer(Number(event.key)-1);}
});
renderHome();
