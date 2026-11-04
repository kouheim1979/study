import { state } from '../state.js';
import { calculateOverallStats, calculatePartStats, calculateTagStats, calculateDifficultyStats, calculateSessionStats, getUnfinishedQuestionsFromSessions } from '../engine/statsEngine.js';
import { getWrongQuestionDetails, getCorrectQuestionDetails, getWeakQuestionDetails, getStrongQuestionDetails, getMistakePatternSummary, getStrengthPatternSummary, getMistakenWordSummary, getWrongWordPatternSummary, formatPerformanceDetailForPrompt } from './analysisData.js';
import { getHistory, getMistakes } from '../storage.js';
import { formatDateTime, formatDuration, clampNumber } from '../utils.js';

export function getDefaultAiPromptOptions(){return{summary:true,part:true,tags:true,diff:true,wrong:true,correctDetails:true,weakDetails:true,strongDetails:true,mistakeSummary:true,strengthSummary:true,choicePattern:true,mistakenWordList:true,wrongWordPattern:true,includeFilledSentences:true,includeQp:true,includeChoices:true,includeExp:true,recent10:false,recent50:false,completed:false,abandoned:false,unanswered:false,weak:false,time:true,request:true,wrongLimit:20,correctLimit:10,weakLimit:20,strongLimit:10};}
export function aiOptionsFromUI(){const keys=['summary','part','tags','diff','wrong','correctDetails','weakDetails','strongDetails','mistakeSummary','strengthSummary','choicePattern','mistakenWordList','wrongWordPattern','includeFilledSentences','includeQp','includeChoices','includeExp','recent10','recent50','completed','abandoned','unanswered','weak','time','request'];const o={};keys.forEach((k)=>{o[k]=Boolean(document.getElementById('cb_'+k)?.checked);});const num=(id,def)=>{const el=document.getElementById(id);const v=Math.round(clampNumber(el&&el.value,1,100,def));if(el)el.value=String(v);return v;};o.wrongLimit=num('wrongLimit',20);o.correctLimit=num('correctLimit',10);o.weakLimit=num('weakLimit',20);o.strongLimit=num('strongLimit',10);return o;}

function getStatsForAi(){return{overall:calculateOverallStats(),parts:calculatePartStats(),tags:calculateTagStats(),diffs:calculateDifficultyStats(),sessions:calculateSessionStats(),history:getHistory(),mistakes:getMistakes(),unfinished:getUnfinishedQuestionsFromSessions()};}

export function buildAiPrompt(o){const st=getStatsForAi();const lines=['あなたはTOEIC学習コーチです。','以下は私の「TOEIC形式 英語トレーナー」の学習データです。','','目的：','私は、自分がどんな問題を間違えやすいのか、逆にどんな問題が得意なのかを知りたいです。','単にPart別の正答率を見るだけでなく、問題文・選択肢・選んだ回答・正解・解説をもとに、苦手パターンと得意パターンを分析してください。','','特に知りたいこと：','1. 私が間違えやすい問題タイプ','2. 私が得意な問題タイプ','3. 間違いが多い文法・語彙・読解パターン','4. 選択肢の選び方の癖','5. 正解できている問題に共通する特徴','6. 苦手問題の優先順位','7. 復習すべきタグ','8. 次に追加すべき練習問題のタイプ','9. 明日からの具体的な学習メニュー','10. 1週間の学習計画','','分析ルール：','- 問題IDだけで判断しないでください。','- 問題文、本文、選択肢、選んだ回答、正解、解説を見て判断してください。','- 正答率だけでなく、間違え方の傾向を見てください。','- 得意な問題も分析し、伸ばすべき強みを教えてください。','- 間違えた単語と正解単語のペアを見て、混同しやすい語彙・前置詞・接続詞・品詞を分析してください。','- 誤答文と正解文を比較して、どの文法・語法が弱いか判断してください。','- 同じような誤答が繰り返されている場合は、優先して復習すべき表現として挙げてください。','- データが少ない場合は「仮説」として書いてください。','- 推測と事実を分けて書いてください。','','学習データ：'];
const detail=(x)=>{const b={questionId:x.questionId,part:x.part,difficulty:x.difficulty,tags:x.tags,category:x.category,isCorrect:x.isCorrect,answeredAt:formatDateTime(x.answeredAt),mistakenWord:x.mistakenWord,correctWord:x.correctWord};if(o.includeFilledSentences){b.sentenceWithMistake=x.sentenceWithMistake;b.sentenceWithCorrectAnswer=x.sentenceWithCorrectAnswer;}if(o.includeQp){b.question=x.question;b.passage=x.passage;}if(o.includeChoices){b.choices={A:x.choices[0]||null,B:x.choices[1]||null,C:x.choices[2]||null,D:x.choices[3]||null};b.selected={index:x.selectedIndex,label:x.selectedIndex===null?null:String.fromCharCode(65+x.selectedIndex),text:x.selectedChoice};b.correct={index:x.correctIndex,label:x.correctIndex===null?null:String.fromCharCode(65+x.correctIndex),text:x.correctChoice};}else{b.selectedIndex=x.selectedIndex;b.correctIndex=x.correctIndex;}if(o.includeExp)b.explanation=x.explanation;return b;};
if(o.summary)lines.push(`【全体サマリー】\n${JSON.stringify({totalAnswers:st.overall.total,totalCorrect:st.overall.correct,accuracy:st.overall.rate,mistakeQuestionCount:st.overall.mistakes},null,2)}`);
if(o.part)lines.push(`【Part別正答率】\n${JSON.stringify(st.parts,null,2)}`);
if(o.tags)lines.push(`【タグ別正答率】\n${JSON.stringify(st.tags,null,2)}`);
if(o.diff)lines.push(`【難易度別正答率】\n${JSON.stringify(st.diffs,null,2)}`);
if(o.wrong)lines.push('【直近で間違えた問題の詳細】\n'+JSON.stringify(getWrongQuestionDetails(o.wrongLimit).map(detail),null,2));
if(o.correctDetails)lines.push('【直近で正解した問題の詳細】\n'+JSON.stringify(getCorrectQuestionDetails(o.correctLimit).map(detail),null,2));
if(o.weakDetails)lines.push('【累計で苦手な問題の詳細】\n'+JSON.stringify(getWeakQuestionDetails(o.weakLimit).map((x)=>formatPerformanceDetailForPrompt(x,o)),null,2));
if(o.strongDetails)lines.push('【累計で得意な問題の詳細】\n'+JSON.stringify(getStrongQuestionDetails(o.strongLimit).map((x)=>formatPerformanceDetailForPrompt(x,o)),null,2));
if(o.mistakeSummary)lines.push('【間違い傾向サマリー】\n'+JSON.stringify(getMistakePatternSummary(),null,2));
if(o.mistakenWordList){const list=getMistakenWordSummary(o.wrongLimit).map((x)=>{if(o.includeFilledSentences)return x;const {sentenceWithMistake,sentenceWithCorrectAnswer,passageWithMistake,passageWithCorrectAnswer,...rest}=x;return rest;});lines.push('【間違えた単語・正解単語一覧】\n'+JSON.stringify(list,null,2));}
if(o.wrongWordPattern)lines.push('【間違えた単語パターン】\n'+JSON.stringify(getWrongWordPatternSummary(),null,2));
if(o.strengthSummary)lines.push('【得意傾向サマリー】\n'+JSON.stringify(getStrengthPatternSummary(),null,2));
if(o.choicePattern)lines.push('【選択肢の誤答パターン】\n'+JSON.stringify(getMistakePatternSummary().choiceConfusionPatterns,null,2));
if(o.recent10)getHistory().slice(-10).forEach((x)=>lines.push(`- 履歴10: ${formatDateTime(x.answeredAt)} ${x.questionId} ${x.isCorrect?'○':'×'}`));
if(o.recent50)getHistory().slice(-50).forEach((x)=>lines.push(`- 履歴50: ${formatDateTime(x.answeredAt)} ${x.questionId} ${x.isCorrect?'○':'×'}`));
if(o.completed)st.sessions.completed.forEach((x)=>lines.push(`- 完了: ${x.sessionId} ${x.mode} ${x.answeredCount}/${x.totalQuestions} ${x.accuracy}%`));
if(o.abandoned)st.sessions.abandoned.forEach((x)=>lines.push(`- 途中終了: ${formatDateTime(x.startedAt)} ${x.mode} ${x.answeredCount}/${x.totalQuestions} 未回答${x.unansweredCount} ${formatDuration(x.durationSeconds)}`));
if(o.unanswered)st.unfinished.forEach((x)=>lines.push(`- 未回答終了: ${x.sessionId} ${x.questionId}`));
if(o.weak)st.mistakes.forEach((id)=>lines.push(`- 苦手: ${id}`));
if(o.time)lines.push(`- 学習時間: 合計${formatDuration(st.sessions.totalSec)} 平均${formatDuration(st.sessions.avgSec)}`);
if(o.request)lines.push('- AIへの依頼文: 実行しやすい手順と優先順位を明確化してください。');
lines.push('','回答形式：','1. 結論','2. 苦手パターン','3. 得意パターン','4. 間違い方の癖','5. 優先して復習すべき内容','6. 追加するとよい練習問題','7. 明日やること','8. 1週間の学習計画');
return lines.join('\n');}

export function genPrompt(){const o=aiOptionsFromUI();state.aiPromptText=buildAiPrompt(o);const area=document.getElementById('promptArea');if(area)area.value=state.aiPromptText;state.aiMessage='プロンプトを生成しました';const msg=document.getElementById('copyMsg');if(msg)msg.textContent=state.aiMessage;}
export async function copyAiPrompt(){const t=document.getElementById('promptArea');if(!t)return;if(!t.value.trim())genPrompt();try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(t.value);}else{t.focus();t.select();if(!document.execCommand('copy'))throw new Error('copy fail');}state.aiMessage='コピーしました';}catch(_){state.aiMessage='コピーできませんでした。手動で選択してコピーしてください';}const msg=document.getElementById('copyMsg');if(msg)msg.textContent=state.aiMessage;}
