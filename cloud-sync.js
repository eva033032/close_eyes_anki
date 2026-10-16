(() => {
  'use strict';
  const PROJECT_URL = 'https://boxrkjgswlzbxeyvxgta.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_1EWOYLfSrshlYW_d-iPqhA_njZv9zCC';
  const TABLE = 'user_learning_data';
  const client = window.supabase?.createClient(PROJECT_URL, PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false }
  });
  const $ = id => document.getElementById(id);
  const modal = $('authModal'), message = $('authMessage'), authButton = $('authButton');
  let session = null, syncReady = false, syncTimer = null, writeQueue = Promise.resolve(), publicSyncPending = false, publicSyncAvailable = null;

  function showMessage(text, error = false) {
    message.textContent = text;
    message.classList.toggle('auth-error', error);
  }
  function updateAuthUI() {
    const signedIn = Boolean(session);
    window.currentSupabaseUserId = session?.user?.id || null;
    window.dispatchEvent(new CustomEvent('supabase-user-changed', { detail: { userId: window.currentSupabaseUserId } }));
    authButton.textContent = signedIn ? `已登入：${session.user.email}` : '登入 Supabase';
    authButton.classList.toggle('is-signed-in', signedIn);
    $('signInButton').classList.toggle('hidden', signedIn);
    $('signUpButton').classList.toggle('hidden', signedIn);
    $('signedInActions').classList.toggle('hidden', !syncReady);
    if (signedIn) showMessage('正在確認 Supabase 雲端資料…');
  }
  function emptyData() {
    return { articles: [], folders: [], saved: [], lastSession: null, review: {}, speaking: { messages: [], cards: [], grammarErrors: [] }, listeningSeconds: 0, dayStamp: '', streak: 0, lastStudyDay: '' };
  }
  function publicArticle(article) {
    return {
      title: article.title || 'Untitled',
      sourceType: article.sourceType || '',
      sourceLabel: article.sourceLabel || '',
      sourceUrl: article.sourceUrl || '',
      sourceLanguage: article.sourceLanguage || 'en',
      targetLanguage: article.targetLanguage || 'zh-TW',
      totalChars: article.totalChars || 0,
      sourceText: article.sourceText || '',
      sentences: Array.isArray(article.sentences) ? article.sentences : []
    };
  }
  async function syncPublicItems(data, userId) {
    const rows = [];
    (data.articles || []).filter(article => article.isPublic).forEach(article => rows.push({
      item_id: userId + ':article:' + String(article.id), owner_id: userId, kind: 'article',
      title: article.title || 'Untitled', payload: { article: publicArticle(article) },
      updated_at: new Date().toISOString()
    }));
    (data.folders || []).filter(folder => folder.isPublic).forEach(folder => {
      const articles = (data.articles || []).filter(article => article.folderId === folder.id).map(publicArticle);
      rows.push({
        item_id: userId + ':folder:' + String(folder.id), owner_id: userId, kind: 'folder',
        title: folder.name || 'Untitled folder',
        payload: { folder: { name: folder.name || 'Untitled folder' }, articles },
        updated_at: new Date().toISOString()
      });
    });
    const { data: existing, error: listError } = await client.from('shared_library_items')
      .select('item_id').eq('owner_id', userId);
    if (listError) throw listError;
    if (rows.length) {
      const { error } = await client.from('shared_library_items').upsert(rows, { onConflict: 'item_id' });
      if (error) throw error;
    }
    const keep = new Set(rows.map(row => row.item_id));
    const stale = (existing || []).map(row => row.item_id).filter(id => !keep.has(id));
    if (stale.length) {
      const { error } = await client.from('shared_library_items').delete().eq('owner_id', userId).in('item_id', stale);
      if (error) throw error;
    }
  }
  window.syncPublicLibrary = async data => {
    if (!syncReady || !session) return false;
    publicSyncPending = true;
    publicSyncAvailable = null;
    try {
      await syncPublicItems(data, session.user.id);
      publicSyncPending = false;
      publicSyncAvailable = true;
      showMessage('公開項目已更新。');
      return true;
    } catch (error) {
      console.error('Public library sync failed:', error);
      showMessage('公開狀態更新失敗：' + error.message + '。請確認已執行新版 Supabase SQL 設定。', true);
      return false;
    }
  };
  window.callSpeakingAI = async payload => {
    if (!syncReady || !session) throw new Error('請先登入 Supabase。');
    const { data, error } = await client.functions.invoke('speaking-ai', { body: payload });
    if (error) {
      let message = error.message;
      try { message = (await error.context?.json())?.error || message; } catch (_) {}
      throw new Error(message);
    }
    return data;
  };
  window.manageSpeakingKeys = async (action, keys) => window.callSpeakingAI({ action, keys });
  window.fetchSharedLibrary = async () => {
    if (!syncReady || !session) throw new Error('請先登入 Supabase。');
    const { data, error } = await client.from('shared_library_items')
      .select('item_id,owner_id,kind,title,payload,updated_at')
      .order('updated_at', { ascending: false })
      .limit(200);
    if (error) throw error;
    publicSyncAvailable = true;
    if (publicSyncPending) {
      try {
        await syncPublicItems(state.data, session.user.id);
        publicSyncPending = false;
      } catch (syncError) {
        publicSyncAvailable = false;
        console.error('Public library reconciliation failed:', syncError);
      }
    }
    return data || [];
  };
  function clearLegacyLocalLearningData() {
    try {
      localStorage.removeItem('close-eyes-v1');
      Object.keys(localStorage).filter(key => key.startsWith('close-eyes-cloud-initialized:')).forEach(key => localStorage.removeItem(key));
    } catch (_) {}
  }
  function clearPersistedAuthSession() {
    try { localStorage.removeItem('sb-boxrkjgswlzbxeyvxgta-auth-token'); } catch (_) {}
  }
  async function writeCloud(payload, userId = session?.user?.id) {
    if (!userId) throw new Error('請先登入 Supabase。');
    const snapshot = JSON.parse(JSON.stringify(payload));
    writeQueue = writeQueue.then(async () => {
      const { error } = await client.from(TABLE).upsert(
        { user_id: userId, payload: snapshot, updated_at: new Date().toISOString() },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
    });
    try {
      await writeQueue;
      if (session?.user?.id === userId) {
        authButton.textContent = `已同步：${session.user.email}`;
        showMessage('資料已儲存至 Supabase。');
      }
      if (publicSyncAvailable !== false && (publicSyncPending || (snapshot.articles || []).some(article => article.isPublic) || (snapshot.folders || []).some(folder => folder.isPublic))) {
        try {
          await syncPublicItems(snapshot, userId);
          publicSyncPending = false;
          publicSyncAvailable = true;
        } catch (error) {
          publicSyncPending = true;
          publicSyncAvailable = false;
          console.error('Public library sync failed:', error);
          showMessage('公開項目同步失敗：' + error.message + '。請確認已執行新版 Supabase SQL 設定。儲存的學習資料不受影響。', true);
        }
      }
    } catch (error) {
      writeQueue = Promise.resolve();
      console.error('Supabase sync failed:', error);
      authButton.textContent = '雲端儲存失敗';
      showMessage(`雲端儲存失敗：${error.message}。請檢查網路及 Supabase SQL 設定。`, true);
      throw error;
    }
  }
  async function syncFromCloud(user) {
    syncReady = false;
    showMessage('正在從 Supabase 載入資料…');
    const { data: row, error } = await client.from(TABLE).select('payload').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    const remote = row?.payload && typeof row.payload === 'object' ? row.payload : emptyData();
    remote.articles = Array.isArray(remote.articles) ? remote.articles : [];
    remote.folders = Array.isArray(remote.folders) ? remote.folders : [];
    remote.saved = Array.isArray(remote.saved) ? remote.saved : [];
    remote.review = remote.review && typeof remote.review === 'object' ? remote.review : {};
    remote.speaking = remote.speaking && typeof remote.speaking === 'object' ? remote.speaking : { messages: [], cards: [], grammarErrors: [] };
    remote.speaking.messages = Array.isArray(remote.speaking.messages) ? remote.speaking.messages.slice(-200) : [];
    remote.speaking.cards = Array.isArray(remote.speaking.cards) ? remote.speaking.cards : [];
    remote.speaking.grammarErrors = Array.isArray(remote.speaking.grammarErrors) ? remote.speaking.grammarErrors : [];
    if (!row) await writeCloud(remote, user.id);
    clearLegacyLocalLearningData();
    state.data = remote;
    syncReady = true;
    updateAuthUI();
    render();
    modal.classList.add('hidden');
    try {
      await syncPublicItems(remote, user.id);
      publicSyncPending = false;
      publicSyncAvailable = true;
      showMessage('已載入 Supabase 雲端資料。');
    } catch (publicError) {
      publicSyncPending = true;
      publicSyncAvailable = false;
      console.error('Public library setup is unavailable:', publicError);
      showMessage('學習資料已載入。公開分享功能需要執行新版 supabase-setup.sql。', true);
    }
  }
  window.saveLearningData = data => {
    if (!syncReady || !session) {
      showMessage('尚未連上 Supabase，資料未儲存。', true);
      return;
    }
    clearTimeout(syncTimer);
    authButton.textContent = '正在儲存至 Supabase…';
    showMessage('正在儲存至 Supabase…');
    syncTimer = setTimeout(() => writeCloud(data).catch(() => {}), 500);
  };
  function flushPendingSave() {
    if (!syncReady || !session) return Promise.resolve();
    clearTimeout(syncTimer);
    syncTimer = null;
    return writeCloud(state.data);
  }
  window.addEventListener('pagehide', () => flushPendingSave().catch(() => {}));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushPendingSave().catch(() => {});
  });
  async function signIn() {
    if (!client) return showMessage('Supabase SDK 載入失敗，請確認網路。', true);
    const email = $('authEmail').value.trim(), password = $('authPassword').value;
    if (!email || !password) return showMessage('請輸入 Email 和密碼。', true);
    $('signInButton').disabled = true;
    showMessage('正在登入並載入 Supabase 資料…');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    $('signInButton').disabled = false;
    if (error) return showMessage(error.message, true);
    session = data.session;
    updateAuthUI();
    try { await syncFromCloud(session.user); }
    catch (e) { syncReady = false; showMessage(`無法載入 Supabase 資料：${e.message}`, true); }
  }
  async function signUp() {
    if (!client) return showMessage('Supabase SDK 載入失敗，請確認網路。', true);
    const email = $('authEmail').value.trim(), password = $('authPassword').value;
    if (!email || !password) return showMessage('請輸入 Email 和密碼。', true);
    if (password.length < 6) return showMessage('密碼至少需要 6 個字元。', true);
    $('signUpButton').disabled = true;
    showMessage('正在建立 Supabase 帳號…');
    const { data, error } = await client.auth.signUp({ email, password });
    $('signUpButton').disabled = false;
    if (error) return showMessage(error.message, true);
    if (!data.session) return showMessage('帳號已建立。請先到 Email 收取驗證信，再回來登入。');
    session = data.session;
    updateAuthUI();
    try { await syncFromCloud(session.user); }
    catch (e) { syncReady = false; showMessage(`帳號已建立，但無法載入雲端資料：${e.message}`, true); }
  }
  async function signOut() {
    try {
      await flushPendingSave();
      await writeQueue;
    } catch (_) {
      return showMessage('資料尚未成功儲存至 Supabase，請確認網路後再登出。', true);
    }
    syncReady = false;
    const { error } = await client.auth.signOut();
    if (error) return showMessage(error.message, true);
    session = null;
    state.data = emptyData();
    updateAuthUI();
    modal.classList.remove('hidden');
    $('authPassword').value = '';
    render();
    showMessage('已登出。再次登入 Supabase 後才能使用學習資料。');
  }
  authButton.addEventListener('click', () => { updateAuthUI(); modal.classList.remove('hidden'); });
  $('signInButton').addEventListener('click', signIn);
  $('signUpButton').addEventListener('click', signUp);
  $('signOutButton').addEventListener('click', signOut);
  $('closeAuthModal').addEventListener('click', () => modal.classList.add('hidden'));
  $('authPassword').addEventListener('keydown', event => { if (event.key === 'Enter') signIn(); });
  clearPersistedAuthSession();
  if (!client) {
    showMessage('Supabase SDK 載入失敗，無法使用此應用程式。', true);
    modal.classList.remove('hidden');
    return;
  }
  modal.classList.remove('hidden');
  showMessage('登入或建立 Supabase 帳號以載入雲端資料。');
  client.auth.onAuthStateChange((event, next) => {
    if (event === 'SIGNED_OUT') {
      session = null;
      syncReady = false;
      state.data = emptyData();
      updateAuthUI();
      modal.classList.remove('hidden');
      render();
    }
  });
})();
