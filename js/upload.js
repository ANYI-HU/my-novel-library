(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('uploadForm'), fileInput = $('novelFile'), titleInput = $('novelTitle');
  const message = $('uploadMessage'), button = $('uploadButton'), progress = $('uploadProgress');
  let selectedFile = null;
  const formatSize = (n) => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
  fileInput.addEventListener('change', () => {
    selectedFile = fileInput.files?.[0] || null;
    if (!selectedFile) return;
    $('filePrompt').textContent = selectedFile.name;
    $('fileMeta').textContent = `${formatSize(selectedFile.size)} · 已選取檔案`;
    if (!titleInput.value.trim()) titleInput.value = selectedFile.name.replace(/\.txt$/i, '');
    message.textContent = ''; message.className = 'upload-message';
  });
  function decodeFile(file, encoding) {
    return file.arrayBuffer().then(buffer => {
      let enc = encoding;
      const bytes = new Uint8Array(buffer);
      if (encoding === 'utf-8' && bytes[0] === 0xff && bytes[1] === 0xfe) enc = 'utf-16le';
      else if (encoding === 'utf-8' && bytes[0] === 0xfe && bytes[1] === 0xff) enc = 'utf-16be';
      else if (encoding === 'utf-8' && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) enc = 'utf-8';
      return new TextDecoder(enc, { fatal: false }).decode(buffer).replace(/^\uFEFF/, '');
    });
  }
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const api = (window.NOVEL_UPLOAD_API || '').replace(/\/$/, '');
    if (!api || api.includes('YOUR-WORKER-NAME')) { message.textContent = '尚未設定上傳服務網址。請先完成 README 中的 Cloudflare Worker 設定。'; message.className = 'upload-message error'; return; }
    if (!selectedFile || !selectedFile.name.toLowerCase().endsWith('.txt')) { message.textContent = '請先選擇 TXT 檔案。'; message.className = 'upload-message error'; return; }
    const title = titleInput.value.trim();
    if (!title) { message.textContent = '請輸入小說名稱。'; message.className = 'upload-message error'; return; }
    if (selectedFile.size > 15 * 1024 * 1024) { message.textContent = '單一 TXT 檔案目前限制為 15 MB。'; message.className = 'upload-message error'; return; }
    button.disabled = true; progress.classList.remove('hidden'); $('progressFill').style.width = '12%'; $('progressLabel').textContent = '正在讀取 TXT…';
    message.textContent = ''; message.className = 'upload-message';
    try {
      const text = await decodeFile(selectedFile, $('fileEncoding').value);
      if (!text.trim()) throw new Error('檔案內容是空的，請確認 TXT 檔案。');
      $('progressFill').style.width = '35%'; $('progressLabel').textContent = '正在安全連線並上傳…';
      const response = await fetch(`${api}/upload`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Password': $('adminPassword').value },
        body: JSON.stringify({ title, author: $('novelAuthor').value.trim(), originalName: selectedFile.name, text })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `上傳失敗（HTTP ${response.status}）`);
      $('progressFill').style.width = '100%'; $('progressLabel').textContent = '完成！';
      message.textContent = `《${result.title || title}》已加入書庫。請返回書庫並重新整理頁面。`;
      message.className = 'upload-message success'; form.reset(); selectedFile = null;
      $('filePrompt').textContent = '選擇 TXT 檔案'; $('fileMeta').textContent = '支援 .txt 格式，可從手機檔案或雲端硬碟選取';
    } catch (error) {
      message.textContent = error.message || '發生未知錯誤，請稍後再試。'; message.className = 'upload-message error';
      $('progressLabel').textContent = '上傳未完成';
    } finally { button.disabled = false; }
  });
})();
