/**
 * 小說影視化工坊・雲端版（Google Apps Script）v3：新增 MV 製作
 * 董元創作室
 * 雲端硬碟結構：
 *   小說影視化工坊/
 *     ├─ 作品資料/   每部作品一個 JSON
 *     └─ 匯出檔/     CSV、TXT、JSON 備份
 */
const ROOT_NAME = '小說影視化工坊';

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('小說影視化工坊')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* ---------- 資料夾 ---------- */
function sub_(parent, name) {
  const it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function root_() {
  const p = PropertiesService.getUserProperties();
  const id = p.getProperty('FS_ROOT_ID');
  if (id) {
    try { const f = DriveApp.getFolderById(id); if (!f.isTrashed()) return f; } catch (e) {}
  }
  const it = DriveApp.getRootFolder().getFoldersByName(ROOT_NAME);
  const f = it.hasNext() ? it.next() : DriveApp.createFolder(ROOT_NAME);
  p.setProperty('FS_ROOT_ID', f.getId());
  return f;
}
function dataFolder_() { return sub_(root_(), '作品資料'); }
function file_(id) {
  if (!/^[a-z0-9]+$/i.test(String(id))) throw new Error('作品代號格式錯誤');
  const it = dataFolder_().getFilesByName(id + '.json');
  while (it.hasNext()) { const f = it.next(); if (!f.isTrashed()) return f; }
  return null;
}
/* 版本號：用自己的時間戳記判斷多裝置衝突，比雲端硬碟的修改時間可靠 */
function ver_(id, f) {
  const v = PropertiesService.getUserProperties().getProperty('FSV_' + id);
  return v ? Number(v) : (f ? f.getLastUpdated().getTime() : 0);
}

/* ---------- 前端呼叫的函式 ---------- */
function getInfo() {
  return { rootUrl: root_().getUrl(), projects: listProjects() };
}

function listProjects() {
  const out = [];
  const it = dataFolder_().getFiles();
  while (it.hasNext()) {
    const f = it.next();
    const n = f.getName();
    if (f.isTrashed() || !/\.json$/.test(n)) continue;
    const id = n.replace(/\.json$/, '');
    out.push({ id: id, title: f.getDescription() || id, updated: ver_(id, f) });
  }
  return out.sort(function (a, b) { return b.updated - a.updated; });
}

function loadProject(id) {
  const f = file_(id);
  if (!f) throw new Error('找不到這部作品');
  return { content: f.getBlob().getDataAsString('UTF-8'), updated: ver_(id, f) };
}

function getProjectMeta(id) {
  const f = file_(id);
  return f ? { updated: ver_(id, f) } : null;
}

function saveProject(id, json, title, base, force) {
  const lock = LockService.getUserLock();
  lock.waitLock(20000);
  try {
    let f = file_(id);
    const cur = ver_(id, f);
    if (f && !force && base && cur > base) {
      return { conflict: true, updated: cur, remote: f.getBlob().getDataAsString('UTF-8') };
    }
    if (f) f.setContent(json);
    else f = dataFolder_().createFile(id + '.json', json, 'application/json');
    f.setDescription(String(title || '未命名作品').slice(0, 200));
    const now = Date.now();
    PropertiesService.getUserProperties().setProperty('FSV_' + id, String(now));
    return { updated: now };
  } finally {
    lock.releaseLock();
  }
}

function deleteProject(id) {
  const f = file_(id);
  if (f) f.setTrashed(true);   // 移到垃圾桶，30 天內可從雲端硬碟救回
  PropertiesService.getUserProperties().deleteProperty('FSV_' + id);
  return true;
}

function saveExport(name, content, mime) {
  const safe = String(name).replace(/[\\/:*?"<>|]/g, '');
  // MV 企劃書（.md）等雲端硬碟不認得的格式，一律以純文字存檔
  const ok = ['application/json', 'text/csv', 'text/plain'];
  const f = sub_(root_(), '匯出檔').createFile(safe, content, ok.indexOf(mime) >= 0 ? mime : 'text/plain');
  return { url: f.getUrl() };
}
