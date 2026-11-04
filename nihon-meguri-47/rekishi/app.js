(function(){
  'use strict';
  const D=window.BirthplaceData,C=window.BirthplaceCore;
  const main=document.getElementById('main'),KEY='ijin-birthplace-v1';
  const settings={group:'all',count:10,hard:false};
  let progress=C.blank(),view='home',round=null,toastTimer;
  const $=s=>document.querySelector(s);
  const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const source=p=>`<a class="source" href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">出典：${esc(p.sourceName)} ↗</a>`;
  const groupOptions=(selected,allLabel='すべてのジャンル')=>`<option value="all">${allLabel}</option>`+Object.entries(D.GROUPS).map(([key,label])=>`<option value="${key}" ${key===selected?'selected':''}>${label}（${D.PEOPLE.filter(p=>p.group===key).length}人）</option>`).join('');
  function storageNotice(){const el=$('#storage-notice');el.textContent='このブラウザでは記録を保存できません。クイズはこのまま遊べます。';el.hidden=false;}
  try{progress=C.normalise(JSON.parse(localStorage.getItem(KEY)));}catch(e){storageNotice();}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(progress));}catch(e){storageNotice();}}
  function toast(message){const el=$('#toast');clearTimeout(toastTimer);el.textContent=message;el.hidden=false;toastTimer=setTimeout(()=>{el.hidden=true;},3500);}
  function topFocus(){window.scrollTo({top:0,behavior:'instant'});main.focus({preventScroll:true});}
  function setTab(name){document.querySelectorAll('.tabs [data-nav]').forEach(b=>{if(b.dataset.nav===name)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});}
  function changeView(next){
    if(view==='quiz'&&round&&!round.finished&&!window.confirm('クイズを終了して戻りますか？回答済みの記録は残ります。'))return;
    view=next;round=null;setTab(next);
    if(next==='book')renderBook();else if(next==='record')renderRecord();else renderHome();
    topFocus();
  }
  function stats(){return `<div class="stats-row"><div class="stat"><div class="stat-label">覚えた人物</div><b>${progress.mastered.length}</b><small>/ ${D.PEOPLE.length}人</small></div><div class="stat"><div class="stat-label">自己ベスト</div><b>${progress.best}</b><small>点</small></div><div class="stat"><div class="stat-label">あとで復習</div><b>${progress.review.length}</b><small>人</small></div></div>`;}
  const scene=`<svg class="scene" viewBox="0 0 500 180" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><circle cx="407" cy="38" r="24" fill="#d9a267"/><path d="M0 97Q74 48 151 82T317 68T500 83V180H0Z" fill="#c1d5ba"/><path d="M0 136Q104 68 228 109T500 92V180H0Z" fill="#98b99e"/><path d="M0 151Q72 117 199 140T500 125V180H0Z" fill="#709d84"/><path d="M255 180Q314 153 347 164T420 154" stroke="#e7d9af" stroke-width="17" fill="none"/><g fill="#476e58"><path d="M292 112h50v27h-50z"/><path d="m282 110 35-20 35 20z"/><path d="M301 89h32v18h-32z"/><path d="m292 89 25-18 25 18z"/><path d="M309 66h16v20h-16z"/><path d="m300 69 17-15 17 15z"/></g><g fill="#eff1dc"><path d="M309 114h6v8h-6zM322 114h6v8h-6zM313 91h8v8h-8z"/></g><path d="M80 129v-31m-16 18 16-23 16 23m-28 2 12-18 12 18M109 139v-30m-14 16 14-22 14 22" fill="#587b60" stroke="#587b60" stroke-width="3" stroke-linejoin="round"/></svg>`;
  function renderHome(){
    main.innerHTML=`<div class="home-grid"><section class="hero"><div class="eyebrow">歴史 × 都道府県クイズ</div><div class="stamp" aria-label="${D.PEOPLE.length}人収録"><span>歴史の旅</span><b>${D.PEOPLE.length}</b><span>人をめぐる</span></div><h1>あの偉人、<br><em>どこ生まれ？</em></h1><p>名前は知っている。<br>でも、ふるさとは意外かもしれない。</p>${scene}<div class="hero-footer">ひとつの名前から、日本を旅しよう。</div></section><section class="settings" aria-labelledby="start-title"><div class="section-label">READY TO EXPLORE?</div><h2 id="start-title">今日の旅をえらぶ</h2><label class="field"><span class="field-label">ジャンル</span><select id="course">${groupOptions(settings.group,`おまかせ · 全${D.PEOPLE.length}人`)}</select></label><div class="setting-row"><label class="field"><span class="field-label">問題数</span><select id="count">${[5,10,20].map(n=>`<option value="${n}" ${settings.count===n?'selected':''}>${n}問</option>`).join('')}</select></label><fieldset class="field"><legend>難しさ</legend><div class="segmented"><label><input type="radio" name="level" value="normal" ${!settings.hard?'checked':''}><span>ふつう</span></label><label><input type="radio" name="level" value="hard" ${settings.hard?'checked':''}><span>むずかしい</span></label></div></fieldset></div><button id="start" class="primary wide start"><span>クイズをはじめる</span><span class="arrow" aria-hidden="true">→</span></button><p id="start-summary" class="start-sub"></p><button id="review-start" class="secondary wide review-start" ${progress.review.length?'':'disabled'}>↻ 間違い・ヒント使用の ${progress.review.length} 人を復習</button></section></div><div class="intro-rule"><span class="rule-mark" aria-hidden="true">◎</span><p><strong>答えるのは「生まれた場所」の、現在の都道府県。</strong><br>育った場所や活躍した場所とは区別します。全問に解説と出典付き。時間制限はありません。</p></div>${stats()}<div class="home-bottom"><p>記録はこのブラウザだけに保存されます。</p><button class="mini-link" data-nav="book">人物図鑑で予習する →</button></div>`;
    $('#course').value=settings.group;
    $('#course').onchange=e=>{settings.group=e.target.value;updateStartSummary();};
    $('#count').onchange=e=>{settings.count=Number(e.target.value);updateStartSummary();};
    document.querySelectorAll('[name=level]').forEach(el=>{el.onchange=e=>{settings.hard=e.target.value==='hard';updateStartSummary();};});
    $('#start').onclick=()=>startRound();
    $('#review-start').onclick=()=>startRound(progress.review);
    updateStartSummary();
  }
  function updateStartSummary(){const n=Math.min(settings.count,D.PEOPLE.filter(p=>settings.group==='all'||p.group===settings.group).length);$('#start-summary').textContent=`${n}問・4択 ／ ${settings.hard?'近い地域や、ゆかりの地が選択肢に':'全国からランダムな選択肢'}`;}
  function startRound(reviewIds=null){
    const people=C.deck(settings.group,reviewIds?reviewIds.length:settings.count,reviewIds);
    if(!people.length){toast('復習する人物はまだいません。');return;}
    round={people,index:0,answers:[],streak:0,maxStreak:0,finished:false,review:!!reviewIds,hard:settings.hard,q:null};
    view='quiz';setTab('home');newQuestion();
  }
  function newQuestion(){const p=round.people[round.index];round.q={person:p,options:C.options(p,round.hard),eliminated:[],hinted:false,answered:false,selected:null};renderQuiz();topFocus();}
  function renderQuiz(){
    const q=round.q,p=q.person,total=round.people.length,done=round.answers.length;
    main.innerHTML=`<div class="quiz-wrap"><div class="quiz-top"><button class="quiet" data-nav="home">← クイズを終了</button><div class="question-number"><b>${String(round.index+1).padStart(2,'0')}</b> / ${String(total).padStart(2,'0')}</div></div><div class="progress-track" role="progressbar" aria-label="回答した問題数" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${done}"><div class="progress-fill" style="width:${done/total*100}%"></div></div><div class="quiz-meta"><span>${round.review?'復習の旅':round.hard?'むずかしい旅':'ふつうの旅'}</span><span>${round.answers.filter(a=>a.correct).length}問正解 · 連続 ${round.streak}</span></div><section class="question-card" aria-labelledby="person-name"><span class="tag">${D.GROUPS[p.group]}</span><p class="person-reading">${p.reading}</p><h1 class="person-name" id="person-name">${p.name}</h1><p class="clue">${p.clue}</p><p class="ask">生まれたのは、どの都道府県？<small>現在の都道府県で答えてください</small></p></section><div class="choices" aria-label="回答の選択肢">${q.options.map((pref,i)=>{
      const correct=q.answered&&pref===p.pref,wrong=q.answered&&pref===q.selected&&!correct,eliminated=q.eliminated.includes(pref);
      return `<button class="choice ${correct?'correct':wrong?'wrong':eliminated?'eliminated':''}" data-choice="${i}" ${q.answered||eliminated?'disabled':''}><span class="choice-index" aria-hidden="true">${correct?'✓':wrong?'×':i+1}</span><span class="choice-label">${pref}</span>${correct?'<span class="choice-annotation">正解</span>':wrong?'<span class="choice-annotation">選んだ答え</span>':''}</button>`;
    }).join('')}</div><div class="help-row"><button id="hint" class="secondary hint-button" ${q.hinted||q.answered?'disabled':''}>${q.hinted?'✓ 2択ヒントを使用':'◇ ヒントで2択にする'}</button><p>正解 100点 ／ ヒント使用の正解 50点</p></div><div id="feedback-slot" aria-live="polite" aria-atomic="true"></div></div>`;
    document.querySelectorAll('[data-choice]').forEach(b=>{b.onclick=()=>answer(Number(b.dataset.choice));});
    $('#hint').onclick=()=>{if(q.answered||q.hinted)return;q.hinted=true;q.eliminated=C.shuffle(q.options.filter(x=>x!==p.pref)).slice(0,2);renderQuiz();toast('選択肢を2つに絞りました。');document.querySelector('.choice:not(:disabled)').focus({preventScroll:true});};
    if(q.answered)renderFeedback();
  }
  function answer(index){
    const q=round&&round.q;if(view!=='quiz'||!q||q.answered||!Number.isInteger(index)||!q.options[index]||q.eliminated.includes(q.options[index]))return;
    q.answered=true;q.selected=q.options[index];const correct=q.selected===q.person.pref;
    round.answers.push({person:q.person,selected:q.selected,correct,hinted:q.hinted,points:correct?(q.hinted?50:100):0});
    round.streak=correct&&!q.hinted?round.streak+1:0;round.maxStreak=Math.max(round.maxStreak,round.streak);
    progress=C.record(progress,q.person.id,correct,q.hinted);save();renderQuiz();
    $('#next').focus({preventScroll:true});$('#feedback-slot').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function renderFeedback(){const a=round.answers[round.answers.length-1],p=a.person;
    $('#feedback-slot').innerHTML=`<section class="feedback ${a.correct?'':'incorrect'}"><div class="feedback-heading"><strong>${a.correct?'✓ 正解！':'あと一歩！ 正解はこちら'}</strong><span class="points">${a.points}点</span></div><div class="reveal-pref">${p.pref}</div><p>${p.note}</p>${source(p)}${a.hinted?'<p class="caption">ヒントを使った人物は、復習リストに残ります。</p>':''}<button id="next" class="primary wide">${round.index+1===round.people.length?'旅の結果を見る':'次の人物へ'} →</button></section>`;
    $('#next').onclick=()=>{if(!round.q.answered)return;if(round.index+1===round.people.length)finishRound();else{round.index++;newQuestion();}};
  }
  function finishRound(){
    if(round.finished)return;round.finished=true;view='result';
    round.score=Math.round(round.answers.reduce((s,a)=>s+a.points,0)/round.answers.length);
    progress.rounds++;progress.best=Math.max(progress.best,round.score);save();renderResult();topFocus();
  }
  function renderResult(){
    const n=round.answers.length,ok=round.answers.filter(a=>a.correct).length,hints=round.answers.filter(a=>a.hinted).length;
    const retry=round.answers.filter(a=>!a.correct||a.hinted).map(a=>a.person.id),title=round.score>=80?'ふるさと名人！':round.score>=50?'歴史の旅人！':'新しい発見の旅！';
    main.innerHTML=`<div class="quiz-wrap"><section class="result-hero"><div class="result-label">JOURNEY COMPLETE</div><h1>${title}</h1><div class="score-ring" style="--score:${round.score}%"><div class="score-inner"><b>${round.score}</b><small>SCORE / 100</small></div></div><p>${ok===n?'全問正解。おみごとです！':'答えを知るたび、ふるさとがひとつ増える。'}</p><div class="result-grid"><div><b>${ok}<small> / ${n}</small></b><small>正解数</small></div><div><b>${round.maxStreak}</b><small>ヒントなし連続正解</small></div><div><b>${hints}</b><small>ヒント使用</small></div></div></section><div class="actions"><button id="again" class="primary">もう一度あそぶ →</button><button id="retry" class="secondary" ${retry.length?'':'disabled'}>この旅の ${retry.length} 人を復習</button></div><div class="help-row"><button id="copy" class="mini-link">結果をコピー</button><button class="mini-link" data-nav="home">ホームに戻る</button></div><div id="copy-area"></div><section class="answer-list"><h2>今回めぐった人物</h2><p class="caption" style="margin-bottom:12px">名前をタップすると、解説と出典を読み返せます。</p>${round.answers.map(a=>`<details class="answer-item"><summary><span class="answer-icon ${a.correct?'':'miss'}">${a.correct?(a.hinted?'△':'✓'):'×'}</span><strong>${a.person.name}</strong><span class="answer-pref">${a.person.pref}</span></summary><p>${a.correct?(a.hinted?'ヒントを使って正解しました。':'ヒントなしで正解しました。'):`選んだ答え：${a.selected}`}</p><p>${a.person.note}</p>${source(a.person)}</details>`).join('')}</section></div>`;
    $('#again').onclick=()=>startRound();$('#retry').onclick=()=>startRound(retry);
    $('#copy').onclick=async()=>{const text=`偉人のふるさと\n${round.score}点・${ok}/${n}問正解（ヒント${hints}回）\n${location.href.split(/[?#]/)[0]}`;try{if(!navigator.clipboard)throw new Error('clipboard unavailable');await navigator.clipboard.writeText(text);toast('結果をコピーしました。');}catch(e){$('#copy-area').innerHTML='<label class="field" style="margin-top:15px"><span class="field-label">長押しで結果をコピーできます</span><textarea class="copy-fallback" rows="4" readonly></textarea></label>';const area=$('#copy-area textarea');area.value=text;area.focus();area.select();}};
  }
  const searchText=s=>s.normalize('NFKC').toLowerCase().replace(/[\s　]/g,'').replace(/[ァ-ヶ]/g,c=>String.fromCharCode(c.charCodeAt(0)-0x60));
  function renderBook(){
    main.innerHTML=`<div class="page-heading"><div><div class="section-label">PEOPLE & PLACES</div><h1>人物図鑑</h1><p>名前とふるさとを、ゆっくりつなげよう。全${D.PEOPLE.length}人。</p></div></div><div class="filter-bar"><label><span class="field-label">人物名・よみがな・都道府県で検索</span><input id="book-search" type="search" placeholder="例：坂本龍馬 ／ りょうま ／ 高知" autocomplete="off"></label><label><span class="field-label">ジャンル</span><select id="book-group">${groupOptions('all')}</select></label></div><p id="book-count" class="book-count" role="status"></p><div id="person-grid" class="person-grid"></div><p class="caption" style="margin-top:22px">答えは現在の都道府県に統一しています。史料の「出身地」を参照し、生誕地と活動地の違いにも注意して収録しています。出典確認日：${D.checked}</p>`;
    $('#book-search').oninput=updateBook;$('#book-group').onchange=updateBook;updateBook();
  }
  function updateBook(){
    const term=searchText($('#book-search').value),group=$('#book-group').value;
    const people=D.PEOPLE.filter(p=>(group==='all'||group===p.group)&&searchText(p.name+p.reading+p.pref+p.clue).includes(term));
    $('#book-count').textContent=`${people.length}人を表示 ／ 全${D.PEOPLE.length}人`;
    $('#person-grid').innerHTML=people.length?people.map(p=>`<article class="person-entry"><div class="entry-head"><span class="tag">${D.GROUPS[p.group]}</span>${progress.mastered.includes(p.id)?'<span class="earned">✓</span>':''}</div><h2>${p.name}</h2><p class="reading">${p.reading}</p><div class="entry-pref">◎ ${p.pref}</div><details><summary>どんな人物？</summary><p><strong>${p.clue}</strong></p><p>${p.note}</p>${source(p)}</details></article>`).join(''):'<p class="empty">該当する人物がいません。<br>検索語やジャンルを変えてみてください。</p>';
  }
  function renderRecord(){
    const accuracy=progress.answered?Math.round(progress.correct/progress.answered*100):0;
    main.innerHTML=`<div class="page-heading"><div><div class="section-label">YOUR TRAVEL JOURNAL</div><h1>旅の記録</h1><p>くり返すほど、名前と場所がつながっていく。</p></div></div>${stats()}<p class="caption" style="margin-top:14px">${progress.rounds}回の旅を完走 ／ 累計${progress.answered}問に回答 ／ 正答率${accuracy}%（ヒント使用を含む）</p><section class="passport"><h2>人物スタンプ帳</h2><p>ヒントなしで正解するとスタンプを獲得。間違えた人物やヒントを使った人物は、もう一度復習しましょう。</p><div class="stamp-grid">${D.PEOPLE.map(p=>`<div class="person-stamp ${progress.mastered.includes(p.id)?'collected':''}" aria-label="${p.name}：${progress.mastered.includes(p.id)?'習得済み':'未習得'}"><span class="symbol" aria-hidden="true">${progress.mastered.includes(p.id)?'✓':p.name.charAt(0)}</span><small>${p.name}</small></div>`).join('')}</div></section><div class="actions"><button id="record-review" class="primary" ${progress.review.length?'':'disabled'}>復習 ${progress.review.length} 人をめぐる →</button><button class="secondary" data-nav="home">新しい旅へ</button></div><p class="caption">記録はこの端末・ブラウザだけに保存されます。ログインやサーバーへの送信はありません。ブラウザのデータを消すと記録も消えます。</p><div class="reset-area"><button id="reset" class="mini-link">このクイズの記録をリセット</button></div>`;
    $('#record-review').onclick=()=>startRound(progress.review);
    $('#reset').onclick=()=>$('#reset-dialog').showModal();
  }
  document.addEventListener('click',e=>{const target=e.target.closest('[data-nav]');if(target){e.preventDefault();changeView(target.dataset.nav);}});
  document.addEventListener('keydown',e=>{if(view!=='quiz'||e.repeat||e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(/^[1-4]$/.test(e.key)){e.preventDefault();answer(Number(e.key)-1);}});
  $('#cancel-reset').onclick=()=>$('#reset-dialog').close();
  $('#confirm-reset').onclick=()=>{progress=C.blank();save();$('#reset-dialog').close();renderRecord();topFocus();toast('このクイズの記録をリセットしました。');};
  renderHome();
})();
