/*
  QRつくるくん - script.js
  できるだけ「読むだけで分かる」構造にしています。

  ポイント：
  - QR生成は qr-code-styling を使用（ロゴ、色、形状変更が簡単）
  - 通常QR：入力したURLをそのままQR化。入力内容を保存・再利用できる
  - 可変QR：go.html?id=xxx の固定URLをQR化。リンクは localStorage で管理
*/

// ===== DOM取得（画面の部品） =====
const el = {
  // モード切替
  modeNormal: document.getElementById("modeNormal"),
  modeVariable: document.getElementById("modeVariable"),
  normalQrSection: document.getElementById("normalQrSection"),
  variableQrSection: document.getElementById("variableQrSection"),

  // 通常QR 入力保存
  saveNormalBtn: document.getElementById("saveNormalBtn"),
  saveNormalStatus: document.getElementById("saveNormalStatus"),
  normalHistoryWrap: document.getElementById("normalHistoryWrap"),
  normalHistoryList: document.getElementById("normalHistoryList"),

  // 可変QR リンク管理フォーム
  linkFormTitle: document.getElementById("linkFormTitle"),
  varLinkId: document.getElementById("varLinkId"),
  varLinkUrl: document.getElementById("varLinkUrl"),
  varLinkSaveBtn: document.getElementById("varLinkSaveBtn"),
  varLinkCancelBtn: document.getElementById("varLinkCancelBtn"),
  varLinkFormStatus: document.getElementById("varLinkFormStatus"),

  // 可変QR リンク一覧
  varLinkList: document.getElementById("varLinkList"),

  // 可変QR 現在QR化中インジケーター
  varQrActiveInfo: document.getElementById("varQrActiveInfo"),
  varQrActiveId: document.getElementById("varQrActiveId"),
  varQrActiveQrUrl: document.getElementById("varQrActiveQrUrl"),

  // QR生成共通
  qrText: document.getElementById("qrText"),
  qrSize: document.getElementById("qrSize"),
  errorCorrection: document.getElementById("errorCorrection"),

  dotStyle: document.getElementById("dotStyle"),
  cornerSquareStyle: document.getElementById("cornerSquareStyle"),
  cornerDotStyle: document.getElementById("cornerDotStyle"),

  qrColor: document.getElementById("qrColor"),
  bgColor: document.getElementById("bgColor"),
  quietZone: document.getElementById("quietZone"),
  quietZoneValue: document.getElementById("quietZoneValue"),

  presetLogo: document.getElementById("presetLogo"),
  logoUpload: document.getElementById("logoUpload"),
  logoSize: document.getElementById("logoSize"),
  logoSizeValue: document.getElementById("logoSizeValue"),
  logoMargin: document.getElementById("logoMargin"),
  logoMarginValue: document.getElementById("logoMarginValue"),
  clearLogoBtn: document.getElementById("clearLogoBtn"),

  qrPreview: document.getElementById("qrPreview"),
  downloadPngBtn: document.getElementById("downloadPngBtn"),
  status: document.getElementById("status"),
};

// ===== 小さなユーティリティ =====
function setStatus(message) {
  el.status.textContent = message || "";
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

/** テキストを HTML にそのまま差し込むときに使う（XSS防止） */
function escHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** タイムスタンプ（ms）を「YYYY/MM/DD HH:MM」形式に変換 */
function formatDate(ts) {
  const d = new Date(ts);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ===== モード管理（通常QR / 可変QR） =====
let currentMode = "normal"; // "normal" | "variable"

function switchMode(mode) {
  currentMode = mode;
  const isVariable = mode === "variable";
  el.normalQrSection.hidden = isVariable;
  el.variableQrSection.hidden = !isVariable;
  el.modeNormal.classList.toggle("modeBtn--active", !isVariable);
  el.modeVariable.classList.toggle("modeBtn--active", isVariable);
  el.modeNormal.setAttribute("aria-selected", String(!isVariable));
  el.modeVariable.setAttribute("aria-selected", String(isVariable));
  if (isVariable) renderLinkList();
  updateQrPreview();
}

/**
 * 可変QR用リダイレクトURL（go.html?id=xxx）を組み立てる
 * 現在のページと同じディレクトリにある go.html を使う
 */
function getVariableQrUrl(id) {
  const base = location.href.replace(/\/[^/?#]*(\?.*)?$/, "/");
  return base + "go.html?id=" + encodeURIComponent(id);
}

// ===== localStorage キーと上限 =====
const LINKS_STORAGE_KEY      = "qrtsLinks";           // 可変QR リンク（go.html が読む）
const LINK_TIMESTAMPS_KEY    = "qrtsLinksTimestamps"; // 可変QR 登録日時
const NORMAL_HISTORY_KEY     = "qrtsNormalHistory";   // 通常QR 入力履歴
const MAX_NORMAL_HISTORY     = 20;                    // 通常QR 履歴の最大件数

// ===== 可変QR: localStorage リンク管理 =====
function loadLinks() {
  try {
    const raw = localStorage.getItem(LINKS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function saveLinks(links) {
  try {
    localStorage.setItem(LINKS_STORAGE_KEY, JSON.stringify(links));
  } catch (e) {
    console.error("localStorage の書き込みに失敗しました", e);
  }
}

function loadLinkTimestamps() {
  try {
    const raw = localStorage.getItem(LINK_TIMESTAMPS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveLinkTimestamps(timestamps) {
  try {
    localStorage.setItem(LINK_TIMESTAMPS_KEY, JSON.stringify(timestamps));
  } catch (e) {
    console.error(e);
  }
}

// ===== 可変QR: リンク一覧の表示 =====
/** 現在 QR化しているリンク ID（null なら未選択） */
let variableSelectedId = null;

/** 編集中のリンク ID（null なら新規登録モード） */
let varLinkEditingId = null;

function renderLinkList() {
  const links = loadLinks();
  const timestamps = loadLinkTimestamps();
  const ids = Object.keys(links);
  const container = el.varLinkList;

  if (ids.length === 0) {
    container.innerHTML =
      '<div class="linkEmpty">まだリンクが登録されていません。上のフォームから追加してください。</div>';
    refreshActiveInfo(links);
    return;
  }

  container.innerHTML = "";
  for (const id of ids) {
    const url = links[id];
    const isActive = id === variableSelectedId;
    const ts = timestamps[id];
    const dateHtml = ts
      ? `<div class="linkItem__date">${escHtml(formatDate(ts))}</div>`
      : "";

    const item = document.createElement("div");
    item.className = "linkItem" + (isActive ? " linkItem--active" : "");
    item.innerHTML = `
      <div class="linkItem__info">
        <div class="linkItem__id">${escHtml(id)}</div>
        <div class="linkItem__url">${escHtml(url)}</div>
        ${dateHtml}
      </div>
      <div class="linkItem__actions">
        <button class="btn btn--primary btn--sm" data-action="qr" data-id="${escHtml(id)}" type="button">QRを再生成</button>
        <button class="btn btn--ghost btn--sm" data-action="edit" data-id="${escHtml(id)}" type="button">編集</button>
        <button class="btn btn--ghost btn--sm btn--danger" data-action="delete" data-id="${escHtml(id)}" type="button">削除</button>
      </div>
    `;
    container.appendChild(item);
  }

  refreshActiveInfo(links);
}

/** 「QR作成中」インジケーターを更新する */
function refreshActiveInfo(links) {
  if (!variableSelectedId || !links[variableSelectedId]) {
    if (variableSelectedId && !links[variableSelectedId]) {
      variableSelectedId = null;
      updateQrPreview();
    }
    el.varQrActiveInfo.hidden = true;
    return;
  }
  el.varQrActiveId.textContent = variableSelectedId;
  el.varQrActiveQrUrl.textContent = getVariableQrUrl(variableSelectedId);
  el.varQrActiveInfo.hidden = false;
}

// ===== 可変QR: リンク登録・編集・削除 =====

/** 登録 / 更新ボタンの処理 */
function handleSaveLink() {
  const id = (el.varLinkId.value || "").trim();
  const url = (el.varLinkUrl.value || "").trim();

  // バリデーション
  if (!id) {
    el.varLinkFormStatus.textContent = "IDを入力してください。";
    el.varLinkId.focus();
    return;
  }
  if (!/^[\w-]+$/.test(id)) {
    el.varLinkFormStatus.textContent = "IDは半角英数字とハイフン（-）のみ使えます。";
    el.varLinkId.focus();
    return;
  }
  if (!url) {
    el.varLinkFormStatus.textContent = "飛び先URLを入力してください。";
    el.varLinkUrl.focus();
    return;
  }
  if (!/^https?:\/\/.+/.test(url)) {
    el.varLinkFormStatus.textContent = "URLは http:// または https:// から始めてください。";
    el.varLinkUrl.focus();
    return;
  }

  const links = loadLinks();
  const timestamps = loadLinkTimestamps();

  // 新規登録で同じ ID が既に存在する場合
  if (!varLinkEditingId && links[id]) {
    el.varLinkFormStatus.textContent = `ID「${id}」はすでに登録されています。別のIDを使うか、一覧から編集してください。`;
    el.varLinkId.focus();
    return;
  }
  // 編集中にIDを変更した場合、既存の別IDと衝突しないか確認
  if (varLinkEditingId && varLinkEditingId !== id && links[id]) {
    el.varLinkFormStatus.textContent = `ID「${id}」はすでに登録されています。別のIDにしてください。`;
    el.varLinkId.focus();
    return;
  }

  // 編集中にIDを変更した場合は古いエントリを削除
  if (varLinkEditingId && varLinkEditingId !== id) {
    delete links[varLinkEditingId];
    delete timestamps[varLinkEditingId];
    if (variableSelectedId === varLinkEditingId) variableSelectedId = id;
  }

  links[id] = url;
  timestamps[id] = Date.now();
  saveLinks(links);
  saveLinkTimestamps(timestamps);

  el.varLinkFormStatus.textContent = "";
  resetLinkForm();
  renderLinkList();
}

/** フォームを「新規登録」の状態に戻す */
function resetLinkForm() {
  varLinkEditingId = null;
  el.varLinkId.value = "";
  el.varLinkUrl.value = "";
  el.varLinkSaveBtn.textContent = "登録する";
  el.varLinkCancelBtn.hidden = true;
  el.varLinkFormStatus.textContent = "";
  el.linkFormTitle.textContent = "リンクを登録する";
}

/** 一覧の「編集」を押したときにフォームを埋める */
function startEditLink(id) {
  const links = loadLinks();
  const url = links[id];
  if (url === undefined) return;

  varLinkEditingId = id;
  el.varLinkId.value = id;
  el.varLinkUrl.value = url;
  el.varLinkSaveBtn.textContent = "更新する";
  el.varLinkCancelBtn.hidden = false;
  el.varLinkFormStatus.textContent = "";
  el.linkFormTitle.textContent = `「${id}」を編集中`;
  el.varLinkId.scrollIntoView({ behavior: "smooth", block: "center" });
  el.varLinkId.focus();
}

/** 一覧の「削除」を押したとき */
function deleteLink(id) {
  if (!confirm(`「${id}」を削除しますか？\nこのリンクのQRコードは使えなくなります。`)) return;

  const links = loadLinks();
  const timestamps = loadLinkTimestamps();
  delete links[id];
  delete timestamps[id];
  saveLinks(links);
  saveLinkTimestamps(timestamps);

  if (variableSelectedId === id) {
    variableSelectedId = null;
    updateQrPreview();
  }
  if (varLinkEditingId === id) resetLinkForm();
  renderLinkList();
}

/** 一覧の「QRを再生成」を押したとき */
function selectLinkForQr(id) {
  variableSelectedId = id;
  updateQrPreview();
  renderLinkList();
  el.qrPreview.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ===== 通常QR: 入力履歴 =====

function loadNormalHistory() {
  try {
    const raw = localStorage.getItem(NORMAL_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveNormalHistoryData(items) {
  try {
    localStorage.setItem(NORMAL_HISTORY_KEY, JSON.stringify(items));
  } catch (e) {
    console.error("localStorage の書き込みに失敗しました", e);
  }
}

/** 「この入力を保存」ボタンの処理 */
function saveCurrentNormalInput() {
  const text = (el.qrText.value || "").trim();
  if (!text) {
    el.saveNormalStatus.textContent = "内容を入力してから保存してください。";
    setTimeout(() => { el.saveNormalStatus.textContent = ""; }, 2500);
    return;
  }

  const items = loadNormalHistory();
  const savedAt = Date.now();

  // 同じテキストが既にある場合は先頭へ移動して日時を更新
  const existingIdx = items.findIndex((item) => item.text === text);
  if (existingIdx !== -1) {
    items[existingIdx].savedAt = savedAt;
    items.unshift(items.splice(existingIdx, 1)[0]);
  } else {
    items.unshift({ id: String(savedAt), text, savedAt });
  }

  // 上限を超えた古いものを削除
  if (items.length > MAX_NORMAL_HISTORY) items.splice(MAX_NORMAL_HISTORY);

  saveNormalHistoryData(items);
  el.saveNormalStatus.textContent = "保存しました。";
  setTimeout(() => { el.saveNormalStatus.textContent = ""; }, 2500);
  renderNormalHistory();
}

/** 保存済み一覧を再描画する */
function renderNormalHistory() {
  const items = loadNormalHistory();

  if (items.length === 0) {
    el.normalHistoryWrap.hidden = true;
    return;
  }

  el.normalHistoryWrap.hidden = false;
  el.normalHistoryList.innerHTML = "";

  for (const item of items) {
    const preview = item.text.length > 55 ? item.text.slice(0, 55) + "…" : item.text;
    const div = document.createElement("div");
    div.className = "historyItem";
    div.innerHTML = `
      <div class="historyItem__info">
        <div class="historyItem__text">${escHtml(preview)}</div>
        <div class="historyItem__date">${escHtml(formatDate(item.savedAt))}</div>
      </div>
      <div class="historyItem__actions">
        <button class="btn btn--primary btn--sm" data-action="restore-normal" data-id="${escHtml(item.id)}" type="button">QRを再生成</button>
        <button class="btn btn--ghost btn--sm btn--danger" data-action="delete-normal" data-id="${escHtml(item.id)}" type="button">削除</button>
      </div>
    `;
    el.normalHistoryList.appendChild(div);
  }
}

/** 保存済み一覧の「QRを再生成」を押したとき */
function restoreNormalQr(id) {
  const items = loadNormalHistory();
  const item = items.find((i) => i.id === id);
  if (!item) return;
  el.qrText.value = item.text;
  updateQrPreview();
  el.qrPreview.scrollIntoView({ behavior: "smooth", block: "center" });
}

/** 保存済み一覧の「削除」を押したとき */
function deleteNormalHistory(id) {
  const items = loadNormalHistory();
  const idx = items.findIndex((i) => i.id === id);
  if (idx === -1) return;
  items.splice(idx, 1);
  saveNormalHistoryData(items);
  renderNormalHistory();
}

// ===== プリセットロゴ（data URL） =====
// 画像ファイルを用意しなくても動くように、SVGをdata URLにしています。
function svgToDataUrl(svg) {
  const encoded = encodeURIComponent(svg)
    .replace(/'/g, "%27")
    .replace(/"/g, "%22");
  return `data:image/svg+xml,${encoded}`;
}

const PRESET_LOGOS = {
  none: null,
  qrts: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect x="0" y="0" width="256" height="256" rx="40" fill="#111827"/>
      <rect x="20" y="20" width="216" height="216" rx="32" fill="#ffffff"/>
      <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
            font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
            font-weight="800" font-size="44" fill="#111827">QR</text>
      <text x="50%" y="70%" dominant-baseline="middle" text-anchor="middle"
            font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
            font-weight="800" font-size="20" fill="#6b7280">つくるくん</text>
    </svg>
  `),
  star: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect width="256" height="256" rx="56" fill="#ffffff"/>
      <path d="M128 26l28.6 58.1 64.1 9.3-46.4 45.2 11 63.9L128 177.6 70.7 202.5l11-63.9L35.3 93.4l64.1-9.3L128 26z"
            fill="#f59e0b" stroke="#111827" stroke-width="10" stroke-linejoin="round"/>
    </svg>
  `),
  heart: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect width="256" height="256" rx="56" fill="#ffffff"/>
      <path d="M128 214s-70-44-94-86c-20-35 2-78 44-84 24-4 40 8 50 22 10-14 26-26 50-22 42 6 64 49 44 84-24 42-94 86-94 86z"
            fill="#ef4444" stroke="#111827" stroke-width="10" stroke-linejoin="round"/>
    </svg>
  `),
  check: svgToDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
      <rect width="256" height="256" rx="56" fill="#ffffff"/>
      <path d="M70 135l38 40 80-96" fill="none" stroke="#10b981" stroke-width="22"
            stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="28" y="28" width="200" height="200" rx="44" fill="none" stroke="#111827" stroke-width="10"/>
    </svg>
  `),
};

// ===== アップロードロゴ管理 =====
// blob: の Object URL は qr-code-styling の Canvas 描画と相性が悪いことがあるので、
// FileReader で data URL にしたうえで使います（PNG ダウンロードも同じ画像が使われます）。
let uploadedLogoDataUrl = null;

function clearUploadedLogoDataOnly() {
  uploadedLogoDataUrl = null;
}

function clearUploadedLogo() {
  clearUploadedLogoDataOnly();
  el.logoUpload.value = "";
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function addWhitePaddingAroundImage(dataUrl, paddingRatio = 0.12) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const minSide = Math.min(img.width, img.height);
        const p = Math.max(8, Math.round(minSide * paddingRatio));
        const cw = img.width + p * 2;
        const ch = img.height + p * 2;
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, cw, ch);
        ctx.drawImage(img, p, p);
        resolve(canvas.toDataURL("image/png"));
      } catch (e) {
        reject(e);
      }
    };
    img.onerror = () => reject(new Error("画像の読み込みに失敗しました"));
    img.src = dataUrl;
  });
}

function crossOriginForImageUrl(url) {
  if (!url) return {};
  if (/^https?:\/\//i.test(url)) return { crossOrigin: "anonymous" };
  return {};
}

// ===== QR生成（qr-code-styling） =====
const qrCode = new QRCodeStyling({
  width: 280,
  height: 280,
  type: "canvas",
  data: "",
  qrOptions: {
    errorCorrectionLevel: "H",
  },
  image: undefined,
  imageOptions: {
    hideBackgroundDots: true,
    margin: 12,
    imageSize: 0.2,
  },
  dotsOptions: {
    type: "rounded",
    color: "#111827",
  },
  cornersSquareOptions: {
    type: "extra-rounded",
    color: "#111827",
  },
  cornersDotOptions: {
    type: "dot",
    color: "#111827",
  },
  backgroundOptions: {
    color: "#ffffff",
  },
  margin: 10,
});

qrCode.append(el.qrPreview);

function getLogoImageUrl() {
  if (uploadedLogoDataUrl) return uploadedLogoDataUrl;
  const presetKey = el.presetLogo.value;
  return PRESET_LOGOS[presetKey] || null;
}

function readUiState() {
  const size = Number(el.qrSize.value) || 280;
  const errorCorrectionLevel = el.errorCorrection.value || "H";

  const dotType = el.dotStyle.value || "rounded";
  const cornerSquareType = el.cornerSquareStyle.value || "extra-rounded";
  const cornerDotType = el.cornerDotStyle.value || "dot";

  const fg = el.qrColor.value || "#111827";
  const bg = el.bgColor.value || "#ffffff";
  const quiet = clamp(Number(el.quietZone.value) || 10, 0, 30);

  const logoSizePercent = clamp(Number(el.logoSize.value) || 20, 0, 60);
  const logoMarginPx = clamp(Number(el.logoMargin.value) || 12, 0, 30);
  const logoImageUrl = logoSizePercent > 0 ? getLogoImageUrl() : null;

  // モードによって QR のデータ元を切り替える
  let data;
  if (currentMode === "variable") {
    data = variableSelectedId ? getVariableQrUrl(variableSelectedId) : "";
  } else {
    data = (el.qrText.value || "").trim();
  }

  return {
    size,
    data,
    errorCorrectionLevel,
    dotType,
    cornerSquareType,
    cornerDotType,
    fg,
    bg,
    quiet,
    logoSizePercent,
    logoMarginPx,
    logoImageUrl,
  };
}

function syncRangeLabels() {
  el.quietZoneValue.textContent = String(el.quietZone.value);
  el.logoSizeValue.textContent = String(el.logoSize.value);
  el.logoMarginValue.textContent = String(el.logoMargin.value);
}

function updateQrPreview() {
  const s = readUiState();
  syncRangeLabels();

  const hasData = s.data.length > 0;
  el.downloadPngBtn.disabled = !hasData;
  if (!hasData) {
    setStatus(
      currentMode === "variable"
        ? "一覧から「QRを再生成」を押すとQRが表示されます。"
        : "内容を入力するとQRが表示されます。"
    );
  } else {
    setStatus("");
  }

  const logoUrl = s.logoImageUrl || undefined;
  qrCode.update({
    width: s.size,
    height: s.size,
    data: s.data || " ", // 完全空は不安定になりやすいのでスペースで回避
    margin: s.quiet,
    qrOptions: {
      errorCorrectionLevel: s.errorCorrectionLevel,
    },
    dotsOptions: {
      type: s.dotType,
      color: s.fg,
    },
    cornersSquareOptions: {
      type: s.cornerSquareType,
      color: s.fg,
    },
    cornersDotOptions: {
      type: s.cornerDotType,
      color: s.fg,
    },
    backgroundOptions: {
      color: s.bg,
    },
    image: logoUrl,
    imageOptions: {
      hideBackgroundDots: true,
      margin: s.logoMarginPx,
      imageSize: s.logoSizePercent / 100,
      ...crossOriginForImageUrl(logoUrl),
    },
  });
}

// ===== PNGダウンロード =====
function downloadBlobAsFile(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function downloadPng() {
  const s = readUiState();
  if (!s.data.trim()) {
    setStatus("先に内容を入力（または「QRを再生成」）してください。");
    return;
  }

  const safe = s.data
    .replace(/^https?:\/\//, "")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 30);
  const name = safe ? `qr_${safe}` : "qr";
  const filename = `${name}.png`;

  setStatus("PNGを作成中…");

  let blob = null;
  try {
    blob = await qrCode.getRawData("png");
    if (!(blob instanceof Blob)) blob = null;
  } catch (_) {
    blob = null;
  }

  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (isIos && blob && navigator.share) {
    const file = new File([blob], filename, { type: "image/png" });
    const canShare = !navigator.canShare || navigator.canShare({ files: [file] });
    if (canShare) {
      setStatus("シェアシートが開きます。「写真に保存」を選んでください。");
      try {
        await navigator.share({ files: [file] });
        setStatus("");
        return;
      } catch (shareErr) {
        if (shareErr.name === "AbortError") {
          setStatus("");
          return;
        }
        console.warn("Web Share API 失敗、通常ダウンロードにフォールバック", shareErr);
      }
    }
  }

  if (blob) {
    downloadBlobAsFile(blob, filename);
    setStatus("PNGをダウンロードしました。");
    return;
  }

  try {
    await qrCode.download({ extension: "png", name });
    setStatus("PNGをダウンロードしました。");
  } catch (e) {
    setStatus("ダウンロードに失敗しました。ロゴ画像を変えるか、別ブラウザで試してください。");
    console.error(e);
  }
}

// ===== イベント（操作したら更新） =====
const updateEvents = ["input", "change"];
const bindUpdate = (node) => updateEvents.forEach((ev) => node.addEventListener(ev, updateQrPreview));

// モード切替
el.modeNormal.addEventListener("click", () => switchMode("normal"));
el.modeVariable.addEventListener("click", () => switchMode("variable"));

// 通常QR: 入力保存ボタン
el.saveNormalBtn.addEventListener("click", saveCurrentNormalInput);

// 通常QR: 保存済み一覧のボタン（イベント委譲）
el.normalHistoryList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "restore-normal") restoreNormalQr(id);
  else if (action === "delete-normal") deleteNormalHistory(id);
});

// 可変QR: フォーム操作
el.varLinkSaveBtn.addEventListener("click", handleSaveLink);
el.varLinkCancelBtn.addEventListener("click", resetLinkForm);

// Enter キーでも登録できるように
[el.varLinkId, el.varLinkUrl].forEach((input) => {
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSaveLink();
  });
});

// 可変QR: リンク一覧のボタン（イベント委譲）
el.varLinkList.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-action]");
  if (!btn) return;
  const { action, id } = btn.dataset;
  if (action === "qr") selectLinkForQr(id);
  else if (action === "edit") startEditLink(id);
  else if (action === "delete") deleteLink(id);
});

// QR生成共通の入力系
bindUpdate(el.qrText);
bindUpdate(el.qrSize);
bindUpdate(el.errorCorrection);
bindUpdate(el.dotStyle);
bindUpdate(el.cornerSquareStyle);
bindUpdate(el.cornerDotStyle);
bindUpdate(el.qrColor);
bindUpdate(el.bgColor);
bindUpdate(el.quietZone);
bindUpdate(el.presetLogo);
bindUpdate(el.logoSize);
bindUpdate(el.logoMargin);

el.logoUpload.addEventListener("change", async () => {
  clearUploadedLogoDataOnly();

  const file = el.logoUpload.files && el.logoUpload.files[0];
  if (!file) {
    updateQrPreview();
    return;
  }
  try {
    const raw = await readFileAsDataURL(file);
    uploadedLogoDataUrl = await addWhitePaddingAroundImage(raw, 0.12);
    updateQrPreview();
    setStatus("ロゴをQR中央に表示しました。PNGダウンロードにも同じロゴが入ります。");
  } catch (e) {
    console.error(e);
    uploadedLogoDataUrl = null;
    updateQrPreview();
    setStatus("画像を読み込めませんでした。PNG / JPEG / WebP / GIF を試してください。");
  }
});

el.clearLogoBtn.addEventListener("click", () => {
  clearUploadedLogo();
  el.presetLogo.value = "none";
  updateQrPreview();
  setStatus("ロゴをオフにしました（サイズスライダーはそのままです）。");
});

el.downloadPngBtn.addEventListener("click", downloadPng);

if (typeof QRCodeStyling === "undefined") {
  setStatus("QR生成ライブラリが読み込めていません。ページを再読み込みしてください。");
}

// ===== 初期表示 =====
syncRangeLabels();
updateQrPreview();
renderNormalHistory(); // 保存済み通常QR履歴を表示
