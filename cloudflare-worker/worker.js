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
async function getManifest(env, branch) {
  const path = 'novels/manifest.json';
  const data = await githubRequest(`${path}?ref=${encodeURIComponent(branch)}`, env);
  return { path, data, manifest: JSON.parse(fromBase64(data.content)) };
}
function validateEnvironment(env) {
  return !!(env.ADMIN_PASSWORD && env.GITHUB_TOKEN && env.GITHUB_OWNER && env.GITHUB_REPO);
}
function authorized(request, env) {
  return request.headers.get('X-Admin-Password') === env.ADMIN_PASSWORD;
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, service: 'novel-library-uploader' }, 200, cors);
    }
    if (!['/upload', '/list', '/delete'].includes(url.pathname)) {
      return json({ error: 'Not found' }, 404, cors);
    }
    if (cors['Access-Control-Allow-Origin'] === 'null') return json({ error: '來源網域未獲授權。' }, 403, cors);
    if (!validateEnvironment(env)) return json({ error: '管理服務尚未完成環境設定。' }, 500, cors);
    if (!authorized(request, env)) return json({ error: '管理者密碼錯誤。' }, 401, cors);

    const branch = env.GITHUB_BRANCH || 'main';
    try {
      if (url.pathname === '/list' && request.method === 'GET') {
        const { manifest } = await getManifest(env, branch);
        const books = Array.isArray(manifest.books) ? manifest.books : [];
        return json({ ok: true, books: books.map(book => ({
          id: String(book.id || ''),
          title: String(book.title || ''),
          author: String(book.author || ''),
          file: String(book.file || '')
        })) }, 200, cors);
      }

      if (url.pathname === '/delete' && request.method === 'POST') {
        const body = await request.json();
        const id = String(body.id || '');
        if (!id) return json({ error: '缺少小說識別碼。' }, 400, cors);

        const { path: manifestPath, data: manifestData, manifest } = await getManifest(env, branch);
        if (!Array.isArray(manifest.books)) manifest.books = [];
        const index = manifest.books.findIndex(book => String(book.id || '') === id);
        if (index < 0) return json({ error: '找不到這本小說，可能已經被刪除或清單已更新。' }, 404, cors);

        const [book] = manifest.books.splice(index, 1);
        const filePath = String(book.file || '');
        if (!filePath.startsWith('novels/') || filePath.includes('..') || filePath === 'novels/manifest.json') {
          return json({ error: '小說檔案路徑不安全，已取消刪除。' }, 400, cors);
        }

        // 先更新目錄，避免檔案刪除成功但清單仍顯示該書。
        await githubRequest(manifestPath, env, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `Remove novel from manifest: ${String(book.title || id)}`,
            content: toBase64(JSON.stringify(manifest, null, 2) + '\n'),
            sha: manifestData.sha,
            branch
          })
        });

        try {
          const encodedPath = filePath.split('/').map(encodeURIComponent).join('/');
          const fileData = await githubRequest(`${encodedPath}?ref=${encodeURIComponent(branch)}`, env);
          await githubRequest(encodedPath, env, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: `Delete novel file: ${String(book.title || id)}`,
              sha: fileData.sha,
              branch
            })
          });
        } catch (error) {
          return json({
            ok: false,
            warning: '小說已從書庫目錄移除，但 TXT 檔案刪除未完成。請至 GitHub novels 資料夾檢查。',
            detail: error.message
          }, 502, cors);
        }
        return json({ ok: true, title: String(book.title || '小說'), id }, 200, cors);
      }

      if (url.pathname === '/upload' && request.method === 'POST') {
        const body = await request.json();
        const title = String(body.title || '').trim();
        const author = String(body.author || '').trim();
        const content = String(body.text || '');
        if (!title || !content.trim()) return json({ error: '小說名稱或 TXT 內容不可空白。' }, 400, cors);
        if (new TextEncoder().encode(content).length > 15 * 1024 * 1024) return json({ error: 'TXT 檔案超過 15 MB 限制。' }, 413, cors);
        const { path: manifestPath, data: manifestData, manifest } = await getManifest(env, branch);
        if (!Array.isArray(manifest.books)) manifest.books = [];
        const fileName = safeFileName(title);
        const filePath = `novels/${fileName}`;
        if (manifest.books.some(book => book.file === filePath || book.title === title)) return json({ error: '書庫中已有相同書名或檔名，請修改書名後再上傳。' }, 409, cors);
        await githubRequest(filePath.split('/').map(encodeURIComponent).join('/'), env, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: `Add novel: ${title}`, content: toBase64(content), branch })
        });
        const id = `novel-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
        manifest.books.push({ id, title, ...(author ? { author } : {}), file: filePath });
        try {
          await githubRequest(manifestPath, env, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: `Update novel manifest: ${title}`, content: toBase64(JSON.stringify(manifest, null, 2) + '\n'), sha: manifestData.sha, branch })
          });
        } catch (error) {
          return json({ error: 'TXT 已上傳，但書庫目錄更新失敗。請稍後檢查 GitHub 的 novels 資料夾；不要重複上傳同名檔案。' }, 502, cors);
        }
        return json({ ok: true, id, title, file: filePath }, 200, cors);
      }

      return json({ error: '不支援的請求方式。' }, 405, cors);
    } catch (error) {
      const status = error.status && error.status < 500 ? error.status : 502;
      return json({ error: error.message || '操作失敗，請稍後再試。' }, status, cors);
    }
  }
};
