const state={data:emptyLearningData(),view:'home',activeArticleId:null,sentenceIndex:0,repeatCount:1,playing:false,repeatDone:0,reviewQueue:[],reviewIndex:0,reviewMode:'saved',toastTimer:null,currentSource:'text',fileText:'',filePairs:null};
const $=id=>document.getElementById(id);const $$=selector=>[...document.querySelectorAll(selector)];
function emptyLearningData(){return{articles:[],folders:[],saved:[],lastSession:null,review:{},repeatCount:1,speaking:{messages:[],cards:[],grammarErrors:[]},listeningSeconds:0,dayStamp:'',streak:0,lastStudyDay:''}}
function saveData(){if(typeof window.saveLearningData==='function')window.saveLearningData(state.data)}
function todayKey(){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date())}
function todayLabel(){return new Intl.DateTimeFormat('zh-TW',{timeZone:'Asia/Taipei',year:'numeric',month:'long',day:'numeric',weekday:'long'}).format(new Date())}
function escapeHtml(value=''){return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function activeArticle(){return state.data.articles.find(a=>a.id===state.activeArticleId)}
function sentenceKey(articleId,index){return `${articleId}:${index}`}
function splitSentences(text){return(text.replace(/\s+/g,' ').match(/[^.!?]+(?:[.!?]+["')\]]*)?|[^.!?]+$/g)||[]).map(s=>s.trim()).filter(s=>s.length>1)}
function setView(view){stopPlayback();state.view=view;$$('.view').forEach(v=>v.classList.remove('active'));const target=$(`${view}View`);if(target)target.classList.add('active');$$('.nav-item').forEach(btn=>btn.classList.toggle('active',btn.dataset.view===view||view==='player'&&btn.dataset.view==='library'));$('pageTitle').textContent=({home:'今日學習',library:'我的文章',player:'聆聽練習',saved:'收藏句子',review:'間隔複習'})[view]||'今日學習';if(view==='shared')$('pageTitle').textContent='\u516c\u958b\u5206\u4eab';render();if(view==='shared')loadSharedLibrary();window.scrollTo({top:0,behavior:'smooth'})}
function showToast(message){const toast=$('toast');toast.textContent=message;toast.classList.add('show');clearTimeout(state.toastTimer);state.toastTimer=setTimeout(()=>toast.classList.remove('show'),2400)}
let youtubeTitleRequest = 0;
let youtubeTitleTimer = null;
function setYoutubeTitleStatus(state, text) {
  const status = $('youtubeTitleStatus');
  if (!status) return;
  status.dataset.state = state;
  status.textContent = text;
  status.classList.toggle('is-visible', Boolean(text));
}
async function fetchYoutubeArticleTitle() {
  const rawUrl = $('articleSourceUrl').value.trim();
  if ($('articleSourceType').value !== 'youtube' || !rawUrl) { setYoutubeTitleStatus('', ''); return; }
  let url;
  try { url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl); }
  catch (_) { setYoutubeTitleStatus('error', '網址格式不正確，請貼上 YouTube 影片網址。'); return; }
  if (!['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtube-nocookie.com', 'youtube-nocookie.com'].includes(url.hostname.toLowerCase())) {
    setYoutubeTitleStatus('error', '這不是 YouTube 網址，請貼上 YouTube 影片網址。');
    return;
  }
  const requestId = ++youtubeTitleRequest;
  setYoutubeTitleStatus('loading', '正在取得 YouTube 影片標題…');
  const endpoint = new URL('https://www.youtube.com/oembed');
  endpoint.searchParams.set('url', url.href);
  endpoint.searchParams.set('format', 'json');
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('YouTube title unavailable');
    const metadata = await response.json();
    if (requestId !== youtubeTitleRequest) return;
    if (!metadata.title) throw new Error('YouTube title missing');
    const title = $('articleTitle');
    let filled = false;
    if (!title.value.trim() || title.dataset.youtubeAutofilledTitle === title.value) {
      title.value = metadata.title;
      title.dataset.youtubeAutofilledTitle = title.value;
      filled = true;
    }
    setYoutubeTitleStatus('success', filled ? '已取得並填入影片標題；你也可以自行修改。' : '已取得影片標題，已保留你手動輸入的標題。');
  } catch (_) {
    if (requestId === youtubeTitleRequest) setYoutubeTitleStatus('error', '取得標題失敗，請確認影片可公開瀏覽，或手動輸入標題。');
  }
}
function scheduleYoutubeTitleLookup() {
  clearTimeout(youtubeTitleTimer);
  youtubeTitleRequest++;
  const hasYoutubeUrl = $('articleSourceType')?.value === 'youtube' && $('articleSourceUrl')?.value.trim();
  if (hasYoutubeUrl) setYoutubeTitleStatus('loading', '正在取得 YouTube 影片標題…');
  else setYoutubeTitleStatus('', '');
  youtubeTitleTimer = setTimeout(fetchYoutubeArticleTitle, 250);
}
// app.js is loaded at the end of the document, so bind this independently of the main UI setup.
$('articleSourceUrl')?.addEventListener('input', scheduleYoutubeTitleLookup);
$('articleSourceType')?.addEventListener('change', scheduleYoutubeTitleLookup);
function openImport(source='text'){state.editingArticleId=null;state.currentSource=source;state.fileText='';state.filePairs=null;$('articleTitle').value='';$('articleText').value='';$('modalTitle').textContent='新增文章';$('createArticle').textContent='儲存並開始聽';$('importError').textContent='';switchSource(source);$('importModal').classList.remove('hidden');setTimeout(()=>$(state.editingArticleId?'articleTitle':'articleSourceUrl').focus(),30)}
function closeImport(){state.editingArticleId=null;$('importModal').classList.add('hidden')}
function switchSource(source){state.currentSource=source;$$('.source-tab').forEach(t=>t.classList.toggle('active',t.dataset.source===source));$('textSource').classList.toggle('hidden',source!=='text');$('fileSource').classList.toggle('hidden',source!=='file')}
function render(){renderHome();renderLibrary();renderSaved();renderReview();if(state.view==='player')renderPlayer();if(state.view==='shared')renderShared();$('savedCount').textContent=state.data.saved.length+(state.data.speaking?.cards||[]).length}
function renderHome(){const total=state.data.articles.reduce((n,a)=>n+a.sentences.length,0);$('totalSentences').textContent=total;$('todayMinutes').textContent=Math.floor((state.data.listeningSeconds||0)/60);const due=state.data.saved.filter(item=>(item.dueAt||0)<=Date.now()).length+(state.data.speaking?.cards||[]).filter(item=>(item.dueAt||0)<=Date.now()).length;$('dueCount').textContent=due;$('todayDate').textContent=todayLabel();$('streakText').textContent=state.data.streak?`連續學習 ${state.data.streak} 天`:'開始你的第一天';const last=state.data.lastSession;const article=last&&state.data.articles.find(a=>a.id===last.articleId)||state.data.articles[0];const container=$('continueCard');if(!article){container.innerHTML='<div class="empty-continue"><span>✧</span><div>還沒有開始練習。挑一段喜歡的英文，從第一句開始吧。</div></div>';return}const pct=Math.round((article.currentIndex/article.sentences.length)*100)||0;const label=article.title.split(/\s+/).slice(0,3).join(' ');container.innerHTML=`<div class="continue-cover"><span>LISTENING NOTES</span><strong>${escapeHtml(label)}</strong></div><div class="continue-info"><h3>${escapeHtml(article.title)}</h3><p>${article.sentences.length} 句 · 上次聽到第 ${Math.min(article.currentIndex+1,article.sentences.length)} 句</p><div class="continue-progress"><div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div><span>${pct}%</span></div></div><button class="continue-button" data-resume="${article.id}">繼續聆聽 <span>→</span></button>`;container.querySelector('[data-resume]').addEventListener('click',()=>openArticle(article.id))}
function renderPlayerBase(){const article=activeArticle();if(!article)return;state.repeatCount=[1,2,3,5].includes(Number(state.data.repeatCount))?Number(state.data.repeatCount):1;state.sentenceIndex=Math.min(Math.max(0,state.sentenceIndex),article.sentences.length-1);const idx=state.sentenceIndex;const sentence=article.sentences[idx];$('playerTitle').textContent=article.title;$('playerProgressLabel').textContent=`第 ${idx+1} 句，共 ${article.sentences.length} 句`;$('playerDuration').textContent=`約 ${Math.max(1,Math.ceil(article.sentences.length*8/60))} 分鐘`;$('playerProgress').style.width=`${Math.round(idx/article.sentences.length*100)}%`;$('sentenceIndex').textContent=`${String(idx+1).padStart(2,'0')} / ${String(article.sentences.length).padStart(2,'0')}`;$('sentenceEnglish').textContent=sentence.english;$('sentenceChinese').textContent=sentence.chinese||'Translation missing';$('previousSentence').disabled=idx===0;$('nextSentence').disabled=idx===article.sentences.length-1;const saved=state.data.saved.some(s=>s.articleId===article.id&&s.sentenceIndex===idx);$('bookmarkButton').classList.toggle('saved',saved);$('bookmarkButton').textContent=saved?'♥':'♡';const pct=Math.round(article.currentIndex/article.sentences.length*100)||0;$('asideProgress').textContent=`${pct}%`;$('asideProgressBar').style.width=`${pct}%`;$('asideSentences').textContent=`${article.sentences.length} 句 · 目前在第 ${idx+1} 句`;$('playGlyph').textContent=state.playing?'Ⅱ':'▶';$('playLabel').textContent=state.playing?'暫停':'播放';$$('#repeatControl button').forEach(b=>b.classList.toggle('selected',Number(b.dataset.repeat)===state.repeatCount))}
function renderSaved(){const list=$('savedList');$('savedSummary').textContent=`${state.data.saved.length} 句收藏`;list.innerHTML=state.data.saved.map((item,i)=>{const article=state.data.articles.find(a=>a.id===item.articleId);if(!article)return'';const sentence=article.sentences[item.sentenceIndex];if(!sentence)return'';return`<article class="saved-item"><div class="saved-en">${escapeHtml(sentence.english)}</div><div class="saved-zh">${escapeHtml(sentence.chinese||'Translation missing')}</div><div class="saved-meta">${escapeHtml(article.title)} · ${item.dueAt&&item.dueAt>Date.now()?'下次複習 '+new Date(item.dueAt).toLocaleDateString('zh-TW'):'待複習'}</div><div class="saved-actions"><button class="small-icon-button" aria-label="播放句子" data-play-saved="${i}">▶</button><button class="small-icon-button" aria-label="取消收藏" data-remove-saved="${i}">♥</button></div></article>`}).join('');list.querySelectorAll('[data-play-saved]').forEach(b=>b.addEventListener('click',()=>{const item=state.data.saved[Number(b.dataset.playSaved)];openArticle(item.articleId,item.sentenceIndex)}));list.querySelectorAll('[data-remove-saved]').forEach(b=>b.addEventListener('click',()=>{state.data.saved.splice(Number(b.dataset.removeSaved),1);saveData();render()}));$('emptySaved').classList.toggle('hidden',state.data.saved.length>0)}
function renderReviewBase(){const due=state.reviewQueue.length?state.reviewQueue:[...state.data.saved.filter(item=>(item.dueAt||0)<=Date.now()).map(item=>({...item,_reviewType:'saved'})),...(state.data.speaking?.cards||[]).filter(item=>(item.dueAt||0)<=Date.now()).map(item=>({...item,_reviewType:'speaking'}))];$('reviewEmpty').classList.toggle('hidden',due.length>0);$('reviewCard').classList.toggle('hidden',due.length===0);if(!due.length)return;state.reviewQueue=due;state.reviewIndex=Math.min(state.reviewIndex,due.length-1);const item=due[state.reviewIndex];let english='',chinese='';if(item._reviewType==='speaking'){english=item.text||'';chinese=item.meaning||item.context||'\u9019\u5f35\u5361\u5c1a\u672a\u586b\u5beb\u88dc\u5145\u8aaa\u660e\u3002'}else{const article=state.data.articles.find(a=>a.id===item.articleId),sentence=article?.sentences[item.sentenceIndex];if(!sentence){state.reviewQueue.splice(state.reviewIndex,1);renderReview();return}english=sentence.english;chinese=sentence.chinese||'Translation missing'}$('reviewQueue').textContent=(state.reviewIndex+1)+' / '+due.length;$('reviewEnglish').textContent=english;$('reviewChinese').textContent=chinese;$('reviewLabel').textContent=item._reviewType==='speaking'?'\u5148\u56de\u60f3\u5361\u7247\u5167\u5bb9':'\u5148\u5728\u5fc3\u88e1\u60f3\u60f3\u7ffb\u8b6f';$('revealAnswer').innerHTML=item._reviewType==='speaking'?'\u986f\u793a\u7b54\u6848 <span>&#8595;</span>':'\u986f\u793a\u7ffb\u8b6f <span>?</span>';$('answerArea').classList.add('hidden');$('revealAnswer').classList.remove('hidden');$('reviewBookmark').classList.toggle('hidden',item._reviewType==='speaking');$('reviewBookmark').classList.toggle('saved',item._reviewType!=='speaking');$('reviewBookmark').textContent=item._reviewType==='speaking'?'\u2726':'\u2665'}
function openArticle(id,index){const article=state.data.articles.find(a=>a.id===id);if(!article)return;state.activeArticleId=id;state.sentenceIndex=index??article.currentIndex??0;state.data.lastSession={articleId:id,sentenceIndex:state.sentenceIndex};saveData();setView('player')}
function changeSentence(delta){const article=activeArticle();if(!article)return;stopPlayback();state.sentenceIndex=Math.min(article.sentences.length-1,Math.max(0,state.sentenceIndex+delta));article.currentIndex=state.sentenceIndex;state.data.lastSession={articleId:article.id,sentenceIndex:state.sentenceIndex};saveData();renderPlayer()}
function toggleBookmark(){const article=activeArticle();if(!article)return;const index=state.sentenceIndex;const found=state.data.saved.findIndex(s=>s.articleId===article.id&&s.sentenceIndex===index);if(found>=0){state.data.saved.splice(found,1);showToast('已從收藏移除')}else{state.data.saved.unshift({articleId:article.id,sentenceIndex:index,addedAt:Date.now(),dueAt:Date.now(),intervalDays:0,repetitions:0});showToast('已加入收藏句子')}saveData();render()}
function speak(text,lang='en-US',rate=1){if(!('speechSynthesis'in window)){showToast('這個瀏覽器不支援語音播放');return}window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=lang;utterance.rate=rate;window.speechSynthesis.speak(utterance)}
function speakCurrent(lang='en-US',rate=1){const article=activeArticle();const sentence=article?.sentences[state.sentenceIndex];if(sentence)speak(lang==='zh-TW'?(sentence.chinese||'Translation missing'):sentence.english,lang,rate)}
function markStudy(){const today=todayKey();if(state.data.lastStudyDay!==today){if(state.data.lastStudyDay){const yesterday=new Date(`${today}T00:00:00+08:00`);yesterday.setDate(yesterday.getDate()-1);const previous=yesterday.toLocaleDateString('en-CA',{timeZone:'Asia/Taipei'});state.data.streak=state.data.lastStudyDay===previous?(state.data.streak||0)+1:1}else state.data.streak=1;state.data.lastStudyDay=today}state.data.listeningSeconds=(state.data.listeningSeconds||0)+8;saveData()}
function playLoop(){if(!state.playing)return;const article=activeArticle(),sentence=article?.sentences[state.sentenceIndex];if(!sentence){stopPlayback();return}const utterance=new SpeechSynthesisUtterance(sentence.english);utterance.lang='en-US';utterance.onend=()=>{if(!state.playing)return;const zh=(sentence.chinese||'').trim();const next=()=>{if(!state.playing)return;state.repeatDone++;if(state.repeatDone<state.repeatCount){setTimeout(playLoop,450);return}state.repeatDone=0;markStudy();if(state.sentenceIndex<article.sentences.length-1){state.sentenceIndex++;article.currentIndex=state.sentenceIndex;state.data.lastSession={articleId:article.id,sentenceIndex:state.sentenceIndex};saveData();renderPlayer();setTimeout(playLoop,400)}else{stopPlayback();article.currentIndex=article.sentences.length;saveData();renderPlayer();showToast('這篇文章聽完了，做得很好。')}};if(zh&&'speechSynthesis'in window){const translation=new SpeechSynthesisUtterance(zh);translation.lang='zh-TW';translation.rate=.94;translation.onend=()=>setTimeout(next,350);translation.onerror=next;window.speechSynthesis.speak(translation)}else next()};utterance.onerror=()=>{if(state.playing){stopPlayback();showToast('英文語音播放失敗')}};window.speechSynthesis.speak(utterance)}
function startPlayback(){const article=activeArticle();if(!article)return;if(state.sentenceIndex>=article.sentences.length-1&&article.currentIndex>=article.sentences.length){state.sentenceIndex=0;article.currentIndex=0}state.playing=true;state.repeatDone=0;renderPlayer();playLoop()}
function stopPlayback(){if(state.playing&&'speechSynthesis'in window)window.speechSynthesis.cancel();state.playing=false;const glyph=$('playGlyph'),label=$('playLabel');if(glyph){glyph.textContent='▶';label.textContent='播放'}}
function startReview(){const now=Date.now();state.reviewMode='saved';state.reviewQueue=[...state.data.saved.filter(item=>(item.dueAt||0)<=now).map(item=>({...item,_reviewType:'saved'})),...(state.data.speaking?.cards||[]).filter(item=>(item.dueAt||0)<=now).map(item=>({...item,_reviewType:'speaking'}))];state.reviewIndex=0;if(!state.reviewQueue.length){showToast('\u76ee\u524d\u6c92\u6709\u5f85\u8907\u7fd2\u7684\u53e5\u5b50\u6216\u53e3\u8aaa\u5361');return}setView('review')}
function rateReview(rating){const item=state.reviewQueue[state.reviewIndex];if(!item)return;const stored=item._reviewType==='speaking'?state.data.speaking?.cards?.find(card=>card.id===item.id):state.data.saved.find(saved=>saved.articleId===item.articleId&&saved.sentenceIndex===item.sentenceIndex);if(stored){const now=Date.now();stored.repetitions=(stored.repetitions||0)+(rating==='again'?0:1);stored.intervalDays=rating==='easy'?4:rating==='good'?Math.max(.01,(stored.intervalDays||0)*2||.007):rating==='hard'?Math.max(.004,(stored.intervalDays||0)*1.2||.004):0;stored.dueAt=now+(rating==='again'?60000:rating==='hard'?6*60000:rating==='good'?10*60000:4*86400000);stored.lastRating=rating;stored.lastReviewedAt=now}state.reviewQueue.splice(state.reviewIndex,1);if(state.reviewIndex>=state.reviewQueue.length)state.reviewIndex=0;saveData();renderReview();renderHome();if(!state.reviewQueue.length)showToast('\u672c\u8f2a\u8907\u7fd2\u5b8c\u6210\uff0c\u505a\u5f97\u5f88\u597d\u3002')}
function init(){ $('todayDate').textContent=todayLabel();$$('.nav-item').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));$$('[data-go]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.go)));$('openTextImport').addEventListener('click',()=>openImport('text'));$('copyTranscriptPrompt').addEventListener('click',async()=>{const prompt=$('transcriptPromptText').value;try{await navigator.clipboard.writeText(prompt);showToast('提示詞已複製，請到 ChatGPT 貼上逐字稿。')}catch(_){$('transcriptPromptText').focus();$('transcriptPromptText').select();document.execCommand('copy');showToast('提示詞已複製，請到 ChatGPT 貼上逐字稿。')}});$('libraryAdd').addEventListener('click',()=>openImport('text'));$('emptyAdd').addEventListener('click',()=>openImport('text'));$('closeModal').addEventListener('click',closeImport);$('cancelImport').addEventListener('click',closeImport);$('importModal').addEventListener('click',e=>{if(e.target===$('importModal'))closeImport()});$$('.source-tab').forEach(t=>t.addEventListener('click',()=>switchSource(t.dataset.source)));$('createArticle').addEventListener('click',createArticle);$('previousSentence').addEventListener('click',()=>changeSentence(-1));$('nextSentence').addEventListener('click',()=>changeSentence(1));$('bookmarkButton').addEventListener('click',toggleBookmark);$('speakEnglish').addEventListener('click',()=>speakCurrent());$('speakChinese').addEventListener('click',()=>speakCurrent('zh-TW'));$('slowSpeak').addEventListener('click',()=>speakCurrent('en-US',.72));$('playButton').addEventListener('click',()=>state.playing?stopPlayback():startPlayback());$$('#repeatControl button').forEach(b=>b.addEventListener('click',()=>{state.repeatCount=Number(b.dataset.repeat);state.data.repeatCount=state.repeatCount;saveData();$$('#repeatControl button').forEach(x=>x.classList.toggle('selected',x===b))}));$('editCurrentArticle').addEventListener('click',()=>{const article=activeArticle();if(article){stopPlayback();openArticleEditor(article.id)}});$('editRepeat').addEventListener('click',()=>$('repeatControl').scrollIntoView({behavior:'smooth',block:'center'}));$('startSavedReview').addEventListener('click',startReview);const sentenceListToggle=$('toggleSentenceList'),sentenceList=$('sentenceList');sentenceListToggle?.addEventListener('click',()=>{const expanded=sentenceListToggle.getAttribute('aria-expanded')==='true';sentenceListToggle.setAttribute('aria-expanded',String(!expanded));sentenceListToggle.setAttribute('aria-label',expanded?'展開本篇句子':'收合本篇句子');sentenceListToggle.textContent=expanded?'展開 ↓':'收合 ↑';sentenceList.classList.toggle('hidden',expanded)});$('revealAnswer').addEventListener('click',()=>{$('answerArea').classList.remove('hidden');$('revealAnswer').classList.add('hidden')});$('reviewSpeak').addEventListener('click',()=>speak($('reviewEnglish').textContent,$('reviewSpeak').dataset.language||undefined));$$('[data-rating]').forEach(b=>b.addEventListener('click',()=>rateReview(b.dataset.rating)));const gestureZone=document.createElement('div');gestureZone.id='reviewGestureSurface';gestureZone.className='review-gesture-surface';gestureZone.textContent='滑動評分：↓ 重來 · ← 困難 · ↑ 普通 · → 簡單';gestureZone.setAttribute('aria-label','滑動評分：向下重來，向左困難，向上普通，向右簡單');document.querySelector('.review-ratings').append(gestureZone);let reviewTouch=null;gestureZone.addEventListener('pointerdown',e=>{if(e.pointerType==='mouse'&&e.button!==0)return;if($('answerArea').classList.contains('hidden'))return;reviewTouch={id:e.pointerId,x:e.clientX,y:e.clientY};gestureZone.setPointerCapture(e.pointerId);gestureZone.classList.add('is-swiping')});gestureZone.addEventListener('pointerup',e=>{if(!reviewTouch||reviewTouch.id!==e.pointerId)return;const dx=e.clientX-reviewTouch.x,dy=e.clientY-reviewTouch.y;reviewTouch=null;gestureZone.classList.remove('is-swiping');if(Math.hypot(dx,dy)<38)return;const rating=Math.abs(dx)>Math.abs(dy)?(dx<0?'hard':'easy'):(dy<0?'good':'again');rateReview(rating)});gestureZone.addEventListener('pointercancel',()=>{reviewTouch=null;gestureZone.classList.remove('is-swiping')});$('reviewBookmark').addEventListener('click',()=>showToast('複習中的句子已收藏'));document.addEventListener('keydown',e=>{if(e.key==='Escape')closeImport();if(state.view==='player'&&e.code==='Space'&&!['TEXTAREA','INPUT'].includes(document.activeElement.tagName)){e.preventDefault();state.playing?stopPlayback():startPlayback()}});render()}
const LANGUAGE_LABELS={en:'English',ja:'日本語',ko:'한국어','zh-TW':'繁體中文'};
function articleSourceLanguage(article){return article?.sourceLanguage||'en'}
function articleTargetLanguage(article){return article?.targetLanguage||'zh-TW'}
function languageVoice(code){return({en:'en-US',ja:'ja-JP',ko:'ko-KR','zh-TW':'zh-TW'})[code]||'en-US'}
function splitSentences(text){return(text.replace(/\s+/g,' ').match(/[^.!?。！？]+(?:[.!?。！？]+["')\]”’）】]*)?|[^.!?。！？]+$/gu)||[]).map(s=>s.trim()).filter(s=>s.length>1)}
function openImport(source='text'){state.editingArticleId=null;$('modalTitle').textContent='新增文章';$('createArticle').textContent='儲存並開始聽';state.currentSource=source;state.fileText='';state.filePairs=null;state.fileText='';$('articleTitle').value='';$('articleText').value='';$('sourceLanguage').value='en';$('targetLanguage').value='zh-TW';$('articleSourceType').value='youtube';$('articleSourceCustom').value='';$('customSourceWrap').classList.add('hidden');$('articleSourceUrl').value='';$('fileStatus').textContent='';$('importError').textContent='';switchSource(source);$('importModal').classList.remove('hidden');setTimeout(()=>$(state.editingArticleId?'articleTitle':'articleSourceUrl').focus(),30)}
function switchSource(source){state.currentSource=source;$$('.source-tab').forEach(t=>t.classList.toggle('active',t.dataset.source===source));$('textSource').classList.toggle('hidden',source!=='text');$('fileSource').classList.toggle('hidden',source!=='file')}
function removeArticle(articleId){const article=state.data.articles.find(item=>item.id===articleId);if(!article)return;const wasPublic=article.isPublic;if(!window.confirm(`確定刪除「${article.title}」及其收藏句子？`))return;state.data.articles=state.data.articles.filter(item=>item.id!==articleId);state.data.saved=state.data.saved.filter(item=>item.articleId!==articleId);if(state.data.lastSession?.articleId===articleId)state.data.lastSession=null;state.reviewQueue=state.reviewQueue.filter(item=>item.articleId!==articleId);saveData();if(wasPublic)requestPublicSync();if(state.activeArticleId===articleId){state.activeArticleId=null;stopPlayback();setView('library')}else render();showToast('文章與相關收藏已刪除')}
const originalRenderPlayer=renderPlayerBase;
function renderSentenceList(article){const list=$('sentenceList');if(!list)return;const sentences=Array.isArray(article.sentences)?article.sentences:[];$('sentenceListCount').textContent=`${sentences.length} 句` ;if(!sentences.length){list.innerHTML='<div class="sentence-list-empty">沒有拆出句子。請確認匯入文字後再試一次。</div>';return}list.innerHTML=sentences.map((sentence,index)=>`<button type="button" class="sentence-row${index===state.sentenceIndex?' current':''}" data-sentence-index="${index}"><span class="sentence-row-number">${String(index+1).padStart(2,'0')}</span><span class="sentence-row-copy"><span class="sentence-row-original">${escapeHtml(sentence.english||'')}</span><span class="sentence-row-translation">${escapeHtml(sentence.chinese||'翻譯處理中…')}</span></span></button>`).join('');list.querySelectorAll('[data-sentence-index]').forEach(button=>button.addEventListener('click',()=>{stopPlayback();state.sentenceIndex=Number(button.dataset.sentenceIndex);article.currentIndex=state.sentenceIndex;state.data.lastSession={articleId:article.id,sentenceIndex:state.sentenceIndex};saveData();renderPlayer()}))}
function renderPlayer(){const article=activeArticle();if(article)renderPlayerSource(article);if(article&&!article.sentences.length){$('playerTitle').textContent=article.title;$('sentenceEnglish').textContent='這篇文章沒有儲存到句子。請重新匯入原文。';$('sentenceChinese').textContent='';$('previousSentence').disabled=true;$('nextSentence').disabled=true;renderSentenceList(article);return}originalRenderPlayer();if(!article)return;const source=articleSourceLanguage(article),target=articleTargetLanguage(article);$('targetLanguageLabel').textContent=`${LANGUAGE_LABELS[target]}翻譯`;$('sourceLanguageName').textContent=LANGUAGE_LABELS[source];$('asideTargetLanguage').textContent=LANGUAGE_LABELS[target];const enabled=article.playTranslation!==false;$('translationToggle').textContent=`播放翻譯：${enabled?'開':'關'}`;$('translationToggle').classList.toggle('enabled',enabled);$('translationToggle').setAttribute('aria-pressed',String(enabled));$('speakEnglish').innerHTML=`🔊 <span>聽${LANGUAGE_LABELS[source]}原句</span>`;$('speakChinese').innerHTML=`◖ <span>聽${LANGUAGE_LABELS[target]}翻譯</span>`;renderSentenceList(article)}
const originalRenderReview=renderReviewBase;
function renderReview(){originalRenderReview();const item=state.reviewQueue[state.reviewIndex];const article=item&&state.data.articles.find(a=>a.id===item.articleId);$('reviewSpeak').dataset.language=item?._reviewType==='speaking'?'en-US':'';if(item?._reviewType==='speaking')$('reviewSpeak').innerHTML='&#128266; <span>&#32893;&#21475;&#35498;&#21345;</span>';else if(article)$('reviewSpeak').innerHTML='&#128266; <span>&#32893;'+escapeHtml(LANGUAGE_LABELS[articleSourceLanguage(article)])+'&#21407;&#21477;</span>'}
function removeReviewBookmark(){const item=state.reviewQueue[state.reviewIndex];if(!item)return;state.data.saved=state.data.saved.filter(saved=>!(saved.articleId===item.articleId&&saved.sentenceIndex===item.sentenceIndex));state.reviewQueue.splice(state.reviewIndex,1);if(state.reviewIndex>=state.reviewQueue.length)state.reviewIndex=0;saveData();render();showToast('已取消收藏並從複習佇列移除')}
function speak(text,lang,rate=1){if(!('speechSynthesis'in window)){showToast('這個瀏覽器不支援語音播放');return}if(!lang){let article=activeArticle();if(!article&&state.view==='review'){const item=state.reviewQueue[state.reviewIndex];article=item&&state.data.articles.find(a=>a.id===item.articleId)}lang=languageVoice(articleSourceLanguage(article))}window.speechSynthesis.cancel();const utterance=new SpeechSynthesisUtterance(text);utterance.lang=lang;utterance.rate=rate;window.speechSynthesis.speak(utterance)}
function speakCurrent(which='source',rate=1){const article=activeArticle(),sentence=article?.sentences[state.sentenceIndex];if(!sentence)return;const translation=which==='translation'||which===articleTargetLanguage(article)||which==='zh-TW';const language=translation?articleTargetLanguage(article):articleSourceLanguage(article);const text=translation?(sentence.chinese||'尚無翻譯'):sentence.english;speak(text,languageVoice(language),rate)}
function playLoop(){if(!state.playing)return;const article=activeArticle(),sentence=article?.sentences[state.sentenceIndex];if(!sentence){stopPlayback();return}const afterCycle=()=>{if(!state.playing)return;state.repeatDone++;if(state.repeatDone<state.repeatCount){setTimeout(playLoop,350);return}state.repeatDone=0;markStudy();if(state.sentenceIndex<article.sentences.length-1){state.sentenceIndex++;article.currentIndex=state.sentenceIndex;state.data.lastSession={articleId:article.id,sentenceIndex:state.sentenceIndex};saveData();renderPlayer();setTimeout(playLoop,350)}else{article.currentIndex=article.sentences.length;saveData();stopPlayback();renderPlayer();showToast('這篇文章聽完了，做得很好。')}};const original=new SpeechSynthesisUtterance(sentence.english);original.lang=languageVoice(articleSourceLanguage(article));original.onend=()=>{if(!state.playing)return;const translated=(sentence.chinese||'').trim();if(article.playTranslation!==false&&translated){const translation=new SpeechSynthesisUtterance(translated);translation.lang=languageVoice(articleTargetLanguage(article));translation.rate=.94;translation.onend=()=>setTimeout(afterCycle,220);translation.onerror=afterCycle;window.speechSynthesis.speak(translation)}else afterCycle()};original.onerror=()=>{if(state.playing){stopPlayback();showToast('原文語音播放失敗，請確認瀏覽器支援此語言')}};window.speechSynthesis.speak(original)}
function initLanguageControls(){$('sourceFile')?.addEventListener('change',event=>extractDocument(event.target.files[0]));$('translationToggle')?.addEventListener('click',()=>{const article=activeArticle();if(!article)return;article.playTranslation=article.playTranslation===false;saveData();renderPlayer()});$('speakEnglish')?.addEventListener('click',()=>speakCurrent('source'));$('speakChinese')?.addEventListener('click',()=>speakCurrent('translation'));$('slowSpeak')?.addEventListener('click',()=>speakCurrent('source',.72));const moreButton=document.querySelector('.more-btn');moreButton?.addEventListener('click',()=>showToast('學習資料儲存在 Supabase，請使用登入中的帳號。'))}
initLanguageControls();
init();
const reviewBookmark=$('reviewBookmark');if(reviewBookmark){const replacement=reviewBookmark.cloneNode(true);reviewBookmark.replaceWith(replacement);replacement.addEventListener('click',removeReviewBookmark)}



function splitSentences(text){return String(text||'').replace(/\s+/g,' ').match(/[^.!?。！？]+[.!?。！？]+["'”’）)\]]*|[^.!?。！？]+$/gu)?.map(sentence=>sentence.trim()).filter(Boolean)||[]}

function openImport(source='text'){state.editingArticleId=null;$('modalTitle').textContent='新增文章';$('createArticle').textContent='儲存並開始聽';state.currentSource=source;state.fileText='';state.filePairs=null;state.fileText='';state.filePairs=null;$('articleTitle').value='';$('articleText').value='';$('sourceLanguage').value='en';$('targetLanguage').value='zh-TW';$('articleSourceType').value='youtube';$('articleSourceCustom').value='';$('customSourceWrap').classList.add('hidden');$('articleSourceUrl').value='';$('fileStatus').textContent='';$('importError').textContent='';switchSource(source);$('importModal').classList.remove('hidden');setTimeout(()=>$(state.editingArticleId?'articleTitle':'articleSourceUrl').focus(),30)}
function parseMarkdownSentencePairs(markdown){
  const lines=String(markdown||'').replace(/\\+/g,'\n').split(/\r?\n/).flatMap(line=>{
    const cleaned=line.trim().replace(/^>\s?/,'').replace(/^[-*+]\s+/,'').replace(/\*\*/g,'');
    const translationStart=cleaned.search(/[\u3400-\u9fff]/u);
    if(translationStart>0){const original=cleaned.slice(0,translationStart).trim(),translation=cleaned.slice(translationStart).trim();if(original&&translation)return[original,translation]}
    return[cleaned];
  }).filter(line=>line&&!/^#{1,6}\s/.test(line)&&!/^[-*_]{3,}$/.test(line)&&!/^paste sentences in pairs:\s*original sentence, then its translation, one sentence per line\.?$/i.test(line));
  const pairs=[];let original='';
  const label=/^(original|source|english|japanese|korean|translation|translated)\s*:\s*(.*)$/i;
  let labeled=false, pendingOriginal='';
  for(const line of lines){const match=line.match(label);if(!match)continue;labeled=true;const side=/^(original|source|english|japanese|korean)$/i.test(match[1])?'original':'translation';if(side==='original'){if(pendingOriginal)throw Error('Each original sentence needs a translation.');pendingOriginal=match[2].trim()}else{if(!pendingOriginal||!match[2].trim())throw Error('Each translation needs a matching original sentence.');pairs.push({original:pendingOriginal,translation:match[2].trim()});pendingOriginal=''}}
  if(labeled){if(pendingOriginal)throw Error('The last original sentence has no translation.');return pairs}
  if(lines.length%2!==0)throw Error('最後一行缺少對應的翻譯，請確認每句原文都有翻譯。');
  for(let i=0;i<lines.length;i+=2)pairs.push({original:lines[i],translation:lines[i+1]});
  return pairs;
}
async function extractDocument(file){
  if(!file)return;state.filePairs=null;state.fileText='';$('fileStatus').textContent='';
  if(!/\.md$/i.test(file.name)){$('fileStatus').textContent='Only .md files with original/translation pairs are supported.';return}
  try{state.fileText=await file.text();state.filePairs=parseMarkdownSentencePairs(state.fileText);$('articleTitle').value=file.name.replace(/\.md$/i,'');$('fileStatus').textContent=`Loaded ${state.filePairs.length} sentence pairs.`}
  catch(error){state.filePairs=null;$('fileStatus').textContent=error.message}
}
function openArticleEditor(articleId){
  const article=state.data.articles.find(item=>item.id===articleId);if(!article)return;
  openImport('text');state.editingArticleId=article.id;
  $('modalTitle').textContent='編輯文章';$('createArticle').textContent='儲存修改';
  $('articleTitle').value=article.title||'';$('articleSourceType').value=article.sourceType||'youtube';
  $('articleSourceCustom').value=article.sourceLabel||'';$('customSourceWrap').classList.toggle('hidden',$('articleSourceType').value!=='other');
  $('articleSourceUrl').value=article.sourceUrl||'';$('sourceLanguage').value=article.sourceLanguage||'en';$('targetLanguage').value=article.targetLanguage||'zh-TW';
  $('articleText').value=(article.sentences||[]).map(sentence=>`${sentence.english||''}\n${sentence.chinese||''}`).join('\n\n');
  $('fileStatus').textContent='';
}
async function createArticle(){
  const fromFile=state.currentSource==='file';
  const content=fromFile?state.fileText||'':$('articleText').value;
  let pairs;
  try{pairs=fromFile?state.filePairs:parseMarkdownSentencePairs(content)}
  catch(error){$('importError').textContent=error.message;return}
  if(!content.trim()){$('importError').textContent='Paste sentence pairs or choose a .md file.';return}
  if(!pairs?.length){$('importError').textContent='No original/translation pairs found.';return}
  if(pairs.length>500){$('importError').textContent='A session can contain up to 500 sentence pairs.';return}
  const sourceLanguage=$('sourceLanguage').value,targetLanguage=$('targetLanguage').value;
  const sourceType=$('articleSourceType').value,sourceLabel=sourceType==='other'?$('articleSourceCustom').value.trim():'';
  const sourceUrl=$('articleSourceUrl').value.trim();
  if(sourceType==='other'&&!sourceLabel){$('importError').textContent='Enter a name for this source.';return}
  if(sourceUrl){try{const parsedUrl=new URL(sourceUrl);if(!['http:','https:'].includes(parsedUrl.protocol))throw Error()}catch{$('importError').textContent='Enter a valid http or https URL.';return}}
  const button=$('createArticle');button.disabled=true;button.textContent='Saving sentence pairs...';$('importError').textContent='';
  if(state.editingArticleId){
    const article=state.data.articles.find(item=>item.id===state.editingArticleId);
    if(!article){button.disabled=false;$('importError').textContent='找不到要編輯的文章。';return}
    const oldSentences=Array.isArray(article.sentences)?article.sentences:[];
    const sentences=pairs.map(pair=>({english:pair.original,chinese:pair.translation}));
    const findMatch=sentence=>sentences.findIndex(item=>item.english===sentence?.english&&item.chinese===(sentence?.chinese||''));
    const savedChanges=state.data.saved.filter(item=>item.articleId===article.id).map(item=>({item,index:findMatch(oldSentences[item.sentenceIndex])}));
    const removedSaved=savedChanges.filter(change=>change.index<0);
    if(removedSaved.length&&!window.confirm(`修改後有 ${removedSaved.length} 句已收藏內容不在文章中，這些收藏及其複習排程會移除。是否繼續？`)){button.disabled=false;button.textContent='儲存修改';return}
    savedChanges.forEach(change=>{if(change.index>=0)change.item.sentenceIndex=change.index});
    if(removedSaved.length){const removed=new Set(removedSaved.map(change=>change.item));state.data.saved=state.data.saved.filter(item=>!removed.has(item))}
    const ratings={};Object.entries(article.ankiRatings||{}).forEach(([oldIndex,rating])=>{const nextIndex=findMatch(oldSentences[Number(oldIndex)]);if(nextIndex>=0)ratings[nextIndex]=rating});
    article.title=$('articleTitle').value.trim()||'Untitled article';
    article.updatedAt=new Date().toISOString();article.source=fromFile?'md':article.source||'paste';article.sourceType=sourceType;article.sourceLabel=sourceLabel;article.sourceUrl=sourceUrl;article.sourceLanguage=sourceLanguage;article.targetLanguage=targetLanguage;article.sourceText=content;article.totalChars=content.length;article.sentences=sentences;article.ankiRatings=ratings;
    article.currentIndex=Math.min(Number(article.currentIndex)||0,sentences.length);
    state.reviewQueue=[];state.reviewIndex=0;state.editingArticleId=null;saveData();closeImport();button.disabled=false;render();showToast('文章已更新。');return;
  }
  const article={id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),title:$('articleTitle').value.trim()||'Untitled article',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),source:fromFile?'md':'paste',sourceType,sourceLabel,sourceUrl:sourceUrl||'',folderId:state.libraryFolderId||null,sourceLanguage,targetLanguage,playTranslation:true,totalChars:content.length,sourceText:content,sentences:pairs.map(pair=>({english:pair.original,chinese:pair.translation})),currentIndex:0,completedCount:0};
  state.data.articles.unshift(article);state.activeArticleId=article.id;state.sentenceIndex=0;saveData();closeImport();button.disabled=false;button.innerHTML='Save and start listening <span>&#8594;</span>';setView('player');showToast(`Saved ${pairs.length} sentence pairs.`);
}

state.playbackMode=state.data.playbackMode||'auto';
state.awaitingAnki=false;
state.ankiInputMode=state.data.ankiInputMode||'buttons';
let ankiTouchOrigin=null;
function isPhone(){return window.matchMedia('(max-width: 640px)').matches}
function syncAnkiInputMode(){const selector=$('ankiInputMode'),buttons=document.querySelector('.anki-rating-buttons'),help=document.querySelector('.anki-gesture-help');if(!selector)return;selector.classList.toggle('hidden',!isPhone()||state.playbackMode!=='anki');document.querySelectorAll('[data-anki-input]').forEach(button=>button.classList.toggle('selected',button.dataset.ankiInput===state.ankiInputMode));const gestures=isPhone()&&state.ankiInputMode==='gesture';buttons?.classList.toggle('hidden',gestures);help?.classList.toggle('hidden',!gestures)}
window.addEventListener('resize',syncAnkiInputMode);
document.querySelectorAll('[data-anki-input]').forEach(button=>button.addEventListener('click',()=>{state.ankiInputMode=button.dataset.ankiInput;state.data.ankiInputMode=state.ankiInputMode;saveData();syncAnkiInputMode();showToast(state.ankiInputMode==='gesture'?'????????':'????????')}));
function syncPlaybackMode(){document.querySelectorAll('[data-playback-mode]').forEach(button=>{button.classList.toggle('selected',button.dataset.playbackMode===state.playbackMode);button.disabled=state.playing});syncAnkiInputMode();}
document.querySelectorAll('[data-playback-mode]').forEach(button=>button.addEventListener('click',()=>{if(state.playing)return;const nextMode=button.dataset.playbackMode;if(state.awaitingAnki&&nextMode!==state.playbackMode){if('speechSynthesis'in window)window.speechSynthesis.cancel();state.awaitingAnki=false;$('ankiControls').classList.add('hidden');$('playerView').classList.remove('anki-awaiting');$('playGlyph').textContent='▶';$('playLabel').textContent='播放'}state.playbackMode=nextMode;state.data.playbackMode=state.playbackMode;saveData();syncPlaybackMode();if(!state.awaitingAnki)$('ankiControls').classList.add('hidden');showToast(state.playbackMode==='anki'?'Anki 模式已選擇':'自動播放已選擇')}));
window.addEventListener('supabase-user-changed',()=>{state.playbackMode=state.data.playbackMode==='anki'?'anki':'auto';state.ankiInputMode=state.data.ankiInputMode==='gesture'?'gesture':'buttons';syncPlaybackMode();});
function startPlayback(){const article=activeArticle();if(!article)return;if(state.awaitingAnki)return;if(state.sentenceIndex>=article.sentences.length-1&&article.currentIndex>=article.sentences.length){state.sentenceIndex=0;article.currentIndex=0}state.awaitingAnki=false;$('ankiControls').classList.add('hidden');$('playerView').classList.remove('anki-awaiting');state.playing=true;state.repeatDone=0;syncPlaybackMode();renderPlayer();playLoop()}
function stopPlayback(){if('speechSynthesis'in window)window.speechSynthesis.cancel();state.playing=false;state.awaitingAnki=false;$('ankiControls')?.classList.add('hidden');$('playerView')?.classList.remove('anki-awaiting');const glyph=$('playGlyph'),label=$('playLabel');if(glyph){glyph.textContent='▶';label.textContent='播放'}syncPlaybackMode()}
function playLoop(){
  if(!state.playing)return;const article=activeArticle(),sentence=article?.sentences[state.sentenceIndex];if(!sentence){stopPlayback();return}
  const playPass=()=>{if(!state.playing)return;const finishPass=()=>{if(!state.playing)return;state.repeatDone++;if(state.repeatDone<state.repeatCount){setTimeout(playPass,350);return}state.repeatDone=0;markStudy();article.currentIndex=state.sentenceIndex;state.data.lastSession={articleId:article.id,sentenceIndex:state.sentenceIndex};saveData();
    if(state.playbackMode==='anki'){state.playing=false;state.awaitingAnki=true;$('ankiControls').classList.remove('hidden');$('playerView').classList.add('anki-awaiting');$('ankiPrompt').textContent=state.ankiInputMode==='gesture'?'句子播完了。向下滑：重來；向左滑：困難；向上滑：普通；向右滑：簡單。':'句子播完了。請選擇記憶難度按鈕。';$('playGlyph').textContent='✓';$('playLabel').textContent='選擇記憶評分';syncPlaybackMode();if('speechSynthesis'in window){window.speechSynthesis.cancel();const promptText=state.ankiInputMode==='gesture'?'句子播完了。重來會立即重播。向下滑，重來。向左滑，困難。向上滑，普通。向右滑，簡單。':'句子播完了。請選擇記憶難度按鈕。';const prompt=new SpeechSynthesisUtterance(promptText);prompt.lang='zh-TW';prompt.rate=.9;window.speechSynthesis.speak(prompt)}return}
    if(state.sentenceIndex<article.sentences.length-1){state.sentenceIndex++;article.currentIndex=state.sentenceIndex;state.data.lastSession={articleId:article.id,sentenceIndex:state.sentenceIndex};saveData();renderPlayer();setTimeout(playLoop,350)}else{article.currentIndex=article.sentences.length;saveData();state.playing=false;renderPlayer();stopPlayback();showToast('這篇文章聽完了，做得很好。')}
  };
  const original=new SpeechSynthesisUtterance(sentence.english);original.lang=languageVoice(articleSourceLanguage(article));original.onend=()=>{if(!state.playing)return;const translated=(sentence.chinese||'').trim();if(article.playTranslation!==false&&translated){const translation=new SpeechSynthesisUtterance(translated);translation.lang=languageVoice(articleTargetLanguage(article));translation.rate=.94;translation.onend=finishPass;translation.onerror=finishPass;window.speechSynthesis.speak(translation)}else finishPass()};original.onerror=()=>{if(state.playing){state.playing=false;stopPlayback();showToast('原文語音播放失敗，請確認瀏覽器支援此語言')}};window.speechSynthesis.speak(original)};
  playPass();
}
function applyAnkiRating(rating){if(!state.awaitingAnki)return;const article=activeArticle();if(!article)return;const index=state.sentenceIndex,now=Date.now(),durations={again:60000,hard:6*60000,good:10*60000,easy:4*86400000};article.ankiRatings=article.ankiRatings||{};article.ankiRatings[index]={rating,reviewedAt:now,dueAt:now+durations[rating]};const saved=state.data.saved.find(item=>item.articleId===article.id&&item.sentenceIndex===index);if(saved){saved.lastRating=rating;saved.repetitions=(saved.repetitions||0)+(rating==='again'?0:1);saved.dueAt=now+durations[rating];saved.intervalDays=durations[rating]/86400000}if('speechSynthesis'in window)window.speechSynthesis.cancel();state.awaitingAnki=false;$('ankiControls').classList.add('hidden');$('playerView').classList.remove('anki-awaiting');$('playGlyph').textContent='▶';$('playLabel').textContent='播放';if(rating==='again'){saveData();state.repeatDone=0;state.playing=true;syncPlaybackMode();renderPlayer();setTimeout(playLoop,250);return}if(index<article.sentences.length-1){state.sentenceIndex=index+1;article.currentIndex=state.sentenceIndex;state.data.lastSession={articleId:article.id,sentenceIndex:state.sentenceIndex};saveData();renderPlayer();syncPlaybackMode();startPlayback()}else{article.currentIndex=article.sentences.length;state.data.lastSession={articleId:article.id,sentenceIndex:index};saveData();renderPlayer();syncPlaybackMode();showToast('Anki 模式完成，這篇文章已聽完。')}}
document.querySelectorAll('[data-anki-rating]').forEach(button=>button.addEventListener('click',()=>applyAnkiRating(button.dataset.ankiRating)));
document.getElementById('playerView').addEventListener('touchstart',event=>{if(!state.awaitingAnki||!isPhone()||state.ankiInputMode!=='gesture')return;const touch=event.changedTouches[0];ankiTouchOrigin={x:touch.clientX,y:touch.clientY}},{passive:true});
document.getElementById('playerView').addEventListener('touchend',event=>{if(!state.awaitingAnki||!isPhone()||state.ankiInputMode!=='gesture'||!ankiTouchOrigin)return;const touch=event.changedTouches[0],dx=touch.clientX-ankiTouchOrigin.x,dy=touch.clientY-ankiTouchOrigin.y;ankiTouchOrigin=null;if(Math.max(Math.abs(dx),Math.abs(dy))<45)return;event.preventDefault();if(Math.abs(dx)>Math.abs(dy))applyAnkiRating(dx<0?'hard':'easy');else applyAnkiRating(dy<0?'good':'again')},{passive:false});
document.addEventListener('keydown',event=>{if(!state.awaitingAnki)return;const ratings={ArrowDown:'again',ArrowLeft:'hard',ArrowUp:'good',ArrowRight:'easy'};if(ratings[event.key]){event.preventDefault();applyAnkiRating(ratings[event.key])}});
syncPlaybackMode();
syncAnkiInputMode();

state.libraryFolderId = null;
state.data.folders = Array.isArray(state.data.folders) ? state.data.folders : [];

function safeArticleUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch (_) { return ''; }
}
function articleSourceName(article) {
  if (article.sourceType === 'other') return article.sourceLabel || 'Other';
  return ({ youtube: 'YouTube', book: '\u66f8\u672c' })[article.sourceType] || '';
}
function renderPlayerSource(article) {
  const link = $('playerSourceLink');
  if (!link) return;
  const url = safeArticleUrl(article?.sourceUrl || '');
  link.classList.toggle('hidden', !url);
  if (!url) { link.removeAttribute('href'); link.textContent = ''; return; }
  link.href = url;
  link.textContent = 'link';
}
function renderLibrary() {
  const grid = $('libraryGrid'), folderGrid = $('libraryFolders');
  const folders = Array.isArray(state.data.folders) ? state.data.folders : [];
  let selectedId = state.libraryFolderId || null;
  if (selectedId && !folders.some(folder => folder.id === selectedId)) {
    state.libraryFolderId = null;
    selectedId = null;
  }
  const sortMode = state.data.librarySort || 'date';
  if ($('librarySort')) $('librarySort').value = sortMode;
  const articles = state.data.articles.filter(article => !selectedId || article.folderId === selectedId);
  articles.sort((a, b) => sortMode === 'name'
    ? (a.title || '').localeCompare(b.title || '', 'zh-TW')
    : Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0));
  $('librarySummary').textContent = selectedId
    ? articles.length + ' / ' + state.data.articles.length + ' \u7bc7\u6587\u7ae0'
    : state.data.articles.length + ' \u7bc7\u6587\u7ae0';
  grid.innerHTML = articles.map(article => {
    const count = article.sentences && article.sentences.length || 0;
    const pct = count ? Math.round((article.currentIndex || 0) / count * 100) : 0;
    const label = (article.title || 'Untitled').split(/\s+/).slice(0, 3).join(' ');
    const source = articleSourceName(article);
    const url = safeArticleUrl(article.sourceUrl || '');
    const sourceLine = source
      ? '<p class="article-source">\u4f86\u6e90\uff1a' + escapeHtml(source) + (url ? ' · <a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">\u7db2\u5740 \u2197</a>' : '') + '</p>'
      : '';
    return '<article class="library-card" data-article="' + escapeHtml(article.id) + '" draggable="true"><div class="continue-cover"><span>LISTENING NOTES</span><strong>' + escapeHtml(label) + '</strong></div><h3>' + escapeHtml(article.title || 'Untitled') + '</h3><p>' + count + ' \u53e5 · ' + new Date(article.createdAt).toLocaleDateString('zh-TW') + '</p>' + sourceLine + '<div class="progress-track"><div class="progress-fill" style="width:' + Math.min(100, pct) + '%"></div></div><div class="library-card-footer"><span>' + (article.currentIndex || 0) + ' / ' + count + ' \u5df2\u5b8c\u6210</span><span>' + pct + '%</span></div><button class="edit-article" type="button" title="編輯文章" aria-label="編輯文章">&#9998;</button><button class="delete-article" type="button" title="\u522a\u9664\u6587\u7ae0" aria-label="\u522a\u9664\u6587\u7ae0">×</button></article>';
  }).join('');
  $('emptyLibrary').classList.toggle('hidden', articles.length > 0);
  const folderItems = [{ id: '', name: '\u5168\u90e8\u6587\u7ae0', count: state.data.articles.length }];
  folders.forEach(folder => folderItems.push({
    id: folder.id, name: folder.name,
    count: state.data.articles.filter(article => article.folderId === folder.id).length
  }));
  folderGrid.innerHTML = folderItems.map(folder =>
    '<div class="folder-card' + ((state.libraryFolderId || '') === folder.id ? ' active' : '') + '" data-folder="' + escapeHtml(folder.id) + '" tabindex="0" role="button"><span class="folder-icon">▰</span><span class="folder-copy"><strong>' + escapeHtml(folder.name) + '</strong><small>' + folder.count + ' \u7bc7\u6587\u7ae0</small></span>' + (folder.id ? '<button class="folder-delete" type="button" title="Delete folder" aria-label="Delete folder">×</button>' : '') + '</div>'
  ).join('');
  folderGrid.querySelectorAll('[data-folder]').forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('.folder-delete, .folder-public-toggle')) return;
      state.libraryFolderId = card.dataset.folder || null;
      renderLibrary();
    });
    card.addEventListener('keydown', event => {
      if (event.target !== card) return;
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); card.click(); }
    });
    card.addEventListener('dragover', event => { event.preventDefault(); card.classList.add('drag-over'); });
    card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
    card.addEventListener('drop', event => {
      event.preventDefault();
      card.classList.remove('drag-over');
      const article = state.data.articles.find(item => item.id === event.dataTransfer.getData('text/plain'));
      if (!article) return;
      article.folderId = card.dataset.folder || null;
      saveData();
      render();
      showToast('\u5df2\u79fb\u81f3\u8cc7\u6599\u593e\u3002');
    });
  });
  folderGrid.querySelectorAll('.folder-delete').forEach(button => button.addEventListener('click', event => {
    event.stopPropagation();
    const folderId = button.closest('[data-folder]').dataset.folder;
    const folder = folders.find(item => item.id === folderId);
    if (!folder || !window.confirm('\u522a\u9664\u8cc7\u6599\u593e\u300c' + folder.name + '\u300d\uff1f\u6587\u7ae0\u6703\u4fdd\u7559\u5728\u6587\u7ae0\u5eab\u3002')) return;
    state.data.folders = folders.filter(item => item.id !== folderId);
    state.data.articles.forEach(article => { if (article.folderId === folderId) article.folderId = null; });
    if (state.libraryFolderId === folderId) state.libraryFolderId = null;
    saveData();
    if (folder.isPublic) requestPublicSync();
    render();
  }));
  folderGrid.querySelectorAll('[data-folder]').forEach(card => {
    const folder = folders.find(item => item.id === card.dataset.folder);
    if (!folder) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'folder-public-toggle';
    button.textContent = folder.isPublic ? '\u5df2\u516c\u958b' : '\u516c\u958b';
    button.title = '\u516c\u958b\u5f8c\u5176\u4ed6\u767b\u5165\u5e33\u6236\u53ef\u5c0e\u5165\u6b64\u8cc7\u6599\u593e\u53ca\u5167\u542b\u6587\u7ae0';
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (!folder.isPublic && !window.confirm('\u8a2d\u70ba\u516c\u958b\u5f8c\uff0c\u5176\u4ed6\u767b\u5165\u5e33\u6236\u53ef\u5c0e\u5165\u6b64\u8cc7\u6599\u593e\u548c\u88e1\u9762\u7684\u6587\u7ae0\uff0c\u5305\u542b\u539f\u6587\u3001\u7ffb\u8b6f\u548c\u4f86\u6e90\u7db2\u5740\u3002\u7e7c\u7e8c\u55ce\uff1f')) return;
      folder.isPublic = !folder.isPublic;
      saveData();
      requestPublicSync();
      renderLibrary();
    });
    card.append(button);
  });
  grid.querySelectorAll('[data-article]').forEach(card => {
    card.addEventListener('click', event => {
      if (event.target.closest('.delete-article, .edit-article, .publication-toggle, a')) return;
      openArticle(card.dataset.article);
    });
    card.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', card.dataset.article);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.querySelector('.delete-article').addEventListener('click', event => {
      event.stopPropagation();
      removeArticle(card.dataset.article);
    });
    card.querySelector('.edit-article').addEventListener('click', event => {
      event.stopPropagation();
      openArticleEditor(card.dataset.article);
    });
    const article = state.data.articles.find(item => item.id === card.dataset.article);
    const publicationButton = document.createElement('button');
    publicationButton.type = 'button';
    publicationButton.className = 'publication-toggle';
    publicationButton.textContent = article.isPublic ? '\u5df2\u516c\u958b' : '\u8a2d\u70ba\u516c\u958b';
    publicationButton.title = '\u516c\u958b\u5f8c\u5176\u4ed6\u767b\u5165\u5e33\u6236\u53ef\u700f\u89bd\u548c\u5c0e\u5165';
    publicationButton.addEventListener('click', event => {
      event.stopPropagation();
      if (!article.isPublic && !window.confirm('\u8a2d\u70ba\u516c\u958b\u5f8c\uff0c\u5176\u4ed6\u767b\u5165\u5e33\u6236\u90fd\u53ef\u700f\u89bd\u548c\u5c0e\u5165\u6b64\u6587\u7ae0\u3002\u5167\u5bb9\u6703\u5305\u542b\u539f\u6587\u3001\u7ffb\u8b6f\u548c\u4f86\u6e90\u7db2\u5740\u3002\u7e7c\u7e8c\u55ce\uff1f')) return;
      article.isPublic = !article.isPublic;
      saveData();
      requestPublicSync();
      renderLibrary();
    });
    card.append(publicationButton);
  });
}
function addLibraryFolder() {
  const input = $('folderNameInput');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  const cleanName = name.slice(0, 60);
  if (state.data.folders.some(folder => folder.name.toLocaleLowerCase() === cleanName.toLocaleLowerCase())) {
    showToast('\u5df2\u6709\u540c\u540d\u7684\u8cc7\u6599\u593e\u3002');
    input.focus();
    return;
  }
  const folder = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name: cleanName, createdAt: new Date().toISOString(), isPublic: false };
  state.data.folders.push(folder);
  input.value = '';
  $('folderCreatePanel').classList.add('hidden');
  saveData();
  render();
  showToast('\u5df2\u5efa\u7acb\u8cc7\u6599\u593e\uff0c\u53ef\u5c07\u6587\u7ae0\u62d6\u9032\u8cc7\u6599\u593e');
}
function initLibraryControls() {
  $('createFolder').addEventListener('click', () => {
    $('folderCreatePanel').classList.remove('hidden');
    $('folderNameInput').focus();
  });
  $('saveFolder').addEventListener('click', addLibraryFolder);
  $('cancelFolder').addEventListener('click', () => { $('folderCreatePanel').classList.add('hidden'); $('folderNameInput').value = ''; });
  $('folderNameInput').addEventListener('keydown', event => { if (event.key === 'Enter') addLibraryFolder(); if (event.key === 'Escape') $('cancelFolder').click(); });
  $('librarySort').addEventListener('change', event => {
    state.data.librarySort = event.target.value;
    saveData();
    renderLibrary();
  });
  $('articleSourceType').addEventListener('change', event => {
    $('customSourceWrap').classList.toggle('hidden', event.target.value !== 'other');
  });
  $('refreshShared').addEventListener('click', loadSharedLibrary);
  $('sharedSearch').addEventListener('input', renderShared);
}
initLibraryControls();

state.sharedItems = [];
state.sharedLoading = false;
state.sharedError = '';

function requestPublicSync() { if (window.syncPublicLibrary) window.syncPublicLibrary(state.data).then(ok => { if (!ok) showToast('\u516c\u958b\u8a2d\u5b9a\u672a\u540c\u6b65\uff0c\u8acb\u6aa2\u67e5 Supabase SQL \u8207\u9023\u7dda'); }); }
function renderShared() {
  const search = ($('sharedSearch').value || '').trim().toLocaleLowerCase();
  const items = (state.sharedItems || []).filter(item => (item.title || '').toLocaleLowerCase().includes(search));
  $('sharedSummary').textContent = state.sharedLoading
    ? '\u6b63\u5728\u8f09\u5165\u516c\u958b\u5167\u5bb9\u2026'
    : state.sharedError || (items.length + ' \u500b\u516c\u958b\u9805\u76ee');
  $('sharedEmpty').classList.toggle('hidden', items.length > 0 || state.sharedLoading || Boolean(state.sharedError));
  $('sharedGrid').innerHTML = items.map(item => {
    const payload = item.payload || {};
    const article = item.kind === 'article' ? payload.article : null;
    const folderArticles = item.kind === 'folder' && Array.isArray(payload.articles) ? payload.articles : [];
    const detail = item.kind === 'folder'
      ? folderArticles.length + ' \u7bc7\u6587\u7ae0'
      : ((article && article.sentences && article.sentences.length) || 0) + ' \u53e5';
    const imported = item.kind === 'folder'
      ? state.data.folders.some(folder => folder.importedFrom === item.item_id)
      : state.data.articles.some(value => value.importedFrom === item.item_id);
    const kind = item.kind === 'folder' ? '\u8cc7\u6599\u593e' : '\u6587\u7ae0';
    const buttonLabel = imported ? '\u5df2\u5c0e\u5165' : '\u5f15\u5165';
    return '<article class="shared-card"><div class="shared-kind">' + kind + '</div><h3>' + escapeHtml(item.title || '') + '</h3><p>' + detail + ' \u00b7 ' + new Date(item.updated_at).toLocaleDateString('zh-TW') + '</p><button type="button" class="primary-button shared-import" data-item-id="' + escapeHtml(item.item_id) + '" ' + (imported ? 'disabled' : '') + '>' + buttonLabel + '</button></article>';
  }).join('');
  $('sharedGrid').querySelectorAll('.shared-import').forEach(button => button.addEventListener('click', () => {
    const item = items.find(value => value.item_id === button.dataset.itemId);
    if (item) importSharedItem(item);
  }));
}
async function loadSharedLibrary() {
  if (!window.fetchSharedLibrary) {
    state.sharedError = '\u516c\u958b\u5206\u4eab\u670d\u52d9\u5c1a\u672a\u9023\u7dda';
    renderShared();
    return;
  }
  state.sharedLoading = true;
  state.sharedError = '';
  renderShared();
  try {
    state.sharedItems = await window.fetchSharedLibrary();
  } catch (error) {
    state.sharedError = error.message + ' (\u8acb\u6aa2\u67e5\u662f\u5426\u5df2\u57f7\u884c\u6700\u65b0\u7248\u7684 supabase-setup.sql)';
  } finally {
    state.sharedLoading = false;
    renderShared();
  }
}
function cloneSharedArticle(source, folderId, importId) {
  const sentences = Array.isArray(source.sentences) ? source.sentences.map(sentence => ({
    english: String(sentence.english || ''), chinese: String(sentence.chinese || '')
  })) : [];
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
    title: String(source.title || 'Imported article'),
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    source: 'shared', sourceType: String(source.sourceType || ''),
    sourceLabel: String(source.sourceLabel || ''), sourceUrl: safeArticleUrl(source.sourceUrl || ''),
    sourceLanguage: source.sourceLanguage || 'en', targetLanguage: source.targetLanguage || 'zh-TW',
    totalChars: Number(source.totalChars) || 0, sourceText: String(source.sourceText || ''),
    sentences, currentIndex: 0, completedCount: 0, playTranslation: true,
    folderId: folderId || null, importedFrom: importId
  };
}
function importSharedItem(item) {
  if (item.kind === 'article') {
    if (!item.payload || !item.payload.article || !Array.isArray(item.payload.article.sentences)) {
      showToast('\u7121\u6cd5\u5c0e\u5165\uff1a\u516c\u958b\u6587\u7ae0\u683c\u5f0f\u4e0d\u6b63\u78ba');
      return;
    }
    state.data.articles.unshift(cloneSharedArticle(item.payload.article, null, item.item_id));
  } else if (item.kind === 'folder') {
    const payload = item.payload || {}, sourceArticles = Array.isArray(payload.articles) ? payload.articles : [];
    const folder = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random(),
      name: String(payload.folder && payload.folder.name || item.title || 'Imported folder'),
      createdAt: new Date().toISOString(), isPublic: false, importedFrom: item.item_id
    };
    state.data.folders.push(folder);
    sourceArticles.forEach(article => state.data.articles.push(cloneSharedArticle(article, folder.id, null)));
  } else return;
  saveData();
  render();
  renderShared();
  showToast('\u5df2\u5c0e\u5165\u81f3\u4f60\u7684\u6587\u7ae0\u5eab');
}
