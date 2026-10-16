const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const chatSystem = `You are a warm, patient English conversation teacher. Keep the conversation natural and suitable for the learner. For every learner turn, return only a JSON object with this exact shape: {"correction":"a natural native-like version of the learner's full sentence","note":"a clear, detailed English explanation of why the correction is more natural and what was wrong, including the relevant grammar or wording distinction when useful, or an empty string","question":"one natural English follow-up question that continues the conversation","grammarIssue":null or {"pattern":"a short canonical name for one grammar pattern the learner got wrong","explanation":"a clear English explanation of the grammar error","example":"a short corrected example"}}. Preserve the learner's intended meaning. If the sentence is already natural, repeat it as correction and say so briefly. Return grammarIssue only for a genuine grammar error, not style preferences. Use the same canonical pattern name for the same recurring error. Never add markdown fences.`;

const reviewQuestionSystem = `You are an English teacher creating a spaced-repetition recall prompt. Given a saved English learning card, produce JSON only: {"question":"a concise Traditional Chinese clue or situation that asks the learner to recall and answer in English"}. Do not include the target English answer, spelling, or a translation that gives it away. For a grammar card, describe a short situation that elicits the target grammar pattern. For a sentence or phrase, give a meaning or context clue.`;

const reviewGradeSystem = `You are an English teacher grading a spoken-English spaced-repetition response. Compare the learner's answer with the saved target while accepting equivalent natural English. For grammar cards, accept any correct sentence that follows the target pattern and fits the recall question; do not require the learner to name the grammar rule. Use the card context and example when grading. Return JSON only: {"grade":0|1|2|3,"feedback":"short encouraging Traditional Chinese feedback; when helpful, include the natural expected English","correctedAnswer":"the natural target answer"}. Grade 0 for blank or substantially wrong, 1 for partial or major errors, 2 for correct meaning with minor errors, and 3 for a correct natural answer. Do not be overly strict about contractions or harmless wording differences.`;

async function validateUser(request: Request): Promise<string | null> {
  const authorization = request.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return null;
  const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return null;
  const user = await response.json().catch(() => null);
  return typeof user?.id === "string" ? user.id : null;
}

type ProviderKeys = { gemini: string[]; groq: string[] };
const emptyKeys = (): ProviderKeys => ({ gemini: [], groq: [] });

function encodeBase64(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value: string) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get("SPEAKING_KEY_ENCRYPTION_SECRET");
  if (!secret || secret.length < 32) throw new Error("伺服器尚未設定 API key 加密密鑰。");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function encryptKeys(keys: ProviderKeys) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), new TextEncoder().encode(JSON.stringify(keys)));
  return { v: 1, iv: encodeBase64(iv), cipher: encodeBase64(new Uint8Array(cipher)) };
}

async function decryptKeys(encrypted: { v?: number; iv?: string; cipher?: string }): Promise<ProviderKeys> {
  if (encrypted?.v !== 1 || !encrypted.iv || !encrypted.cipher) throw new Error("雲端 API keys 格式無效。");
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: decodeBase64(encrypted.iv) }, await encryptionKey(), decodeBase64(encrypted.cipher));
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  const clean = (items: unknown) => Array.isArray(items) ? items.map(value => String(value).trim()).filter(Boolean).slice(0, 5) : [];
  return { gemini: clean(parsed.gemini), groq: clean(parsed.groq) };
}

function databaseConfig() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Supabase Edge Function 缺少資料庫設定。");
  return { url, serviceKey };
}

async function manageStoredKeys(action: string, userId: string, keys?: unknown) {
  const { url, serviceKey } = databaseConfig();
  const endpoint = `${url}/rest/v1/user_ai_keys?user_id=eq.${encodeURIComponent(userId)}`;
  const headers = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, "Content-Type": "application/json" };
  if (action === "clear-keys") {
    const response = await fetch(endpoint, { method: "DELETE", headers });
    if (!response.ok) throw new Error("無法清除雲端 API keys。");
    return { cleared: true };
  }
  if (action === "get-keys") {
    const response = await fetch(`${endpoint}&select=encrypted_keys&limit=1`, { headers });
    if (!response.ok) throw new Error("無法載入雲端 API keys。");
    const rows = await response.json();
    return { keys: rows[0]?.encrypted_keys ? await decryptKeys(rows[0].encrypted_keys) : emptyKeys() };
  }
  const input = (keys && typeof keys === "object" ? keys : {}) as Record<string, unknown>;
  const clean = (items: unknown) => Array.isArray(items) ? items.map(value => String(value).trim()).filter(Boolean).slice(0, 5).map(value => value.slice(0, 512)) : [];
  const sanitized: ProviderKeys = { gemini: clean(input.gemini), groq: clean(input.groq) };
  if (!sanitized.gemini.length && !sanitized.groq.length) throw new Error("請至少輸入一組 API key。");
  const response = await fetch(`${url}/rest/v1/user_ai_keys?on_conflict=user_id`, {
    method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ user_id: userId, encrypted_keys: await encryptKeys(sanitized), updated_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error("無法儲存加密後的 API keys。");
  return { saved: true };
}

function parseJson(text: string) {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const first = cleaned.indexOf("{");
  const last = cleaned.lastIndexOf("}");
  if (first < 0 || last < first) throw new Error("AI 回覆格式不正確，請再試一次。");
  return JSON.parse(cleaned.slice(first, last + 1));
}

async function askGemini(key: string, prompt: string, messages: Array<{role:string;content:string}>) {
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: prompt }] },
      contents: messages.map(message => ({ role: message.role === "assistant" ? "model" : "user", parts: [{ text: message.content }] })),
      generationConfig: { responseMimeType: "application/json", temperature: 0.65, maxOutputTokens: 1200 },
    }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Gemini API 回應 ${response.status}`);
  const text = body?.candidates?.[0]?.content?.parts?.map((part: {text?:string}) => part.text || "").join("") || "";
  return parseJson(text);
}

function groqRateLimits(headers: Headers) {
  const names: Record<string, string> = {
    remainingRequests: "x-ratelimit-remaining-requests",
    limitRequests: "x-ratelimit-limit-requests",
    resetRequests: "x-ratelimit-reset-requests",
    remainingTokens: "x-ratelimit-remaining-tokens",
    limitTokens: "x-ratelimit-limit-tokens",
    resetTokens: "x-ratelimit-reset-tokens",
  };
  return Object.fromEntries(Object.entries(names).flatMap(([key, header]) => {
    const value = headers.get(header);
    return value === null ? [] : [[key, value]];
  }));
}

async function askGroq(key: string, prompt: string, messages: Array<{role:string;content:string}>) {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: "openai/gpt-oss-120b",
      messages: [{ role: "system", content: prompt }, ...messages],
      response_format: { type: "json_object" },
      temperature: 0.65,
      max_completion_tokens: 1200,
    }),
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Groq API 回應 ${response.status}`);
  const text = body?.choices?.[0]?.message?.content || "";
  return { ...parseJson(text), rateLimits: groqRateLimits(response.headers) };
}

async function transcribeGroq(key: string, audioBase64: string, mimeType: string) {
  const bytes = Uint8Array.from(atob(audioBase64), character => character.charCodeAt(0));
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mimeType }), "speaking-audio.webm");
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "en");
  form.append("temperature", "0");
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(60000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body?.error?.message || `Groq 語音辨識回應 ${response.status}`);
  return String(body.text || "").trim();
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const userId = await validateUser(request);
    if (!userId) return json({ error: "請先登入 Supabase。" }, 401);
    const body = await request.json();
    const action = String(body.action || "chat");
    if (["get-keys", "save-keys", "clear-keys"].includes(action)) {
      return json(await manageStoredKeys(action, userId, body.keys));
    }
    const provider = String(body.provider || "gemini");
    const keys = Array.isArray(body.keys) ? body.keys.map((key: unknown) => String(key).trim()).filter(Boolean).slice(0, 5) : [];
    if (!keys.length) return json({ error: "請至少輸入一組 API key。" }, 400);

    if (action === "transcribe") {
      if (provider !== "groq") return json({ error: "語音轉文字目前需要 Groq API key。" }, 400);
      const audioBase64 = String(body.audioBase64 || "");
      if (!audioBase64 || audioBase64.length > 34_000_000) return json({ error: "錄音無效或超過大小限制，請錄短一點。" }, 400);
      let lastError: unknown;
      for (const key of keys) {
        try { return json({ transcript: await transcribeGroq(key, audioBase64, String(body.mimeType || "audio/webm")) }); }
        catch (error) { lastError = error; }
      }
      return json({ error: lastError instanceof Error ? lastError.message : "Groq 語音辨識失敗。" }, 502);
    }

    let systemPrompt = chatSystem;
    let messages = Array.isArray(body.messages) ? body.messages.slice(-24).map((message: any) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: String(message.content || "").slice(0, 10000),
    })) : [];
    if (action === "review-question") {
      systemPrompt = reviewQuestionSystem;
      messages = [{ role: "user", content: `Create a recall question for this card without revealing its answer: ${JSON.stringify(body.card || {})}` }];
    } else if (action === "review-grade") {
      systemPrompt = reviewGradeSystem;
      messages = [{ role: "user", content: `Saved card: ${JSON.stringify(body.card || {})}\nRecall question: ${String(body.question || "")}\nLearner answer: ${String(body.answer || "")}` }];
    }
    if (!messages.length) return json({ error: "請輸入內容後再試。" }, 400);

    let lastError: unknown;
    for (const key of keys) {
      try {
        const result = provider === "groq"
          ? await askGroq(key, systemPrompt, messages)
          : await askGemini(key, systemPrompt, messages);
        return json({ result });
      } catch (error) { lastError = error; }
    }
    return json({ error: lastError instanceof Error ? lastError.message : "AI 服務暫時無法使用。" }, 502);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Speaking 服務發生錯誤。" }, 500);
  }
});
