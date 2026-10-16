(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const id = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  state.speakingKeys = { groq: [''] };
  state.speakingKeysLoaded = false;
  state.speakingBusy = false;
  state.speakingReview = null;
  state.speakingRecorder = null;

  function speakingData() {
    state.data.speaking = state.data.speaking && typeof state.data.speaking === 'object'
      ? state.data.speaking : { messages: [], cards: [], grammarErrors: [], pendingGrammar: null };
    const data = state.data.speaking;
    data.messages = Array.isArray(data.messages) ? data.messages : [];
    data.cards = Array.isArray(data.cards) ? data.cards : [];
    data.grammarErrors = Array.isArray(data.grammarErrors) ? data.grammarErrors : [];
    return data;
  }
  function signedIn() {
    if (window.currentSupabaseUserId) return true;
    showToast('請先登入 Supabase，再使用口說練習。');
    $('authButton')?.click();
    return false;
  }
  function normalized(value) { return String(value || '').trim().toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' '); }
  function getKeys(provider) {
    return [...document.querySelectorAll(`[data-key-provider="${provider}"]`)].map(input => input.value.trim()).filter(Boolean).slice(0, 5);
  }
  function renderKeyInputs(provider) {
    const host = $(provider + 'Keys');
    if (!host) return;
    const values = state.speakingKeys[provider];
    host.replaceChildren();
    values.forEach((value, index) => {
      const row = document.createElement('div');
      row.className = 'speaking-key-row';
      const input = document.createElement('input');
      input.type = 'password';
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.className = 'text-input';
      input.placeholder = 'Groq API key';
      input.setAttribute('aria-label', provider + ' API key ' + (index + 1));
      input.dataset.keyProvider = provider;
      input.value = value;
      input.addEventListener('input', () => { state.speakingKeys[provider][index] = input.value; });
      input.addEventListener('change', maybeGenerateReviewQuestion);
      row.append(input);
      if (values.length > 1) {
        const remove = document.createElement('button');
        remove.type = 'button'; remove.className = 'small-icon-button'; remove.textContent = '×'; remove.setAttribute('aria-label', 'Remove API key');
        remove.addEventListener('click', () => { state.speakingKeys[provider].splice(index, 1); if (!state.speakingKeys[provider].length) state.speakingKeys[provider].push(''); renderKeyInputs(provider); });
        row.append(remove);
      }
      host.append(row);
    });
  }
  function setKeyStatus(message, isError = false) {
    const status = $('speakingKeyStatus');
    if (!status) return;
    status.textContent = message;
    status.classList.toggle('error', isError);
  }
  async function loadSpeakingKeys() {
    if (!window.currentSupabaseUserId || state.speakingKeysLoaded || !window.manageSpeakingKeys) return;
    setKeyStatus('正在從 Supabase 載入…');
    try {
      const response = await window.manageSpeakingKeys('get-keys');
      const groqKeys = response?.keys?.groq;
      state.speakingKeys.groq = Array.isArray(groqKeys) && groqKeys.length ? groqKeys.slice(0, 5) : [''];
      renderKeyInputs('groq');
      state.speakingKeysLoaded = true;
      state.speakingKeysUserId = window.currentSupabaseUserId;
      const hasSavedKeys = state.speakingKeys.groq.some(key => key.trim());
      setKeyStatus(hasSavedKeys ? 'Groq API key \u5df2\u5f9e\u96f2\u7aef\u8f09\u5165\u3002' : '\u6b64\u5e33\u6236\u5c1a\u672a\u5132\u5b58 API \u91d1\u9470\u3002');
    } catch (error) {
      setKeyStatus(error.message || '雲端 keys 載入失敗。', true);
    }
  }
  async function saveSpeakingKeys() {
    if (!signedIn()) return;
    const keys = { gemini: [], groq: getKeys('groq') };
    if (!keys.groq.length) { setKeyStatus('請先輸入 Groq API key。', true); return; }
    setKeyStatus('正在加密並儲存…');
    try {
      await window.manageSpeakingKeys('save-keys', keys);
      state.speakingKeysLoaded = true;
      setKeyStatus('已加密儲存至 Supabase，可在其他裝置登入使用。');
      showToast('API keys 已安全儲存至 Supabase。');
    } catch (error) { setKeyStatus(error.message || '儲存失敗。', true); }
  }
  async function clearSpeakingKeys() {
    if (!signedIn() || !window.confirm('確定清除這個帳戶儲存在 Supabase 的 API keys？')) return;
    setKeyStatus('正在清除…');
    try {
      await window.manageSpeakingKeys('clear-keys');
      state.speakingKeys = { groq: [''] };
      state.speakingKeysLoaded = true;
      renderKeyInputs('groq');
      setKeyStatus('雲端 API keys 已清除。');
    } catch (error) { setKeyStatus(error.message || '清除失敗。', true); }
  }
  function activeProvider() { return 'groq'; }
  function updateGroqQuota(limits) {
    if (!limits) return;
    const parts = [];
    if (limits.remainingRequests != null) {
      const reset = limits.resetRequests ? ` (重置倒數 ${limits.resetRequests})` : '';
      parts.push(`每日剩餘請求 ${limits.remainingRequests}${limits.limitRequests != null ? `/${limits.limitRequests}` : ''}${reset}`);
    }
    if (limits.remainingTokens != null) {
      const reset = limits.resetTokens ? ` (重置倒數 ${limits.resetTokens})` : '';
      parts.push(`本分鐘剩餘 tokens ${limits.remainingTokens}${limits.limitTokens != null ? `/${limits.limitTokens}` : ''}${reset}`);
    }
    if (parts.length) $('groqQuotaStatus').textContent = `Groq 額度：${parts.join(' · ')}`;
  }
  async function callAI(action, fields = {}, forcedProvider = null) {
    const provider = forcedProvider || activeProvider();
    const keys = getKeys(provider);
    if (!keys.length) throw new Error('請先輸入 Groq API key。');
    if (!window.callSpeakingAI) throw new Error('Speaking AI 服務尚未部署，請先部署 Supabase speaking-ai Edge Function。');
    const response = await window.callSpeakingAI({ action, provider, keys, ...fields });
    if (provider === 'groq') updateGroqQuota(response.result?.rateLimits);
    return response;
  }
  function conversationHistory(messages) {
    return messages.slice(-22).map(message => message.role === 'assistant'
      ? { role: 'assistant', content: `Natural correction: ${message.correction || ''}\nExplanation: ${message.note || ''}\nFollow-up: ${message.question || ''}` }
      : { role: 'user', content: String(message.content || '') });
  }
  function highlightCorrection(original, correction) {
    const originalWords = new Set((String(original || '').match(/[\p{L}\p{N}']+/gu) || []).map(normalized));
    const savedWords = new Set(speakingData().cards.flatMap(card => (String(card.text || '').match(/[\p{L}\p{N}']+/gu) || []).map(normalized)));
    const wholeSaved = speakingData().cards.some(card => normalized(card.text) === normalized(correction));
    if (wholeSaved) return `<span class="speaking-in-anki">${escapeHtml(correction)}</span>`;
    return String(correction || '').split(/([\p{L}\p{N}']+)/gu).map(token => {
      if (!token) return '';
      const key = normalized(token);
      const escaped = escapeHtml(token);
      if (key && savedWords.has(key)) return `<span class="speaking-in-anki">${escaped}</span>`;
      if (key && !originalWords.has(key)) return `<mark class="speaking-change">${escaped}</mark>`;
      return escaped;
    }).join('');
  }
  function renderMessages() {
    const data = speakingData();
    const host = $('speakingMessages');
    host.innerHTML = data.messages.length ? data.messages.map(message => {
      if (message.role === 'user') return `<article class="speaking-user-message"><span>You</span><p>${escapeHtml(message.content || '')}</p></article>`;
      const original = data.messages.find(item => item.id === message.replyTo)?.content || '';
      return `<article class="speaking-teacher-message" data-speaking-message="${escapeHtml(message.id)}"><div class="speaking-teacher-label"><span class="speaking-teacher-avatar">✳</span><strong>English teacher</strong></div><div class="speaking-correction-label">NATIVE CORRECTION</div><p class="speaking-correction">${highlightCorrection(original, message.correction || '')}</p>${message.note ? `<p class="speaking-note">${escapeHtml(message.note)}</p>` : ''}<div class="speaking-follow-up"><span>LET'S KEEP TALKING</span><p>${escapeHtml(message.question || '')}</p></div><div class="speaking-message-actions"><button type="button" class="text-link" data-save-correction="${escapeHtml(message.id)}">+ ${data.cards?.some(card => normalized(card.text) === normalized(message.correction)) ? '已加入 Anki' : '加入 Anki'}</button><button type="button" class="text-link" data-save-selection="${escapeHtml(message.id)}">&#23559;&#36984;&#21462;&#35422;&#21477;&#21152;&#20837; Anki</button><button type="button" class="text-link" data-review-correction="${escapeHtml(message.id)}">複習這句</button></div></article>`;
    }).join('') : '<div class="speaking-welcome"><span>✳</span><p>Hi, I\'m your English teacher. Tell me anything about your day, and I\'ll help you say it naturally.</p><small>Try a sentence in English to begin.</small></div>';
    host.querySelectorAll('[data-save-correction]').forEach(button => button.addEventListener('click', () => saveCorrection(button.dataset.saveCorrection)));
    host.querySelectorAll('[data-review-correction]').forEach(button => button.addEventListener('click', () => reviewCorrection(button.dataset.reviewCorrection)));
    host.querySelectorAll('[data-save-selection]').forEach(button => {
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        const text = window.getSelection()?.toString().trim();
        if (!text) { showToast('\u5148\u7528\u6ed1\u9f20\u6216\u624b\u6307\u9078\u53d6\u4e00\u6bb5\u8a5e\u53e5\u518d\u52a0\u5165\u3002'); return; }
        const message = speakingData().messages.find(item => item.id === button.dataset.saveSelection);
        const source = message && speakingData().messages.find(item => item.id === message.replyTo);
        if (addCard({ type: $('speakingCardType').value, text, meaning: message?.note || '', context: source?.content || '' })) renderSpeaking();
      });
    });
    const latest = [...data.messages].reverse().find(message => message.role === 'assistant');
    $('speakingFollowActions').classList.toggle('hidden', !latest || Boolean(state.speakingReview));
  }
  function renderGrammarPrompt() {
    let host = $('speakingGrammarPrompt');
    if (!host) {
      host = document.createElement('div'); host.id = 'speakingGrammarPrompt'; host.className = 'speaking-grammar-prompt hidden';
      $('speakingStatus').after(host);
    }
    const issue = speakingData().pendingGrammar;
    if (!issue) { host.classList.add('hidden'); host.innerHTML = ''; return; }
    host.classList.remove('hidden');
    host.innerHTML = `<strong>\u5e38\u898b\u6587\u6cd5</strong><p>${escapeHtml(issue.pattern)} — ${escapeHtml(issue.explanation || '')}</p><span>\u9019\u500b\u932f\u8aa4\u5df2\u51fa\u73fe ${issue.count} \u6b21\uff0c\u8981\u52a0\u5165; Anki \u8907\u7fd2\u55ce\uff1f</span><div><button type="button" class="primary-button" id="addGrammarIssue">\u662f\uff0c\u52a0\u5165</button><button type="button" class="secondary-button" id="skipGrammarIssue">\u4e0b\u6b21\u518d\u8aaa</button></div>`;
    $('addGrammarIssue').addEventListener('click', () => {
      addCard({ type: 'grammar', text: issue.pattern, meaning: issue.explanation, context: issue.example || '', grammarKey: issue.key });
      speakingData().pendingGrammar = null; saveData(); renderSpeaking();
    });
    $('skipGrammarIssue').addEventListener('click', () => {
      const savedIssue = speakingData().grammarErrors.find(item => item.key === issue.key);
      if (savedIssue) savedIssue.nextPromptAt = (savedIssue.count || 0) + 3;
      speakingData().pendingGrammar = null; saveData(); renderSpeaking();
    });
  }
  function renderReviewPanel() {
    const host = $('speakingReviewPanel'), review = state.speakingReview;
    host.classList.toggle('hidden', !review);
    if (!review) { host.innerHTML = ''; return; }
    if (review.complete) {
      host.innerHTML = `<div class="speaking-review-heading"><span>SPACED REVIEW</span><h2>Review complete</h2></div><p>${escapeHtml(review.feedback || 'Great work. Your next review times are updated.')}</p><button type="button" class="secondary-button" id="closeSpeakingReview">Continue chatting</button>`;
      $('closeSpeakingReview').addEventListener('click', () => { state.speakingReview = null; renderSpeaking(); }); return;
    }
    const card = review.queue[review.index];
    if (!card) { state.speakingReview = { complete: true, feedback: '今天的到期複習完成了，做得很好！' }; renderReviewPanel(); return; }
    const phaseText = review.phase === 'need-key' ? '&#35531;&#22635;&#20837; API key &#24460;&#65292;&#25105;&#20497;&#23601;&#38283;&#22987;&#35079;&#32722;&#12290;'
      : review.phase === 'loading' ? '&#25945;&#24107;&#27491;&#22312;&#20986;&#38988;&#8230;'
      : review.phase === 'grading' ? '&#27491;&#22312;&#30475;&#20320;&#30340;&#22238;&#31572;&#8230;'
      : review.phase === 'feedback' ? escapeHtml(review.feedback || '')
      : escapeHtml(review.question || '');
    host.innerHTML = `<div class="speaking-review-heading"><span>SPACED REVIEW · ${review.index + 1} / ${review.queue.length}</span><h2>Let’s review what you’ve learned.</h2></div><p class="speaking-review-question">${phaseText}</p>${review.phase === 'answer' ? `<div class="speaking-review-answer-row"><input id="speakingReviewAnswer" class="text-input" type="text" placeholder="Answer in English"><button id="submitSpeakingReview" class="primary-button" type="button">Submit</button></div>` : ''}${review.phase === 'feedback' ? `<p class="speaking-review-target">${escapeHtml(review.correctedAnswer || '')}</p><button type="button" class="primary-button" id="nextSpeakingReview">${review.index + 1 < review.queue.length ? 'Next card' : 'Finish review'}</button>` : ''}<button type="button" class="review-close-link" id="stopSpeakingReview">Close review</button>`;
    $('stopSpeakingReview').addEventListener('click', () => { state.speakingReview = null; renderSpeaking(); });
    if (review.phase === 'answer') {
      $('submitSpeakingReview').addEventListener('click', submitReviewAnswer);
      $('speakingReviewAnswer').addEventListener('keydown', event => { if (event.key === 'Enter') submitReviewAnswer(); });
    }
    if (review.phase === 'feedback') $('nextSpeakingReview').addEventListener('click', nextReviewCard);
  }
  function renderSavedCards() {
    const cards = speakingData().cards.slice().sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    $('speakingSavedCards').innerHTML = cards.length ? cards.map(card => `<article class="speaking-saved-card"><div><span>${escapeHtml(({sentence:'SENTENCE',phrase:'PHRASE',word:'WORD',grammar:'GRAMMAR'})[card.type] || 'CARD')}</span><strong>${escapeHtml(card.text)}</strong>${card.meaning ? `<small>${escapeHtml(card.meaning)}</small>` : ''}</div><div><button type="button" class="text-link" data-review-card="${escapeHtml(card.id)}">Review</button><button type="button" class="text-link speaking-remove-card" data-remove-card="${escapeHtml(card.id)}" aria-label="Remove card">×</button></div></article>`).join('') : '<p class="speaking-no-cards">No speaking cards yet. Save a correction, word, or phrase to start a review deck.</p>';
    $('speakingSavedCards').querySelectorAll('[data-review-card]').forEach(button => button.addEventListener('click', () => startSpeakingReview(button.dataset.reviewCard)));
    $('speakingSavedCards').querySelectorAll('[data-remove-card]').forEach(button => button.addEventListener('click', () => {
      if (!signedIn()) return;
      speakingData().cards = speakingData().cards.filter(card => card.id !== button.dataset.removeCard);
      saveData(); renderSpeaking();
    }));
  }
  function renderSpeaking() {
    renderMessages(); renderGrammarPrompt(); renderReviewPanel(); renderSavedCards();
    $('speakingStatus').textContent = state.speakingStatus || '';
    $('speakingStatus').classList.toggle('is-error', Boolean(state.speakingError));
    $('speakingComposer').classList.toggle('hidden', Boolean(state.speakingReview));
    $('speakingFollowActions').classList.toggle('hidden', state.speakingBusy || Boolean(state.speakingReview) || ![...speakingData().messages].reverse().some(message => message.role === 'assistant'));
  }
  function updateGrammarIssue(issue) {
    if (!issue || !issue.pattern) return;
    const data = speakingData(), pattern = String(issue.pattern).trim();
    const key = normalized(pattern);
    if (!key || data.cards.some(card => card.type === 'grammar' && (card.grammarKey === key || normalized(card.text) === key))) return;
    let entry = data.grammarErrors.find(item => item.key === key);
    if (!entry) { entry = { key, pattern, count: 0, nextPromptAt: 3 }; data.grammarErrors.push(entry); }
    entry.pattern = pattern; entry.explanation = String(issue.explanation || ''); entry.example = String(issue.example || ''); entry.count = (entry.count || 0) + 1;
    if (entry.count >= (entry.nextPromptAt || 3) && !data.pendingGrammar) data.pendingGrammar = { ...entry };
  }
  async function sendConversation() {
    if (state.speakingBusy || !signedIn()) return;
    const input = $('speakingInput'), content = input.value.trim();
    if (!content) return;
    const data = speakingData(), history = conversationHistory(data.messages);
    data.messages.push({ id: id(), role: 'user', content, at: Date.now() });
    data.messages = data.messages.slice(-200); input.value = '';
    saveData(); state.speakingBusy = true; state.speakingStatus = 'Your teacher is thinking…'; state.speakingError = false; renderSpeaking();
    try {
      const response = await callAI('chat', { messages: [...history, { role: 'user', content }] });
      const result = response.result || {};
      const source = data.messages[data.messages.length - 1];
      const teacher = { id: id(), role: 'assistant', replyTo: source.id, correction: String(result.correction || content), note: String(result.note || ''), question: String(result.question || 'What do you think?'), grammarIssue: result.grammarIssue || null, at: Date.now() };
      data.messages.push(teacher); updateGrammarIssue(teacher.grammarIssue); saveData();
      state.speakingStatus = ''; state.speakingError = false;
    } catch (error) { state.speakingStatus = error.message || 'AI request failed.'; state.speakingError = true; }
    finally { state.speakingBusy = false; renderSpeaking(); }
  }
  function addCard({ type, text, meaning = '', context = '', grammarKey = '' }) {
    if (!signedIn()) return false;
    const cleanText = String(text || '').trim();
    if (!cleanText) return false;
    const existing = speakingData().cards.find(card => card.type === type && normalized(card.text) === normalized(cleanText));
    if (existing) { showToast('這張卡已經在 Anki 裡了。'); return false; }
    speakingData().cards.unshift({ id: id(), type, text: cleanText, meaning: String(meaning || '').trim(), context: String(context || '').trim(), grammarKey, addedAt: Date.now(), dueAt: Date.now(), intervalDays: 0, repetitions: 0 });
    saveData(); showToast('已加入 Speaking Anki。'); return true;
  }
  function saveCorrection(messageId) {
    const message = speakingData().messages.find(item => item.id === messageId && item.role === 'assistant');
    const source = message && speakingData().messages.find(item => item.id === message.replyTo);
    if (message && addCard({ type: 'sentence', text: message.correction, meaning: message.note, context: source?.content || '' })) renderSpeaking();
  }
  function reviewCorrection(messageId) {
    const message = speakingData().messages.find(item => item.id === messageId && item.role === 'assistant');
    const source = message && speakingData().messages.find(item => item.id === message.replyTo);
    if (!message) return;
    const existing = speakingData().cards.find(card => normalized(card.text) === normalized(message.correction));
    const card = existing || { id: 'preview-' + message.id, type: 'sentence', text: message.correction, meaning: message.note, context: source?.content || '', temporary: true };
    startSpeakingReview(card.id, card);
  }
  async function startSpeakingReview(cardId = '', customCard = null) {
    if (!signedIn()) return;
    const cards = speakingData().cards;
    let queue = customCard ? [customCard] : cardId ? cards.filter(card => card.id === cardId) : cards.filter(card => (card.dueAt || 0) <= Date.now()).sort((a, b) => a.dueAt - b.dueAt);
    if (!queue.length) { state.speakingReview = null; state.speakingStatus = '我們來複習吧！今天沒有到期的口說卡，先聊聊英文也可以。'; state.speakingError = false; renderSpeaking(); return; }
    state.speakingReview = { queue: queue.map(card => ({ ...card })), index: 0, phase: getKeys(activeProvider()).length ? 'loading' : 'need-key', question: '', feedback: '' };
    state.speakingStatus = ''; renderSpeaking();
    await maybeGenerateReviewQuestion();
  }
  async function maybeGenerateReviewQuestion() {
    const review = state.speakingReview;
    if (!review || !['need-key', 'loading'].includes(review.phase) || !getKeys(activeProvider()).length || state.speakingBusy) return;
    review.phase = 'loading'; state.speakingBusy = true; state.speakingStatus = 'Your teacher is preparing a recall question…'; renderSpeaking();
    try {
      const card = review.queue[review.index];
      const response = await callAI('review-question', { card });
      review.question = String(response.result?.question || '請用英文說出這張卡的內容。'); review.phase = 'answer'; state.speakingStatus = '';
    } catch (error) { review.phase = 'need-key'; state.speakingStatus = error.message; state.speakingError = true; }
    finally { state.speakingBusy = false; renderSpeaking(); $('speakingReviewAnswer')?.focus(); }
  }
  function setReviewSchedule(card, grade) {
    if (!card || card.temporary) return;
    const stored = speakingData().cards.find(item => item.id === card.id);
    if (!stored) return;
    const now = Date.now(), previous = stored.intervalDays || 0, reps = stored.repetitions || 0;
    let days;
    if (grade <= 0) { days = 10 / 1440; stored.repetitions = 0; }
    else if (grade === 1) { days = 1; stored.repetitions = reps + 1; }
    else if (grade === 2) { days = reps === 0 ? 1 : reps === 1 ? 3 : Math.max(3, previous * 2); stored.repetitions = reps + 1; }
    else { days = reps === 0 ? 4 : Math.max(4, previous * 2.5); stored.repetitions = reps + 1; }
    stored.intervalDays = days; stored.dueAt = now + days * 86400000; stored.lastReviewedAt = now; stored.lastGrade = grade;
  }
  async function submitReviewAnswer() {
    const review = state.speakingReview, input = $('speakingReviewAnswer');
    if (!review || review.phase !== 'answer' || state.speakingBusy || !input?.value.trim()) return;
    if (!signedIn()) return;
    const answer = input.value.trim(), card = review.queue[review.index];
    review.answer = answer; review.phase = 'grading'; state.speakingBusy = true; renderSpeaking();
    try {
      const response = await callAI('review-grade', { card, question: review.question, answer });
      const result = response.result || {}, grade = Math.max(0, Math.min(3, Number(result.grade) || 0));
      setReviewSchedule(card, grade); saveData();
      review.phase = 'feedback'; review.feedback = String(result.feedback || '回答已記錄，複習時間已安排。'); review.correctedAnswer = String(result.correctedAnswer || card.text);
      state.speakingStatus = '';
    } catch (error) { review.phase = 'answer'; state.speakingStatus = error.message; state.speakingError = true; }
    finally { state.speakingBusy = false; renderSpeaking(); }
  }
  async function nextReviewCard() {
    const review = state.speakingReview;
    if (!review) return;
    review.index += 1;
    if (review.index >= review.queue.length) {
      state.speakingReview = { complete: true, feedback: '本輪複習完成！下次複習時間已自動安排。' }; renderSpeaking(); return;
    }
    review.phase = getKeys(activeProvider()).length ? 'loading' : 'need-key'; review.question = ''; review.feedback = ''; renderSpeaking();
    await maybeGenerateReviewQuestion();
  }
  async function transcribeRecording(blob) {
    const keys = getKeys('groq');
    if (!keys.length) throw new Error('語音辨識需要 Groq API key，請先填入 Groq 金鑰。');
    if (blob.size > 24 * 1024 * 1024) throw new Error('錄音太大，請縮短後再試。');
    const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('無法讀取錄音。')); reader.readAsDataURL(blob); });
    const response = await window.callSpeakingAI({ action: 'transcribe', provider: 'groq', keys, audioBase64: String(dataUrl).split(',')[1], mimeType: blob.type || 'audio/webm' });
    $('speakingInput').value = response.transcript || '';
    $('speakingInput').focus();
    state.speakingStatus = response.transcript ? '語音已轉成英文文字，確認後再按送出。' : '沒有辨識到語音，請再試一次。'; state.speakingError = false; renderSpeaking();
  }
  async function toggleRecording() {
    if (state.speakingRecorder && state.speakingRecorder.state === 'recording') { state.speakingRecorder.stop(); return; }
    if (!signedIn()) return;
    if (!getKeys('groq').length) { state.speakingStatus = '語音輸入需要 Groq API key。'; state.speakingError = true; renderSpeaking(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) { state.speakingStatus = '此瀏覽器不支援錄音，請使用文字輸入。'; state.speakingError = true; renderSpeaking(); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined), chunks = [];
      state.speakingRecorder = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(track => track.stop()); state.speakingRecorder = null;
        $('speakingMic').textContent = '🎙 語音輸入'; state.speakingBusy = true; state.speakingStatus = '正在辨識英文語音…'; state.speakingError = false; renderSpeaking();
        try { await transcribeRecording(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' })); }
        catch (error) { state.speakingStatus = error.message; state.speakingError = true; }
        finally { state.speakingBusy = false; renderSpeaking(); }
      };
      recorder.start(); $('speakingMic').textContent = '■ 停止錄音'; state.speakingStatus = '正在錄音，說完後再按一次。'; state.speakingError = false;
      state.speakingRecordingTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 30000); renderSpeaking();
    } catch (error) { state.speakingStatus = error.message || '無法使用麥克風。'; state.speakingError = true; renderSpeaking(); }
  }
  function setup() {
    renderKeyInputs('groq');
    $('toggleSpeakingSettings')?.addEventListener('click', event => {
      const content = $('speakingSettingsContent');
      const expanded = event.currentTarget.getAttribute('aria-expanded') === 'true';
      event.currentTarget.setAttribute('aria-expanded', String(!expanded));
      content.classList.toggle('hidden', expanded);
      event.currentTarget.textContent = expanded ? '\u5c55\u958b \u2193' : '\u6536\u5408 \u2191';
    });
    window.addEventListener('supabase-user-changed', event => {
      const nextUserId = event.detail?.userId || null;
      if (state.speakingKeysUserId && state.speakingKeysUserId !== nextUserId) {
        state.speakingKeys = { groq: [''] };
        state.speakingKeysLoaded = false;
        state.speakingKeysUserId = null;
        renderKeyInputs('groq');
        setKeyStatus('帳戶已切換，請載入該帳戶的 keys。');
      }
      if (nextUserId && state.view === 'speaking') loadSpeakingKeys();
    });
    document.querySelectorAll('[data-add-key]').forEach(button => button.addEventListener('click', () => {
      const provider = button.dataset.addKey;
      if (state.speakingKeys[provider].length >= 5) { showToast('每個服務最多可填入 5 組 key。'); return; }
      state.speakingKeys[provider].push(''); renderKeyInputs(provider);
      document.querySelectorAll(`[data-key-provider="${provider}"]`).at(-1)?.focus();
    }));
    $('saveSpeakingKeys')?.addEventListener('click', saveSpeakingKeys);
    $('clearSpeakingKeys')?.addEventListener('click', clearSpeakingKeys);
    $('sendSpeaking').addEventListener('click', () => state.speakingReview ? submitReviewAnswer() : sendConversation());
    $('speakingInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendConversation(); } });
    $('speakingMic').addEventListener('click', toggleRecording);
    $('newSpeakingChat').addEventListener('click', () => { if (!signedIn() || !window.confirm('\u958b\u59cb\u65b0\u5c0d\u8a71\u6703\u6e05\u9664\u76ee\u524d\u5c0d\u8a71\u6b77\u53f2\uff0c\u5df2\u5b58\u5165 Anki \u7684\u5361\u7247\u6703\u4fdd\u7559\u3002\u7e7c\u7e8c\u55ce\uff1f')) return; speakingData().messages = []; state.speakingReview = null; state.speakingStatus = ''; saveData(); renderSpeaking(); });
    $('continueSpeaking').addEventListener('click', () => $('speakingInput').focus());
    $('reviewCurrentCorrection').addEventListener('click', () => { const message = [...speakingData().messages].reverse().find(item => item.role === 'assistant'); if (message) reviewCorrection(message.id); });
    $('saveCurrentCorrection').addEventListener('click', () => { const message = [...speakingData().messages].reverse().find(item => item.role === 'assistant'); if (message) saveCorrection(message.id); });
    $('addSpeakingCard').addEventListener('click', () => {
      const added = addCard({ type: $('speakingCardType').value, text: $('speakingCardText').value, meaning: $('speakingCardMeaning').value });
      if (added) { $('speakingCardText').value = ''; $('speakingCardMeaning').value = ''; renderSpeaking(); }
    });
  }
  setup();
  const originalSetView = setView;
  setView = function(view) {
    originalSetView(view);
    if (view === 'speaking') {
      $('pageTitle').textContent = '英文口說練習';
      renderSpeaking();
      loadSpeakingKeys();
      if (!state.speakingReview && speakingData().cards.some(card => (card.dueAt || 0) <= Date.now())) startSpeakingReview();
      else if (!speakingData().cards.some(card => (card.dueAt || 0) <= Date.now())) { state.speakingStatus = '我們來複習吧！今天沒有到期的口說卡，來聊聊英文也可以。'; renderSpeaking(); }
    }
  };
  const originalRender = render;
  render = function() { originalRender(); if (state.view === 'speaking') renderSpeaking(); };
})();
