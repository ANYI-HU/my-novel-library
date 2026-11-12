const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers }
});
const corsHeaders = (request, env) => {
  const origin = request.headers.get('Origin') || '';
  const allowed = env.ALLOWED_ORIGIN || '*';
  return {
    'Access-Control-Allow-Origin': allowed === '*' ? '*' : (origin === allowed ? origin : 'null'),
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Password',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
};
function toBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
function fromBase64(value) {
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
function safeFileName(title) {
  const cleaned = title.normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/g, '');
  return `${cleaned.slice(0, 140) || 'untitled'}.txt`;
}
async function githubRequest(path, env, options = {}) {
  const response = await fetch(`https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/contents/${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'My-Novel-Library-Uploader',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || `GitHub API error ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return data;
}
export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return json({ ok: true, service: 'novel-library-uploader' }, 200, cors);
    if (url.pathname !== '/upload' || request.method !== 'POST') return json({ error: 'Not found' }, 404, cors);
    if (cors['Access-Control-Allow-Origin'] === 'null') return json({ error: '來源網域未獲授權。' }, 403, cors);
    if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO) return json({ error: '上傳服務尚未完成環境設定。' }, 500, cors);
    if (request.headers.get('X-Admin-Password') !== env.ADMIN_PASSWORD) return json({ error: '管理者密碼錯誤。' }, 401, cors);
    try {
      const body = await request.json();
      const title = String(body.title || '').trim();
      const author = String(body.author || '').trim();
      const content = String(body.text || '');
      if (!title || !content.trim()) return json({ error: '小說名稱或 TXT 內容不可空白。' }, 400, cors);
      if (new TextEncoder().encode(content).length > 15 * 1024 * 1024) return json({ error: 'TXT 檔案超過 15 MB 限制。' }, 413, cors);
      const branch = env.GITHUB_BRANCH || 'main';
      const manifestPath = 'novels/manifest.json';
      const manifestData = await githubRequest(`${manifestPath}?ref=${encodeURIComponent(branch)}`, env);
      const manifest = JSON.parse(fromBase64(manifestData.content));
      if (!Array.isArray(manifest.books)) manifest.books = [];
      const fileName = safeFileName(title);
      const filePath = `novels/${fileName}`;
      if (manifest.books.some(book => book.file === filePath || book.title === title)) return json({ error: '書庫中已有相同書名或檔名，請修改書名後再上傳。' }, 409, cors);
      const filePayload = {
        message: `Add novel: ${title}`,
        content: toBase64(content),
        branch
      };
      await githubRequest(filePath.split('/').map(encodeURIComponent).join('/'), env, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(filePayload)
      });
      const id = `novel-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
      manifest.books.push({ id, title, ...(author ? { author } : {}), file: filePath });
      try {
        await githubRequest(manifestPath, env, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `Update novel manifest: ${title}`, content: toBase64(JSON.stringify(manifest, null, 2) + '\n'), sha: manifestData.sha, branch })
        });
      } catch (error) {
        return json({ error: 'TXT 已上傳，但書庫目錄更新失敗。請稍後檢查 GitHub 的 novels 資料夾；不要重複上傳同名檔案。' }, 502, cors);
      }
      return json({ ok: true, id, title, file: filePath }, 200, cors);
    } catch (error) {
      const status = error.status && error.status < 500 ? error.status : 502;
      return json({ error: error.message || '上傳失敗，請稍後再試。' }, status, cors);
    }
  }
};
