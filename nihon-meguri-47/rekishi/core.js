/* Pure quiz/state functions shared by browser and Node regression tests. */
(function(root){
  'use strict';
  const D = typeof module==='object' && module.exports ? require('./data.js') : root.BirthplaceData;
  const ids = new Set(D.PEOPLE.map(p=>p.id));
  const PRIORITY_PREFS = new Set(['石川県','広島県','和歌山県']);
  const blank = () => ({version:1,answered:0,correct:0,mastered:[],review:[],best:0,rounds:0});
  function shuffle(items,rng=Math.random){
    const a=[...items];
    for(let i=a.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
    return a;
  }
  function region(pref){return Object.keys(D.REGIONS).find(k=>D.REGIONS[k].includes(pref)) || '';}
  function deck(group,count,reviewIds=null,rng=Math.random){
    const pool=D.PEOPLE.filter(p=>reviewIds?reviewIds.includes(p.id):(group==='all'||p.group===group));
    const take=Math.max(0,Math.min(pool.length,Number(count)||0));
    if(take===0) return [];
    if(reviewIds||group!=='all') return shuffle(pool,rng).slice(0,take);
    const priority=shuffle(pool.filter(p=>PRIORITY_PREFS.has(p.pref)),rng);
    const others=shuffle(pool.filter(p=>!PRIORITY_PREFS.has(p.pref)),rng);
    const target=Math.min(priority.length,Math.max(1,Math.ceil(take*0.4)));
    return shuffle([...priority.slice(0,target),...others.slice(0,take-target)],rng);
  }
  function options(person,hard=false,rng=Math.random){
    const other=D.PREFECTURES.filter(p=>p!==person.pref);
    const near=shuffle(other.filter(p=>region(p)===region(person.pref)),rng);
    const candidates=hard?[person.mix,...near,...shuffle(other,rng)]:shuffle(other,rng);
    return shuffle([person.pref,...[...new Set(candidates)].filter(p=>other.includes(p)).slice(0,3)],rng);
  }
  function normalise(raw){
    const fresh=blank();
    if(!raw||typeof raw!=='object'||raw.version!==1)return fresh;
    for(const k of ['answered','correct','best','rounds']) fresh[k]=Number.isSafeInteger(raw[k])&&raw[k]>=0?raw[k]:0;
    fresh.correct=Math.min(fresh.correct,fresh.answered);
    fresh.best=Math.min(100,fresh.best);
    for(const k of ['mastered','review']) fresh[k]=Array.isArray(raw[k])?[...new Set(raw[k].filter(x=>ids.has(x)))]:[];
    return fresh;
  }
  function record(progress,id,correct,hinted){
    const p=normalise(progress);
    if(!ids.has(id)) return p;
    p.answered++;
    if(correct)p.correct++;
    if(correct&&!hinted){
      p.mastered=[...new Set([...p.mastered,id])];
      p.review=p.review.filter(x=>x!==id);
    }else{
      p.review=[...new Set([...p.review,id])];
      p.mastered=p.mastered.filter(x=>x!==id);
    }
    return p;
  }
  const api={shuffle,region,deck,options,blank,normalise,record};
  root.BirthplaceCore=api;
  if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
