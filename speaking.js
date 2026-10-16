(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const id = () => crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random();
  state.speakingKeys = { groq: [''] };
  state.speakingKeysLoaded = false;
  state.speakingBusy = false;
  state.speakingRecorder = null;
  let speakingSpeechRunId = 0;

  function speakingData() {
    state.data.speaking = state.data.speaking && typeof state.data.speaking === 'object'
      ? state.data.speaking : { messages: [], cards: [], grammarErrors: [], pendingGrammar: null };
    const data = state.data.speaking;
    data.messages = Array.isArray(data.messages) ? data.messages : [];
    data.cards = Array.isArray(data.cards) ? data.cards : [];
    data.grammarErrors = Array.isArray(data.grammarErrors) ? data.grammarErrors : [];
    data.autoSpeak = data.autoSpeak !== false;
    data.correctionSpeakCount = Math.max(1, Math.min(5, Number(data.correctionSpeakCount) || 2));
    return data;
  }
  function speakTeacherReply(teacher) {
    if (!speakingData().autoSpeak || !('speechSynthesis' in window) || !window.SpeechSynthesisUtterance) return;
    const phrases = [
      ...Array(speakingData().correctionSpeakCount).fill({ text: String(teacher.correction || '').trim(), lang: 'en-US' }),
      ...(String(teacher.note || '').trim() ? [{ text: String(teacher.note).trim(), lang: 'en-US' }] : []),
      ...(String(teacher.question || '').trim() ? [{ text: String(teacher.question).trim(), lang: 'en-US' }] : [])
    ];
    if (!phrases.length || !phrases[0].text) return;
    const runId = ++speakingSpeechRunId;
    window.speechSynthesis.cancel();
    let index = 0;
    const playNext = () => {
      if (runId !== speakingSpeechRunId || index >= phrases.length) return;
      const phrase = phrases[index++];
      if (!phrase.text) { playNext(); return; }
      const utterance = new SpeechSynthesisUtterance(phrase.text);
      utterance.lang = phrase.lang;
      utterance.rate = phrase.lang === 'zh-TW' ? 0.92 : 0.95;
      utterance.onend = () => { if (runId === speakingSpeechRunId) setTimeout(playNext, index < phrases.length ? 280 : 0); };
      utterance.onerror = () => { if (runId === speakingSpeechRunId) setTimeout(playNext, 100); };
      window.speechSynthesis.speak(utterance);
    };
    playNext();
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
    if (parts.length) {
      $('groqQuotaStatus').textContent = `Groq 額度：${parts.join(' · ')}`;
      $('groqQuotaPanel').classList.remove('hidden');
    }
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
      return `<article class="speaking-teacher-message" data-speaking-message="${escapeHtml(message.id)}"><div class="speaking-teacher-label"><span class="speaking-teacher-avatar">✳</span><strong>English teacher</strong></div><div class="speaking-correction-label">NATIVE CORRECTION</div><p class="speaking-correction">${highlightCorrection(original, message.correction || '')}</p>${message.note ? `<p class="speaking-note">${escapeHtml(message.note)}</p>` : ''}<div class="speaking-follow-up"><span>LET'S KEEP TALKING</span><p>${escapeHtml(message.question || '')}</p></div><div class="speaking-message-actions"><button type="button" class="text-link" data-save-correction="${escapeHtml(message.id)}">+ ${data.cards?.some(card => normalized(card.text) === normalized(message.correction)) ? '已加入 Anki' : '加入 Anki'}</button><button type="button" class="text-link" data-save-selection="${escapeHtml(message.id)}">&#23559;&#36984;&#21462;&#35422;&#21477;&#21152;&#20837; Anki</button></div></article>`;
    }).join('') : '<div class="speaking-welcome"><span>✳</span><p>Hi, I\'m your English teacher. Tell me anything about your day, and I\'ll help you say it naturally.</p><small>Try a sentence in English to begin.</small></div>';
    host.querySelectorAll('[data-save-correction]').forEach(button => button.addEventListener('click', () => saveCorrection(button.dataset.saveCorrection)));
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
    $('speakingFollowActions').classList.toggle('hidden', !latest);
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
  function renderSavedCards() {
    const cards = speakingData().cards.slice().sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    const host = $('speakingSavedCards');
    host.innerHTML = cards.length ? cards.map(card => {
      const dueLabel = (card.dueAt || 0) <= Date.now() ? '\u5f85\u8907\u7fd2' : '\u4e0b\u6b21\u8907\u7fd2 ' + new Date(card.dueAt).toLocaleDateString('zh-TW');
      return `<article class="speaking-saved-card"><div><span>${escapeHtml(({sentence:'SENTENCE',phrase:'PHRASE',word:'WORD',grammar:'GRAMMAR'})[card.type] || 'CARD')} &middot; ${dueLabel}</span><strong>${escapeHtml(card.text)}</strong>${card.meaning ? `<small>${escapeHtml(card.meaning)}</small>` : ''}</div><button type="button" class="text-link speaking-remove-card" data-remove-card="${escapeHtml(card.id)}" aria-label="Remove card">&#215;</button></article>`;
    }).join('') : '<p class="speaking-no-cards">No speaking cards yet. Save a correction, word, or phrase to start a review deck.</p>';
    host.querySelectorAll('[data-remove-card]').forEach(button => button.addEventListener('click', () => {
      if (!signedIn()) return;
      speakingData().cards = speakingData().cards.filter(card => card.id !== button.dataset.removeCard);
      saveData(); render();
    }));
  }
  function renderSavedSpeakingCards() {
    const deck = $('speakingSavedDeck'), host = $('speakingSavedLibraryList');
    if (!deck || !host) return;
    const cards = speakingData().cards.slice().sort((a, b) => (a.dueAt || 0) - (b.dueAt || 0));
    deck.classList.toggle('hidden', !cards.length);
    const totalCards = cards.length, dueCards = cards.filter(card => (card.dueAt || 0) <= Date.now()).length;
    $('savedSummary').textContent = state.data.saved.length + ' \u53e5\u6536\u85cf \u00b7 ' + totalCards + ' \u5f35\u53e3\u8aaa\u5361';
    $('emptySaved').classList.toggle('hidden', state.data.saved.length + totalCards > 0);
    $('savedCount').textContent = state.data.saved.length + totalCards;
    $('dueCount').textContent = state.data.saved.filter(item => (item.dueAt || 0) <= Date.now()).length + dueCards;
    host.innerHTML = cards.map(card => {
      const dueLabel = (card.dueAt || 0) <= Date.now() ? '\u5f85\u8907\u7fd2' : '\u4e0b\u6b21\u8907\u7fd2 ' + new Date(card.dueAt).toLocaleDateString('zh-TW');
      const types = {sentence:'\u53e5\u5b50',phrase:'\u7247\u8a9e',word:'\u55ae\u5b57',grammar:'\u6587\u6cd5'};
      return `<article class="speaking-library-card"><div><span>${escapeHtml(types[card.type] || '\u53e3\u8aaa\u5361')} &middot; ${dueLabel}</span><strong>${escapeHtml(card.text)}</strong>${card.meaning ? `<small>${escapeHtml(card.meaning)}</small>` : card.context ? `<small>${escapeHtml(card.context)}</small>` : ''}</div><button type="button" class="text-link speaking-remove-card" data-remove-library-card="${escapeHtml(card.id)}">\u522a\u9664</button></article>`;
    }).join('');
    host.querySelectorAll('[data-remove-library-card]').forEach(button => button.addEventListener('click', () => {
      if (!signedIn()) return;
      speakingData().cards = speakingData().cards.filter(card => card.id !== button.dataset.removeLibraryCard);
      saveData(); render();
    }));
  }
  function renderSpeaking() {
    renderMessages(); renderGrammarPrompt(); renderSavedCards(); renderSavedSpeakingCards();
    $('speakingAutoSpeak').checked = speakingData().autoSpeak;
    $('speakingCorrectionRepeats').value = String(speakingData().correctionSpeakCount);
    $('speakingStatus').textContent = state.speakingStatus || '';
    $('speakingStatus').classList.toggle('is-error', Boolean(state.speakingError));
    $('speakingFollowActions').classList.toggle('hidden', state.speakingBusy || ![...speakingData().messages].reverse().some(message => message.role === 'assistant'));
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
      speakTeacherReply(teacher);
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
    $('toggleSavedCards')?.addEventListener('click', event => {
      const content = $('speakingSavedCardsContent');
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
    $('sendSpeaking').addEventListener('click', sendConversation);
    $('speakingAutoSpeak').addEventListener('change', event => { speakingData().autoSpeak = event.currentTarget.checked; if (!event.currentTarget.checked) { speakingSpeechRunId += 1; window.speechSynthesis?.cancel(); } saveData(); });
    $('speakingCorrectionRepeats').addEventListener('change', event => { speakingData().correctionSpeakCount = Math.max(1, Math.min(5, Number(event.currentTarget.value) || 2)); saveData(); });
    $('speakingInput').addEventListener('keydown', event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendConversation(); } });
    $('speakingMic').addEventListener('click', toggleRecording);
    $('newSpeakingChat').addEventListener('click', () => { if (!signedIn() || !window.confirm('\u958b\u59cb\u65b0\u5c0d\u8a71\u6703\u6e05\u9664\u76ee\u524d\u5c0d\u8a71\u6b77\u53f2\uff0c\u5df2\u5b58\u5165 Anki \u7684\u5361\u7247\u6703\u4fdd\u7559\u3002\u7e7c\u7e8c\u55ce\uff1f')) return; speakingData().messages = []; state.speakingStatus = ''; saveData(); renderSpeaking(); });
    $('continueSpeaking').addEventListener('click', () => $('speakingInput').focus());
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
    }
  };
  const originalRenderSaved = renderSaved;
  renderSaved = function() {
    originalRenderSaved();
    const count = speakingData().cards.length;
    $('savedSummary').textContent = state.data.saved.length + ' \u53e5\u6536\u85cf \u00b7 ' + count + ' \u5f35\u53e3\u8aaa\u5361';
    $('emptySaved').classList.toggle('hidden', state.data.saved.length + count > 0);
    renderSavedSpeakingCards();
  };
  const originalRender = render;
  render = function() { originalRender(); if (state.view === 'speaking') renderSpeaking(); };
})();
