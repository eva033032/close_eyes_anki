(() => {
  'use strict';
  const PROJECT_URL = 'https://boxrkjgswlzbxeyvxgta.supabase.co';
  const PUBLISHABLE_KEY = 'sb_publishable_1EWOYLfSrshlYW_d-iPqhA_njZv9zCC';
  const STORAGE_KEY = 'close-eyes-v1';
  const TABLE = 'user_learning_data';
  const client = window.supabase?.createClient(PROJECT_URL, PUBLISHABLE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  const $ = id => document.getElementById(id);
  let session = null, syncReady = false, syncTimer = null, syncing = false;
  const modal = $('authModal'), message = $('authMessage'), authButton = $('authButton');
  const nativeSetItem = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, value) {
    nativeSetItem.call(this, key, value);
    if (key === STORAGE_KEY && this === window.localStorage) scheduleSync();
  };
  function showMessage(text, error = false) { message.textContent = text; message.classList.toggle('auth-error', error); }
  function updateAuthUI() {
    const signedIn = Boolean(session);
    authButton.textContent = signedIn ? `已登入：${session.user.email}` : '登入以同步';
    authButton.classList.toggle('is-signed-in', signedIn);
    $('guestMode').classList.toggle('hidden', signedIn);
    $('signInButton').classList.toggle('hidden', signedIn);
    $('signUpButton').classList.toggle('hidden', signedIn);
    $('signedInActions').classList.toggle('hidden', !signedIn);
    if (signedIn) showMessage('此帳號的資料會在裝置間同步。');
  }
  function emptyData() { return { articles: [], saved: [], lastSession: null, review: {}, listeningSeconds: 0, dayStamp: '', streak: 0, lastStudyDay: '' }; }
  function localData() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || emptyData(); } catch (_) { return emptyData(); } }
  function mergeFirstLogin(local, cloud) {
    const articles = new Map();
    [...(cloud.articles || []), ...(local.articles || [])].forEach(article => {
      const previous = articles.get(article.id);
      if (!previous || Date.parse(article.updatedAt || article.createdAt || 0) >= Date.parse(previous.updatedAt || previous.createdAt || 0)) articles.set(article.id, article);
    });
    const saved = new Map();
    [...(cloud.saved || []), ...(local.saved || [])].forEach(item => saved.set(`${item.articleId}:${item.sentenceIndex}`, item));
    return { ...cloud, ...local, articles: [...articles.values()], saved: [...saved.values()], lastSession: local.lastSession || cloud.lastSession, listeningSeconds: Math.max(local.listeningSeconds || 0, cloud.listeningSeconds || 0), streak: Math.max(local.streak || 0, cloud.streak || 0), lastStudyDay: local.lastStudyDay || cloud.lastStudyDay };
  }
  async function writeCloud(payload, userId = session?.user?.id) {
    if (!userId || syncing) return;
    syncing = true;
    try {
      const { error } = await client.from(TABLE).upsert({ user_id: userId, payload, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw error;
      if (session) authButton.textContent = `已同步：${session.user.email}`;
    } catch (error) {
      console.error('Supabase sync failed:', error);
      authButton.textContent = '同步失敗';
      showMessage(`雲端同步失敗：${error.message}。請確認已執行 Supabase SQL 設定。`, true);
    } finally { syncing = false; }
  }
  async function syncFromCloud(user) {
    syncReady = false;
    const local = localData();
    const { data: row, error } = await client.from(TABLE).select('payload').eq('user_id', user.id).maybeSingle();
    if (error) throw error;
    const initKey = `close-eyes-cloud-initialized:${user.id}`;
    if (!row) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(local));
      await writeCloud(local, user.id);
    } else {
      const remote = row.payload && typeof row.payload === 'object' ? row.payload : emptyData();
      const merged = !localStorage.getItem(initKey) && (local.articles?.length || local.saved?.length) ? mergeFirstLogin(local, remote) : remote;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      if (merged !== remote) await writeCloud(merged, user.id);
    }
    localStorage.setItem(initKey, '1');
    syncReady = true;
    updateAuthUI();
    if (typeof render === 'function') render();
    showMessage('登入成功，文章與學習進度已同步。');
  }
  function scheduleSync() {
    if (!syncReady || !session) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => writeCloud(localData()), 800);
  }
  async function signIn() {
    if (!client) return showMessage('Supabase SDK 載入失敗，請確認網路。', true);
    const email = $('authEmail').value.trim(), password = $('authPassword').value;
    if (!email || !password) return showMessage('請輸入 Email 和密碼。', true);
    $('signInButton').disabled = true; showMessage('正在登入並載入雲端資料…');
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    $('signInButton').disabled = false;
    if (error) return showMessage(error.message, true);
    session = data.session;
    try { await syncFromCloud(session.user); modal.classList.add('hidden'); }
    catch (e) { showMessage(`登入成功，但載入資料失敗：${e.message}`, true); }
  }
  async function signUp() {
    if (!client) return showMessage('Supabase SDK 載入失敗，請確認網路。', true);
    const email = $('authEmail').value.trim(), password = $('authPassword').value;
    if (!email || !password) return showMessage('請輸入 Email 和密碼。', true);
    if (password.length < 6) return showMessage('密碼至少需要 6 個字元。', true);
    $('signUpButton').disabled = true; showMessage('正在建立帳號…');
    const { data, error } = await client.auth.signUp({ email, password });
    $('signUpButton').disabled = false;
    if (error) return showMessage(error.message, true);
    if (!data.session) return showMessage('帳號已建立。請到 Email 收取驗證信，驗證後再登入。');
    session = data.session;
    try { await syncFromCloud(session.user); modal.classList.add('hidden'); }
    catch (e) { showMessage(`帳號已建立，但資料同步設定尚未完成：${e.message}`, true); }
  }
  async function signOut() {
    syncReady = false;
    const { error } = await client.auth.signOut();
    if (error) return showMessage(error.message, true);
    session = null; updateAuthUI(); modal.classList.add('hidden'); $('authPassword').value = '';
  }
  authButton.addEventListener('click', () => { updateAuthUI(); modal.classList.remove('hidden'); });
  $('signInButton').addEventListener('click', signIn);
  $('signUpButton').addEventListener('click', signUp);
  $('guestMode').addEventListener('click', () => modal.classList.add('hidden'));
  $('closeAuthModal').addEventListener('click', () => modal.classList.add('hidden'));
  $('signOutButton').addEventListener('click', signOut);
  $('authPassword').addEventListener('keydown', event => { if (event.key === 'Enter') signIn(); });
  if (!client) { showMessage('Supabase SDK 載入失敗，仍可使用本機模式。', true); modal.classList.remove('hidden'); return; }
  client.auth.onAuthStateChange((event, next) => {
    if (event === 'SIGNED_OUT') { session = null; syncReady = false; updateAuthUI(); }
  });
  client.auth.getSession().then(async ({ data, error }) => {
    if (error) showMessage(error.message, true);
    session = data?.session || null; updateAuthUI();
    if (session) {
      try { await syncFromCloud(session.user); }
      catch (e) { showMessage(`無法載入雲端資料：${e.message}`, true); modal.classList.remove('hidden'); }
    } else {
      modal.classList.remove('hidden');
      showMessage('登入或建立帳號即可在手機與電腦同步；也可先使用本機模式。');
    }
  });
})();
