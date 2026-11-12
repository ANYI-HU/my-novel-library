
let books = [];
let activeBookId = null;
let activeFilter = "all";
let fontSize = Number(localStorage.getItem("readerFontSize") || 19);
let lineHeight = Number(localStorage.getItem("readerLineHeight") || 2.1);
let textEncoding = localStorage.getItem("readerTextEncoding") || "auto";
let saveProgressTimer;

const $ = id => document.getElementById(id);

const META_KEY = "woodenStudyReaderMetaV2";
const SESSION_KEY = "woodenStudyUnlocked";

const meta = JSON.parse(localStorage.getItem(META_KEY) || "{}");

const saveMeta = () =>
  localStorage.setItem(META_KEY, JSON.stringify(meta));

const isConfigured = () =>
  typeof ACCESS_PASSWORD_HASH === "string" &&
  /^[a-f0-9]{64}$/i.test(ACCESS_PASSWORD_HASH);


// ==============================
// 登入與基本功能
// ==============================

async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);

  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("appRoot").classList.remove("hidden");
  loadLibrary();
}

function lockApp() {
  sessionStorage.removeItem(SESSION_KEY);
  $("appRoot").classList.add("hidden");
  $("loginScreen").classList.remove("hidden");
  $("passwordInput").value = "";
  $("loginError").textContent = "";
  window.scrollTo(0, 0);
}

$("loginForm").addEventListener("submit", async e => {
  e.preventDefault();

  const password = $("passwordInput").value;

  if (!isConfigured()) {
    $("loginError").textContent =
      "網站尚未設定密碼。請管理者先完成 README 的密碼設定步驟。";
    return;
  }

  const hash = await sha256(password);

  if (hash.toLowerCase() === ACCESS_PASSWORD_HASH.toLowerCase()) {
    sessionStorage.setItem(SESSION_KEY, "yes");
    showApp();
  } else {
    $("loginError").textContent = "密碼不正確，請再試一次。";
    $("passwordInput").select();
  }
});

$("lockBtn").onclick = lockApp;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}

function formatDate(timestamp) {
  return new Date(timestamp).toLocaleDateString("zh-TW", {
    month: "numeric",
    day: "numeric"
  });
}

function bookMeta(id) {
  return meta[id] || (
    meta[id] = {
      favorite: false,
      lastRead: null,
      progress: 0,
      readingAnchor: null,
      bookmarks: []
    }
  );
}


// ==============================
// 書庫
// ==============================

async function loadLibrary() {
  try {
    const response = await fetch("novels/manifest.json", {
      cache: "no-store"
    });

    if (!response.ok) {
      throw new Error("找不到 novels/manifest.json");
    }

    const manifest = await response.json();

    if (!Array.isArray(manifest.books)) {
      throw new Error("manifest 格式不正確");
    }

    books = manifest.books
      .map((b, i) => ({
        ...b,
        id: b.id || `book-${i}`,
        file: b.file
      }))
      .filter(b => b.title && b.file);

    renderLibrary();

    const last = books.find(
      b => b.id === localStorage.getItem("activeBookId")
    );

    if (last) {
      openBook(last.id);
    } else if (!books.length) {
      $("welcomePanel").classList.remove("hidden");
    }

  } catch (error) {
    console.error(error);

    $("libraryList").innerHTML =
      '<div class="empty-library"><p>書庫載入失敗</p><small>請確認 novels/manifest.json 與 TXT 檔案已上傳。</small></div>';

    toast("書庫載入失敗，請稍後重試");
  }
}

function renderLibrary() {
  const query = $("searchInput").value.trim().toLowerCase();

  let list = books.filter(
    b => b.title.toLowerCase().includes(query)
  );

  if (activeFilter === "favorite") {
    list = list.filter(b => bookMeta(b.id).favorite);
  }

  if (activeFilter === "recent") {
    list = list.filter(b => bookMeta(b.id).lastRead);
  }

  $("bookCount").textContent = `${books.length} 本`;

  const host = $("libraryList");
  host.innerHTML = "";

  if (!list.length) {
    host.innerHTML = `
      <div class="empty-library">
        <div class="empty-icon">▤</div>
        <p>${books.length ? "沒有符合條件的小說" : "書架目前是空的"}</p>
        <small>${books.length ? "試試其他關鍵字或篩選條件。" : "管理者尚未新增 TXT 小說。"}</small>
      </div>
    `;
    return;
  }

  list.forEach(book => {
    const m = bookMeta(book.id);

    const item = document.createElement("div");
    item.className = "book-item" +
      (book.id === activeBookId ? " active" : "");

    const cover = document.createElement("div");
    cover.className = "book-cover";
    cover.textContent = "書";

    const info = document.createElement("div");
    info.className = "book-info";

    const title = document.createElement("div");
    title.className = "book-title";
    title.textContent = book.title;

    const sub = document.createElement("div");
    sub.className = "book-sub";
    sub.textContent = m.lastRead
      ? `上次閱讀 ${formatDate(m.lastRead)}`
      : "尚未閱讀";

    info.append(title, sub);
    item.append(cover, info);

    if (m.favorite) {
      const fav = document.createElement("span");
      fav.className = "book-fav";
      fav.textContent = "♥";
      item.append(fav);
    }

    item.addEventListener("click", () => openBook(book.id));

    host.append(item);
  });
}


// ==============================
// TXT 文字編碼
// ==============================

function normalizeDecodedText(text) {
  return text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n");
}

function decodeText(buffer, requestedEncoding = "auto") {
  const bytes = new Uint8Array(buffer);

  const hasPrefix = (...prefix) =>
    prefix.every((v, i) => bytes[i] === v);

  if (hasPrefix(0xEF, 0xBB, 0xBF)) {
    return normalizeDecodedText(
      new TextDecoder("utf-8").decode(bytes)
    );
  }

  if (hasPrefix(0xFF, 0xFE)) {
    return normalizeDecodedText(
      new TextDecoder("utf-16le").decode(bytes)
    );
  }

  if (hasPrefix(0xFE, 0xFF)) {
    return normalizeDecodedText(
      new TextDecoder("utf-16be").decode(bytes)
    );
  }

  if (requestedEncoding !== "auto") {
    try {
      return normalizeDecodedText(
        new TextDecoder(requestedEncoding, {
          fatal: false
        }).decode(bytes)
      );
    } catch (error) {
      throw new Error(
        `瀏覽器不支援 ${requestedEncoding} 編碼，請改用自動辨識或 UTF-8。`
      );
    }
  }

  try {
    return normalizeDecodedText(
      new TextDecoder("utf-8", {
        fatal: true
      }).decode(bytes)
    );
  } catch (error) {}

  const candidates = [];

  for (const encoding of ["big5", "gb18030"]) {
    try {
      const text = normalizeDecodedText(
        new TextDecoder(encoding, {
          fatal: false
        }).decode(bytes)
      );

      candidates.push({
        encoding,
        text,
        score: scoreChineseText(text)
      });

    } catch (error) {}
  }

  if (!candidates.length) {
    return normalizeDecodedText(
      new TextDecoder("utf-8").decode(bytes)
    );
  }

  candidates.sort((a, b) => b.score - a.score);

  return candidates[0].text;
}

function scoreChineseText(text) {
  const replacement = (text.match(/\uFFFD/g) || []).length;

  const controls = (
    text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g) || []
  ).length;

  const cjk = (text.match(/[\u3400-\u9FFF]/g) || []).length;

  const traditional = (
    text.match(/[體國學會說這個為與後裡發現時實經過還對讓從無開關點應]/g) || []
  ).length;

  const simplified = (
    text.match(/[体国学会说这个为与后里发现时经还对让从无开关点应]/g) || []
  ).length;

  return cjk * 2 +
    traditional * 1.5 +
    simplified * 1.5 -
    replacement * 100 -
    controls * 100;
}


// ==============================
// 開啟小說
// ==============================

async function openBook(id, forceReload = false) {
  const book = books.find(b => b.id === id);

  if (!book) return;

  try {
    // 切換小說前，先儲存原本小說的閱讀位置
    if (activeBookId && activeBookId !== id) {
      clearTimeout(saveProgressTimer);
      saveProgressNow();
    }

    if (forceReload || typeof book.content !== "string") {
      const response = await fetch(
        encodeURI(book.file),
        { cache: "force-cache" }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const buffer = await response.arrayBuffer();

      book.content = decodeText(buffer, textEncoding);
    }

    activeBookId = id;

    localStorage.setItem("activeBookId", id);

    const m = bookMeta(id);

    m.lastRead = Date.now();
    saveMeta();

    $("welcomePanel").classList.add("hidden");
    $("reader").classList.remove("hidden");

    $("readerTitle").textContent = book.title;
    $("breadcrumbTitle").textContent = book.title;

    $("bookMeta").textContent =
      `NOW READING · ${Math.max(1, book.content.length).toLocaleString()} CHARACTERS`;

    $("favoriteBtn").textContent = m.favorite ? "♥" : "♡";

    $("favoriteBtn").classList.toggle(
      "is-favorite",
      m.favorite
    );

    renderNovel(book);
    renderLibrary();

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (
          !m.readingAnchor ||
          !restoreReadingAnchor(m.readingAnchor)
        ) {
          restoreReadingProgress(m.progress || 0);
        }

        renderBookmarks();
      });
    });

    $("sidebar").classList.remove("open");

  } catch (error) {
    console.error(error);
    toast(`無法開啟「${book.title}」，請確認 TXT 檔案路徑。`);
  }
}


// ==============================
// 小說內容解析
// ==============================

function renderNovel(book) {
  const content = $("novelContent");

  content.replaceChildren();

  let readingIndex = 0;

  const lines = book.content.split("\n");
  const chapters = [];
  let chunk = [];

  const fragment = document.createDocumentFragment();

  const pattern =
    /^\s*(第[〇零一二三四五六七八九十百千\d]+[章节節回卷幕部篇].*|序章|楔子|前言|後記|后记|番外篇?.*|終章|终章)\s*$/;

  const flush = () => {
    const text = chunk.join("\n").trim();

    if (text) {
      const p = document.createElement("p");

      p.textContent = text;
      p.dataset.readingIndex = String(readingIndex++);

      fragment.append(p);
    }

    chunk = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed && pattern.test(trimmed)) {
      flush();

      const h = document.createElement("h2");

      h.className = "chapter-heading";
      h.id = `chapter-${chapters.length}`;
      h.dataset.readingIndex = String(readingIndex++);
      h.textContent = trimmed;

      fragment.append(h);

      chapters.push({
        id: h.id,
        title: trimmed
      });

    } else if (!trimmed) {
      flush();

    } else {
      chunk.push(line);
    }
  }

  flush();

  content.append(fragment);

  const nav = $("chapterNav");
  const navList = $("chapterList");
  const body = content.parentElement;

  navList.replaceChildren();

  if (chapters.length > 5) {
    nav.classList.remove("is-hidden");
    body.classList.remove("no-chapters");

    const navFragment = document.createDocumentFragment();

    chapters.forEach(ch => {
      const a = document.createElement("button");

      a.className = "chapter-link";
      a.textContent = ch.title;

      a.addEventListener("click", () => {
        document.getElementById(ch.id)?.scrollIntoView({
          behavior: "smooth",
          block: "start"
        });
      });

      navFragment.append(a);
    });

    navList.append(navFragment);

  } else {
    nav.classList.add("is-hidden");
    body.classList.add("no-chapters");
  }

  content.style.fontSize = `${fontSize}px`;
  content.style.lineHeight = lineHeight;

  const progress = bookMeta(book.id).progress || 0;

  $("progressText").textContent =
    `閱讀進度 ${Math.round(progress * 100)}%`;

  $("progressBar").style.width = `${progress * 100}%`;

  renderBookmarks();
}


// ==============================
// 閱讀位置偵測與還原
// ==============================

function readingElements() {
  return Array.from(
    $("novelContent").querySelectorAll("[data-reading-index]")
  );
}

// 判斷目前小說使用哪一個滾動區域
function getReaderScroller() {
  let node = $("novelContent")?.parentElement;

  while (
    node &&
    node !== document.body &&
    node !== document.documentElement
  ) {
    const style = getComputedStyle(node);

    if (
      /auto|scroll|overlay/.test(style.overflowY) &&
      node.scrollHeight > node.clientHeight + 1
    ) {
      return node;
    }

    node = node.parentElement;
  }

  return window;
}

// 計算段落相對於閱讀區域頂端的位置
function getReadingTop(element, scroller) {
  const rect = element.getBoundingClientRect();

  if (scroller === window) {
    return rect.top;
  }

  return rect.top - (
    scroller.getBoundingClientRect().top + scroller.clientTop
  );
}

// 取得目前畫面正在閱讀的段落
function currentReadingAnchor() {
  const elements = readingElements();

  if (!elements.length) return null;

  const scroller = getReaderScroller();

  let current = elements[0];

  for (const el of elements) {
    if (getReadingTop(el, scroller) <= 150) {
      current = el;
    } else {
      break;
    }
  }

  return {
    index: Number(current.dataset.readingIndex),
    offset: Math.round(getReadingTop(current, scroller))
  };
}

// 還原到指定段落
function restoreReadingAnchor(anchor) {
  if (!anchor) return false;

  const el = readingElements().find(
    item =>
      Number(item.dataset.readingIndex) === Number(anchor.index)
  );

  if (!el) return false;

  const scroller = getReaderScroller();

  const difference =
    getReadingTop(el, scroller) -
    Number(anchor.offset || 0);

  if (scroller === window) {
    window.scrollTo({
      top: window.scrollY + difference,
      behavior: "auto"
    });

  } else {
    scroller.scrollTop += difference;
  }

  return true;
}

// 依照百分比還原閱讀位置
function restoreReadingProgress(progress) {
  const scroller = getReaderScroller();

  const value = Math.min(
    1,
    Math.max(0, Number(progress) || 0)
  );

  if (scroller === window) {
    const max = Math.max(
      0,
      document.documentElement.scrollHeight - window.innerHeight
    );

    window.scrollTo({
      top: max * value,
      behavior: "auto"
    });

  } else {
    const max = Math.max(
      0,
      scroller.scrollHeight - scroller.clientHeight
    );

    scroller.scrollTop = max * value;
  }
}


// ==============================
// 自動保存閱讀進度
// ==============================

function saveProgressNow() {
  if (!activeBookId) return;

  const scroller = getReaderScroller();

  let top;
  let max;

  if (scroller === window) {
    top = window.scrollY;

    max =
      document.documentElement.scrollHeight -
      window.innerHeight;

  } else {
    top = scroller.scrollTop;

    max =
      scroller.scrollHeight -
      scroller.clientHeight;
  }

  const m = bookMeta(activeBookId);

  m.progress = max > 0
    ? Math.min(1, Math.max(0, top / max))
    : 0;

  m.readingAnchor = currentReadingAnchor();

  saveMeta();

  $("progressBar").style.width =
    `${m.progress * 100}%`;

  $("progressText").textContent =
    `閱讀進度 ${Math.round(m.progress * 100)}%`;
}

function saveProgress() {
  if (!activeBookId) return;

  clearTimeout(saveProgressTimer);

  saveProgressTimer = setTimeout(() => {
    saveProgressNow();
  }, 300);
}


// ==============================
// 書籤功能
// ==============================


function renderBookmarks() {
  const host = $("bookmarkList");
  const count = $("bookmarkCount");

  if (!host || !activeBookId) return;

  const items = bookMeta(activeBookId).bookmarks || [];

  // 書籤數量顯示元素可能不存在，因此採用安全檢查
  if (count) {
    count.textContent = String(items.length);
  }

  host.replaceChildren();

  if (!items.length) {
    const empty = document.createElement("p");

    empty.className = "bookmark-empty";
    empty.textContent = "尚未新增手動書籤。";

    host.append(empty);
    return;
  }

  items.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "bookmark-item";

    const info = document.createElement("div");
    info.className = "bookmark-item-info";

    const title = document.createElement("strong");
    title.textContent = item.note || `書籤 ${index + 1}`;

    const detail = document.createElement("small");

    const paragraphIndex = Number(item.anchor?.index);

    detail.textContent =
      `第 ${paragraphIndex + 1} 個段落 · ${formatDate(item.createdAt)}`;

    info.append(title, detail);

    const jump = document.createElement("button");
    jump.type = "button";
    jump.className = "bookmark-jump";
    jump.textContent = "跳轉";

    jump.onclick = () => {
      if (restoreReadingAnchor(item.anchor)) {
        saveProgressNow();
      } else {
        toast("找不到對應的閱讀段落");
      }
    };

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "bookmark-remove";
    remove.textContent = "刪除";

    remove.onclick = () => {
      if (!confirm("確定刪除此書籤？")) return;

      const list = bookMeta(activeBookId).bookmarks;

      const targetIndex = list.findIndex(
        bookmark => bookmark.id === item.id
      );

      if (targetIndex !== -1) {
        list.splice(targetIndex, 1);
      }

      saveMeta();
      renderBookmarks();

      toast("已刪除書籤");
    };

    row.append(info, jump, remove);
    host.append(row);
  });
}


function addManualBookmark() {
  if (!activeBookId) return;

  const anchor = currentReadingAnchor();

  if (!anchor) {
    toast("目前沒有可收藏的段落");
    return;
  }

  const note = prompt(
    "替這個書籤加上備註（可留空）：",
    ""
  );

  if (note === null) return;

  const m = bookMeta(activeBookId);

  m.bookmarks = m.bookmarks || [];

  m.bookmarks.unshift({
    id: `bm-${Date.now()}-${Math.random().toString(16).slice(2, 7)}`,
    anchor,
    note: note.trim(),
    createdAt: Date.now()
  });

  saveMeta();

  renderBookmarks();

  toast("已收藏目前段落");
}


// ==============================
// 字體與行距
// ==============================

function setFontSize(v) {
  fontSize = Math.max(13, Math.min(32, v));

  localStorage.setItem("readerFontSize", fontSize);

  $("fontValue").textContent = `${fontSize} px`;

  $("novelContent").style.fontSize = `${fontSize}px`;

  saveProgress();
}

function setLineHeight(v) {
  lineHeight = Math.max(
    1.5,
    Math.min(2.8, Math.round(v * 10) / 10)
  );

  localStorage.setItem("readerLineHeight", lineHeight);

  $("lineValue").textContent = lineHeight;

  $("novelContent").style.lineHeight = lineHeight;

  saveProgress();
}


// ==============================
// 書籤按鍵事件
// ==============================

$("saveBookmarkBtn").onclick = addManualBookmark;

$("toggleBookmarksBtn").onclick = () => {
  const panel = $("bookmarkPanel");

  const open = panel.classList.toggle("hidden") === false;

  $("toggleBookmarksBtn").setAttribute(
    "aria-expanded",
    String(open)
  );

  if (open) renderBookmarks();
};


// ==============================
// 搜尋與篩選
// ==============================

$("searchInput").oninput = renderLibrary;

document.querySelectorAll(".filter").forEach(btn => {
  btn.onclick = () => {
    activeFilter = btn.dataset.filter;

    document.querySelectorAll(".filter").forEach(x => {
      x.classList.toggle("active", x === btn);
    });

    renderLibrary();
  };
});


// ==============================
// 收藏小說
// ==============================

$("favoriteBtn").onclick = () => {
  if (!activeBookId) return;

  const m = bookMeta(activeBookId);

  m.favorite = !m.favorite;

  saveMeta();

  $("favoriteBtn").textContent = m.favorite ? "♥" : "♡";

  $("favoriteBtn").classList.toggle(
    "is-favorite",
    m.favorite
  );

  renderLibrary();

  toast(m.favorite ? "已加入我的收藏" : "已取消收藏");
};


// ==============================
// 閱讀設定
// ==============================

$("fontDown").onclick = () => setFontSize(fontSize - 1);
$("fontUp").onclick = () => setFontSize(fontSize + 1);

$("lineDown").onclick = () => setLineHeight(lineHeight - 0.1);
$("lineUp").onclick = () => setLineHeight(lineHeight + 0.1);

$("fontValue").textContent = `${fontSize} px`;
$("lineValue").textContent = lineHeight;


// ==============================
// 文字編碼切換
// ==============================

$("encodingSelect").value = textEncoding;

$("encodingSelect").addEventListener("change", () => {
  textEncoding = $("encodingSelect").value;

  localStorage.setItem("readerTextEncoding", textEncoding);

  if (activeBookId) {
    const current = activeBookId;

    openBook(current, true);
  }

  toast(
    `文字編碼已切換：${$("encodingSelect").selectedOptions[0].textContent}`
  );
});


// ==============================
// 閱讀主題
// ==============================

document.querySelectorAll(".theme-swatch").forEach(btn => {
  btn.onclick = () => {
    document.body.classList.remove(
      "theme-coffee",
      "theme-black",
      "theme-paper"
    );

    if (btn.dataset.theme !== "coffee") {
      document.body.classList.add(`theme-${btn.dataset.theme}`);
    }

    document.querySelectorAll(".theme-swatch").forEach(x => {
      x.classList.toggle("selected", x === btn);
    });

    localStorage.setItem("readerTheme", btn.dataset.theme);
  };
});

const savedTheme = localStorage.getItem("readerTheme") || "coffee";

if (savedTheme !== "coffee") {
  document.body.classList.add(`theme-${savedTheme}`);
}

document.querySelectorAll(".theme-swatch").forEach(x => {
  x.classList.toggle(
    "selected",
    x.dataset.theme === savedTheme
  );
});


// ==============================
// 右側快速操作按鍵
// ==============================

const jumpControls = $("pageJumpControls");

const saveBookmarkButton = $("saveBookmarkBtn");
const toggleBookmarkButton = $("toggleBookmarksBtn");
const bookmarkPanel = $("bookmarkPanel");

if (jumpControls) {
  if (saveBookmarkButton) {
    saveBookmarkButton.type = "button";
    saveBookmarkButton.textContent = "＋";
    saveBookmarkButton.title = "收藏目前段落";
    saveBookmarkButton.setAttribute(
      "aria-label",
      "收藏目前段落"
    );
  }

  if (toggleBookmarkButton) {
    toggleBookmarkButton.type = "button";
    toggleBookmarkButton.textContent = "▤";
    toggleBookmarkButton.title = "我的書籤";
    toggleBookmarkButton.setAttribute(
      "aria-label",
      "我的書籤"
    );
  }

  [
    saveBookmarkButton,
    toggleBookmarkButton,
    bookmarkPanel
  ].filter(Boolean).forEach(element => {
    jumpControls.appendChild(element);
  });
}


// ==============================
// 頁面快速跳轉
// ==============================

$("backToTop").onclick = () => {
  const scroller = getReaderScroller();

  if (scroller === window) {
    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  } else {
    scroller.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }
};

$("backToBottom").onclick = () => {
  const scroller = getReaderScroller();

  if (scroller === window) {
    window.scrollTo({
      top: document.documentElement.scrollHeight,
      behavior: "smooth"
    });
  } else {
    scroller.scrollTo({
      top: scroller.scrollHeight,
      behavior: "smooth"
    });
  }
};


// ==============================
// 滾動事件與進度保存
// ==============================

// 視窗滾動
window.addEventListener(
  "scroll",
  saveProgress,
  { passive: true }
);

// 內部閱讀區域滾動
document.addEventListener(
  "scroll",
  saveProgress,
  {
    passive: true,
    capture: true
  }
);

// 離開頁面時立即保存
window.addEventListener("pagehide", () => {
  clearTimeout(saveProgressTimer);
  saveProgressNow();
});

// 切換分頁時立即保存
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    clearTimeout(saveProgressTimer);
    saveProgressNow();
  }
});


// ==============================
// 側邊欄
// ==============================

$("mobileMenu").onclick = () => {
  const sidebar = $("sidebar");

  if (window.matchMedia("(max-width: 620px)").matches) {
    $("appRoot").classList.remove("sidebar-collapsed");

    sidebar.classList.toggle("open");

  } else {
    sidebar.classList.remove("open");

    $("appRoot").classList.toggle("sidebar-collapsed");
  }
};


// ==============================
// 閱讀設定面板
// ==============================

$("settingsToggle").onclick = () => {
  const panel = $("readerToolbar");

  const isOpen = panel.classList.toggle("open");

  $("settingsToggle").setAttribute(
    "aria-expanded",
    String(isOpen)
  );

  $("settingsToggle").setAttribute(
    "aria-label",
    isOpen ? "關閉閱讀設定" : "開啟閱讀設定"
  );
};


// ==============================
// 鍵盤快捷操作
// ==============================

document.addEventListener("keydown", e => {
  if (e.key === "Escape") {
    $("sidebar").classList.remove("open");

    $("readerToolbar").classList.remove("open");

    $("settingsToggle").setAttribute(
      "aria-expanded",
      "false"
    );

    $("bookmarkPanel").classList.add("hidden");

    $("toggleBookmarksBtn").setAttribute(
      "aria-expanded",
      "false"
    );
  }
});


// ==============================
// 自動登入
// ==============================

if (
  sessionStorage.getItem(SESSION_KEY) === "yes" &&
  isConfigured()
) {
  showApp();
}
