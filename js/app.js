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
const saveMeta = () => localStorage.setItem(META_KEY, JSON.stringify(meta));
const isConfigured = () => typeof ACCESS_PASSWORD_HASH === "string" && /^[a-f0-9]{64}$/i.test(ACCESS_PASSWORD_HASH);
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}
function showApp(){ $("loginScreen").classList.add("hidden"); $("appRoot").classList.remove("hidden"); loadLibrary(); }
function lockApp(){ sessionStorage.removeItem(SESSION_KEY); $("appRoot").classList.add("hidden"); $("loginScreen").classList.remove("hidden"); $("passwordInput").value=""; $("loginError").textContent=""; window.scrollTo(0,0); }
$("loginForm").addEventListener("submit", async e=>{
  e.preventDefault(); const password=$("passwordInput").value;
  if(!isConfigured()){ $("loginError").textContent="網站尚未設定密碼。請管理者先完成 README 的密碼設定步驟。"; return; }
  const hash=await sha256(password);
  if(hash.toLowerCase()===ACCESS_PASSWORD_HASH.toLowerCase()){ sessionStorage.setItem(SESSION_KEY,"yes"); showApp(); }
  else { $("loginError").textContent="密碼不正確，請再試一次。"; $("passwordInput").select(); }
});
$("lockBtn").onclick=lockApp;
function toast(message){const el=$("toast");el.textContent=message;el.classList.add("show");setTimeout(()=>el.classList.remove("show"),2600);}
function formatDate(timestamp){return new Date(timestamp).toLocaleDateString("zh-TW",{month:"numeric",day:"numeric"});}
function bookMeta(id){return meta[id]||(meta[id]={favorite:false,lastRead:null,progress:0,readingAnchor:null,bookmarks:[]});}
async function loadLibrary(){
  try{
    const response=await fetch("novels/manifest.json",{cache:"no-store"});
    if(!response.ok) throw new Error("找不到 novels/manifest.json");
    const manifest=await response.json();
    if(!Array.isArray(manifest.books)) throw new Error("manifest 格式不正確");
    books=manifest.books.map((b,i)=>({...b,id:b.id||`book-${i}`,file:b.file})).filter(b=>b.title&&b.file);
    renderLibrary();
    const last=books.find(b=>b.id===localStorage.getItem("activeBookId"));
    if(last) openBook(last.id); else if(!books.length) $("welcomePanel").classList.remove("hidden");
  }catch(error){console.error(error);$("libraryList").innerHTML='<div class="empty-library"><p>書庫載入失敗</p><small>請確認 novels/manifest.json 與 TXT 檔案已上傳。</small></div>';toast("書庫載入失敗，請稍後重試");}
}
function renderLibrary(){
  const query=$("searchInput").value.trim().toLowerCase();
  let list=books.filter(b=>b.title.toLowerCase().includes(query));
  if(activeFilter==="favorite") list=list.filter(b=>bookMeta(b.id).favorite);
  if(activeFilter==="recent") list=list.filter(b=>bookMeta(b.id).lastRead);
  $("bookCount").textContent=`${books.length} 本`;
  const host=$("libraryList");host.innerHTML="";
  if(!list.length){host.innerHTML=`<div class="empty-library"><div class="empty-icon">▤</div><p>${books.length?"沒有符合條件的小說":"書架目前是空的"}</p><small>${books.length?"試試其他關鍵字或篩選條件。":"管理者尚未新增 TXT 小說。"}</small></div>`;return;}
  list.forEach(book=>{const m=bookMeta(book.id);const item=document.createElement("div");item.className="book-item"+(book.id===activeBookId?" active":"");const cover=document.createElement("div");cover.className="book-cover";cover.textContent="書";const info=document.createElement("div");info.className="book-info";const title=document.createElement("div");title.className="book-title";title.textContent=book.title;const sub=document.createElement("div");sub.className="book-sub";sub.textContent=m.lastRead?`上次閱讀 ${formatDate(m.lastRead)}`:"尚未閱讀";info.append(title,sub);item.append(cover,info);if(m.favorite){const fav=document.createElement("span");fav.className="book-fav";fav.textContent="♥";item.append(fav);}item.addEventListener("click",()=>openBook(book.id));host.append(item);});
}
function normalizeDecodedText(text){return text.replace(/^\uFEFF/,"").replace(/\r\n?/g,"\n");}
function decodeText(buffer, requestedEncoding="auto"){
  const bytes=new Uint8Array(buffer);
  const hasPrefix=(...prefix)=>prefix.every((v,i)=>bytes[i]===v);
  // BOM 標記優先於使用者選擇，避免 UTF-16 檔案被誤判。
  if(hasPrefix(0xEF,0xBB,0xBF)) return normalizeDecodedText(new TextDecoder("utf-8").decode(bytes));
  if(hasPrefix(0xFF,0xFE)) return normalizeDecodedText(new TextDecoder("utf-16le").decode(bytes));
  if(hasPrefix(0xFE,0xFF)) return normalizeDecodedText(new TextDecoder("utf-16be").decode(bytes));
  if(requestedEncoding!=="auto"){
    try{return normalizeDecodedText(new TextDecoder(requestedEncoding,{fatal:false}).decode(bytes));}
    catch(error){throw new Error(`瀏覽器不支援 ${requestedEncoding} 編碼，請改用自動辨識或 UTF-8。`);}
  }
  // UTF-8 使用 fatal 模式驗證；只有完全合法時才優先採用。
  try{return normalizeDecodedText(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}
  catch(error){}
  // 舊式中文檔案：以 Big5、GB18030 分別解碼，再用常見字詞與替代字元做簡易評分。
  const candidates=[];
  for(const encoding of ["big5","gb18030"]){
    try{
      const text=normalizeDecodedText(new TextDecoder(encoding,{fatal:false}).decode(bytes));
      candidates.push({encoding,text,score:scoreChineseText(text)});
    }catch(error){}
  }
  if(!candidates.length) return normalizeDecodedText(new TextDecoder("utf-8").decode(bytes));
  candidates.sort((a,b)=>b.score-a.score);
  return candidates[0].text;
}
function scoreChineseText(text){
  const replacement=(text.match(/\uFFFD/g)||[]).length;
  const controls=(text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g)||[]).length;
  const cjk=(text.match(/[\u3400-\u9FFF]/g)||[]).length;
  const traditional=(text.match(/[體國學會說這個為與後裡發現時實經過還對讓從無開關點應]/g)||[]).length;
  const simplified=(text.match(/[体国学会说这个为与后里发现时经还对让从无开关点应]/g)||[]).length;
  return cjk*2+traditional*1.5+simplified*1.5-replacement*100-controls*100;
}
async function openBook(id, forceReload=false){
  const book=books.find(b=>b.id===id);if(!book)return;
  try{
    if(forceReload || typeof book.content!="string"){
      const response=await fetch(encodeURI(book.file),{cache:"force-cache"});if(!response.ok)throw new Error(`HTTP ${response.status}`);
      const buffer=await response.arrayBuffer();book.content=decodeText(buffer,textEncoding);
    }
    activeBookId=id;localStorage.setItem("activeBookId",id);
    const m=bookMeta(id);m.lastRead=Date.now();saveMeta();
    $("welcomePanel").classList.add("hidden");$("reader").classList.remove("hidden");$("readerTitle").textContent=book.title;$("breadcrumbTitle").textContent=book.title;$("bookMeta").textContent=`NOW READING · ${Math.max(1,book.content.length).toLocaleString()} CHARACTERS`;
    $("favoriteBtn").textContent=m.favorite?"♥":"♡";$("favoriteBtn").classList.toggle("is-favorite",m.favorite);renderNovel(book);renderLibrary();
    requestAnimationFrame(()=>{
      if(m.readingAnchor && !restoreReadingAnchor(m.readingAnchor)){
        const max=document.documentElement.scrollHeight-innerHeight;window.scrollTo(0,max*(m.progress||0));
      }else if(!m.readingAnchor){
        const max=document.documentElement.scrollHeight-innerHeight;window.scrollTo(0,max*(m.progress||0));
      }
      renderBookmarks();
    });
    $("sidebar").classList.remove("open");
  }catch(error){console.error(error);toast(`無法開啟「${book.title}」，請確認 TXT 檔案路徑。`);}
}

function renderNovel(book){
  const content = $("novelContent");
  content.replaceChildren();

  // 每本小說重新從第 0 個閱讀位置開始編號
  let readingIndex = 0;

  const lines = book.content.split("\n");
  const chapters = [];
  let chunk = [];

  const fragment = document.createDocumentFragment();

  // 辨識常見中文小說章節標題
  const pattern = /^\s*(第[〇零一二三四五六七八九十百千\d]+[章节節回卷幕部篇].*|序章|楔子|前言|後記|后记|番外篇?.*|終章|终章)\s*$/;

  // 將累積的文字建立成段落，並加入閱讀索引
  const flush = () => {
    const text = chunk.join("\n").trim();

    if(text){
      const p = document.createElement("p");
      p.textContent = text;
      p.dataset.readingIndex = String(readingIndex++);
      fragment.append(p);
    }

    chunk = [];
  };

  for(const line of lines){
    const trimmed = line.trim();

    // 遇到章節標題
    if(trimmed && pattern.test(trimmed)){
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
    }
    // 遇到空白行，代表一個段落結束
    else if(!trimmed){
      flush();
    }
    // 一般小說文字
    else{
      chunk.push(line);
    }
  }

  // 處理最後一個段落
  flush();

  content.append(fragment);

  // 更新章節導覽
  const nav = $("chapterNav");
  const navList = $("chapterList");
  const body = content.parentElement;

  navList.replaceChildren();

  if(chapters.length > 5){
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
  }else{
    nav.classList.add("is-hidden");
    body.classList.add("no-chapters");
  }

  // 套用閱讀設定
  content.style.fontSize = `${fontSize}px`;
  content.style.lineHeight = lineHeight;

  // 更新閱讀進度
  const progress = bookMeta(book.id).progress || 0;

  $("progressText").textContent =
    `閱讀進度 ${Math.round(progress * 100)}%`;

  $("progressBar").style.width = `${progress * 100}%`;

  // 更新書籤清單
  renderBookmarks();
}

function readingElements(){return Array.from($("novelContent").querySelectorAll("[data-reading-index]"));}
function currentReadingAnchor(){
  const elements=readingElements();if(!elements.length)return null;
  let current=elements[0];
  for(const el of elements){if(el.getBoundingClientRect().top<=150)current=el;else break;}
  return {index:Number(current.dataset.readingIndex)||0,offset:Math.round(current.getBoundingClientRect().top)};
}
function restoreReadingAnchor(anchor){
  const el=readingElements().find(item=>Number(item.dataset.readingIndex)===Number(anchor.index));
  if(!el)return false;
  window.scrollTo({top:window.scrollY+el.getBoundingClientRect().top-Number(anchor.offset||0),behavior:"auto"});
  return true;
}
function renderBookmarks(){
  if(!$("bookmarkList")||!activeBookId)return;
  const items=bookMeta(activeBookId).bookmarks||[];
  $("bookmarkCount").textContent=String(items.length);
  const host=$("bookmarkList");host.replaceChildren();
  if(!items.length){const empty=document.createElement("p");empty.className="bookmark-empty";empty.textContent="尚未新增手動書籤。";host.append(empty);return;}
  items.forEach((item,index)=>{
    const row=document.createElement("div");row.className="bookmark-item";
    const info=document.createElement("div");info.className="bookmark-item-info";
    const title=document.createElement("strong");title.textContent=item.note||`書籤 ${index+1}`;
    const detail=document.createElement("small");detail.textContent=`第 ${Number(item.anchor.index)+1} 個段落 · ${formatDate(item.createdAt)}`;
    info.append(title,detail);
    const jump=document.createElement("button");jump.type="button";jump.className="bookmark-jump";jump.textContent="跳轉";jump.onclick=()=>{if(restoreReadingAnchor(item.anchor)){saveProgress();window.scrollBy({top:-0,behavior:"auto"});}};
    const remove=document.createElement("button");remove.type="button";remove.className="bookmark-remove";remove.textContent="刪除";remove.onclick=()=>{if(!confirm("確定刪除此書籤？"))return;const list=bookMeta(activeBookId).bookmarks;list.splice(index,1);saveMeta();renderBookmarks();toast("已刪除書籤");};
    row.append(info,jump,remove);host.append(row);
  });
}
function addManualBookmark(){
  if(!activeBookId)return;
  const anchor=currentReadingAnchor();if(!anchor){toast("目前沒有可收藏的段落");return;}
  const note=prompt("替這個書籤加上備註（可留空）：","");if(note===null)return;
  const m=bookMeta(activeBookId);m.bookmarks=m.bookmarks||[];
  m.bookmarks.unshift({id:`bm-${Date.now()}-${Math.random().toString(16).slice(2,7)}`,anchor,note:note.trim(),createdAt:Date.now()});
  saveMeta();renderBookmarks();toast("已收藏目前段落");
}
function saveProgress(){if(!activeBookId)return;clearTimeout(saveProgressTimer);saveProgressTimer=setTimeout(()=>{const max=document.documentElement.scrollHeight-innerHeight;const m=bookMeta(activeBookId);m.progress=max>0?Math.min(1,Math.max(0,window.scrollY/max)):0;m.readingAnchor=currentReadingAnchor();saveMeta();$("progressBar").style.width=`${m.progress*100}%`;$("progressText").textContent=`閱讀進度 ${Math.round(m.progress*100)}%`;},350);}
function setFontSize(v){fontSize=Math.max(13,Math.min(32,v));localStorage.setItem("readerFontSize",fontSize);$("fontValue").textContent=`${fontSize} px`;$("novelContent").style.fontSize=`${fontSize}px`;}
function setLineHeight(v){lineHeight=Math.max(1.5,Math.min(2.8,Math.round(v*10)/10));localStorage.setItem("readerLineHeight",lineHeight);$("lineValue").textContent=lineHeight;$("novelContent").style.lineHeight=lineHeight;}
$("saveBookmarkBtn").onclick=addManualBookmark;
$("toggleBookmarksBtn").onclick=()=>{
  const panel=$("bookmarkPanel"),open=panel.classList.toggle("hidden")===false;
  $("toggleBookmarksBtn").setAttribute("aria-expanded",String(open));
  if(open)renderBookmarks();
};
$("searchInput").oninput=renderLibrary;
document.querySelectorAll(".filter").forEach(btn=>btn.onclick=()=>{activeFilter=btn.dataset.filter;document.querySelectorAll(".filter").forEach(x=>x.classList.toggle("active",x===btn));renderLibrary();});
$("favoriteBtn").onclick=()=>{if(!activeBookId)return;const m=bookMeta(activeBookId);m.favorite=!m.favorite;saveMeta();$("favoriteBtn").textContent=m.favorite?"♥":"♡";$("favoriteBtn").classList.toggle("is-favorite",m.favorite);renderLibrary();toast(m.favorite?"已加入我的收藏":"已取消收藏");};
$("fontDown").onclick=()=>setFontSize(fontSize-1);$("fontUp").onclick=()=>setFontSize(fontSize+1);$("lineDown").onclick=()=>setLineHeight(lineHeight-.1);$("lineUp").onclick=()=>setLineHeight(lineHeight+.1);$("fontValue").textContent=`${fontSize} px`;$("lineValue").textContent=lineHeight;
$("encodingSelect").value=textEncoding;
$("encodingSelect").addEventListener("change",()=>{textEncoding=$("encodingSelect").value;localStorage.setItem("readerTextEncoding",textEncoding);if(activeBookId){const current=activeBookId;const oldProgress=bookMeta(current).progress||0;openBook(current,true).then(()=>{requestAnimationFrame(()=>{const max=document.documentElement.scrollHeight-innerHeight;window.scrollTo(0,max*oldProgress);});});}toast(`文字編碼已切換：${$("encodingSelect").selectedOptions[0].textContent}`);});
document.querySelectorAll(".theme-swatch").forEach(btn=>btn.onclick=()=>{document.body.classList.remove("theme-coffee","theme-black","theme-paper");if(btn.dataset.theme!=="coffee")document.body.classList.add(`theme-${btn.dataset.theme}`);document.querySelectorAll(".theme-swatch").forEach(x=>x.classList.toggle("selected",x===btn));localStorage.setItem("readerTheme",btn.dataset.theme);});
const savedTheme=localStorage.getItem("readerTheme")||"coffee";if(savedTheme!=="coffee")document.body.classList.add(`theme-${savedTheme}`);document.querySelectorAll(".theme-swatch").forEach(x=>x.classList.toggle("selected",x.dataset.theme===savedTheme));
if(sessionStorage.getItem(SESSION_KEY)==="yes"&&isConfigured())showApp();

$("backToTop").onclick=()=>window.scrollTo({top:0,behavior:"smooth"});
$("backToBottom").onclick=()=>window.scrollTo({top:document.documentElement.scrollHeight,behavior:"smooth"});
window.addEventListener("scroll",saveProgress,{passive:true});
window.addEventListener("pagehide",()=>{
  if(!activeBookId)return;
  clearTimeout(saveProgressTimer);
  const max=document.documentElement.scrollHeight-innerHeight;
  const m=bookMeta(activeBookId);
  m.progress=max>0?Math.min(1,Math.max(0,window.scrollY/max)):0;
  m.readingAnchor=currentReadingAnchor();
  saveMeta();
});
$("mobileMenu").onclick=()=>{
  const sidebar=$("sidebar");
  if(window.matchMedia("(max-width: 620px)").matches){
    // A desktop-collapsed state must not prevent the mobile drawer from opening.
    $("appRoot").classList.remove("sidebar-collapsed");
    sidebar.classList.toggle("open");
  }else{
    sidebar.classList.remove("open");
    $("appRoot").classList.toggle("sidebar-collapsed");
  }
};
$("settingsToggle").onclick=()=>{
  const panel=$("readerToolbar");
  const isOpen=panel.classList.toggle("open");
  $("settingsToggle").setAttribute("aria-expanded",String(isOpen));
  $("settingsToggle").setAttribute("aria-label",isOpen?"關閉閱讀設定":"開啟閱讀設定");
};
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    $("sidebar").classList.remove("open");
    $("readerToolbar").classList.remove("open");
    $("settingsToggle").setAttribute("aria-expanded","false");
  }
});
