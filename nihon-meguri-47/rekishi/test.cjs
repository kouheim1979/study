'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const D=require('./data.js'),C=require('./core.js');
const rng=()=>{let x=213;return()=>((x=(x*1664525+1013904223)>>>0)/4294967296);};
test('81 distinct, sourced people and all 47 prefectures',()=>{
  assert.equal(D.PEOPLE.length,81);assert.equal(new Set(D.PEOPLE.map(p=>p.id)).size,81);
  assert.equal(new Set(D.PEOPLE.map(p=>p.name)).size,81);assert.equal(new Set(D.PREFECTURES).size,47);
  for(const p of D.PEOPLE){assert.ok(D.PREFECTURES.includes(p.pref));assert.ok(D.PREFECTURES.includes(p.mix));assert.ok(D.GROUPS[p.group]);assert.ok(p.reading&&p.clue&&p.note);assert.equal(new URL(p.source).protocol,'https:');assert.ok(C.region(p.pref));}
});
test('birthplace is not the later place of activity',()=>{
  for(const [name,pref]of Object.entries({'伊達政宗':'山形県','福沢諭吉':'大阪府','徳川慶喜':'東京都','近藤勇':'東京都','滝廉太郎':'東京都','豊田佐吉':'静岡県','緒方洪庵':'岡山県'}))assert.equal(D.PEOPLE.find(p=>p.name===name).pref,pref);
});
test('course population is explicit',()=>{
  assert.deepEqual(Object.keys(D.GROUPS).map(k=>C.deck(k,99).length),[8,13,32,28]);
});
test('random deck has no duplicates and caps at available questions',()=>{
  const a=C.deck('all',20,null,rng());assert.equal(a.length,20);assert.equal(new Set(a.map(p=>p.id)).size,20);
  assert.equal(C.deck('warrior',20).length,8);assert.equal(C.deck('all',0).length,0);assert.equal(C.deck('missing',10).length,0);
});
test('review does not inherit the topic filter',()=>{
  const a=C.deck('warrior',20,['p09','p22','p09','unknown']);assert.deepEqual(a.map(p=>p.id).sort(),['p09','p22']);
  assert.deepEqual(C.deck('all',20,[]),[]);
});
test('all 81 people have four unique options, exactly one correct, in both modes',()=>{
  const r=rng();for(let i=0;i<30;i++)for(const p of D.PEOPLE)for(const hard of [false,true]){const a=C.options(p,hard,r);assert.equal(a.length,4);assert.equal(new Set(a).size,4);assert.equal(a.filter(x=>x===p.pref).length,1);for(const x of a)assert.ok(D.PREFECTURES.includes(x));if(hard)assert.ok(a.includes(p.mix));}
});
test('shuffle makes a copy',()=>{const a=[1,2,3];C.shuffle(a,rng());assert.deepEqual(a,[1,2,3]);});
test('bad and old persisted values are safe',()=>{for(const a of [null,undefined,'bad',[],{version:2},17])assert.deepEqual(C.normalise(a),C.blank());});
test('saved statistics are sanitised',()=>{
 const p=C.normalise({version:1,answered:3,correct:9,best:999,rounds:-1,mastered:['p01','p01','unknown'],review:'invalid'});
 assert.equal(p.correct,3);assert.equal(p.best,100);assert.equal(p.rounds,0);assert.deepEqual(p.mastered,['p01']);assert.deepEqual(p.review,[]);
});
test('wrong answer enters review, without duplication',()=>{let p=C.record(C.blank(),'p01',false,false);p=C.record(p,'p01',false,false);assert.equal(p.answered,2);assert.equal(p.correct,0);assert.deepEqual(p.review,['p01']);});
test('hinted correct answer is not yet mastered',()=>{const p=C.record(C.blank(),'p01',true,true);assert.equal(p.correct,1);assert.deepEqual(p.mastered,[]);assert.deepEqual(p.review,['p01']);});
test('unassisted correct answer clears review and awards one stamp',()=>{let p=C.record(C.blank(),'p01',false,false);p=C.record(p,'p01',true,false);p=C.record(p,'p01',true,false);assert.deepEqual(p.review,[]);assert.deepEqual(p.mastered,['p01']);});
test('a new mistake returns a mastered person to review',()=>{let p=C.record(C.blank(),'p01',true,false);p=C.record(p,'p01',false,false);assert.deepEqual(p.mastered,[]);assert.deepEqual(p.review,['p01']);});
test('unknown IDs do not change statistics; recording is immutable',()=>{const p=C.blank();assert.deepEqual(C.record(p,'unknown',true,false),p);C.record(p,'p01',true,false);assert.equal(p.answered,0);});

test('all-course quiz favors Ishikawa, Hiroshima and Wakayama when available',()=>{
  for(const n of [5,10,20]){
    const a=C.deck('all',n,null,rng());
    const favored=a.filter(p=>['石川県','広島県','和歌山県'].includes(p.pref));
    assert.ok(favored.length>=Math.min(2,n),'priority prefectures should appear more often');
    assert.equal(new Set(a.map(p=>p.id)).size,a.length);
  }
});

test('Ishikawa, Hiroshima and Wakayama each have twelve people',()=>{
  for(const pref of ['石川県','広島県','和歌山県']) assert.equal(D.PEOPLE.filter(p=>p.pref===pref).length,12,pref);
});
