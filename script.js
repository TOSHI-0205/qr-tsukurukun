/*
  QRつくるくん - script.js
  できるだけ「読むだけで分かる」構造にしています。

  ポイント：
  - QR生成は qr-code-styling を使用（ロゴ、色、形状変更が簡単）
  - 通常QR：入力したURLをそのままQR化
  - 可変QR：go.html?id=xxx の固定URLをQR化（links.json で転送先を管理）
*/

// ===== DOM取得（画面の部品） =====
const el = {
  // モード切替
  modeNormal: document.getElementById("modeNormal"),
  modeVariable: document.getElementById("modeVariable"),
  normalQrSection: document.getElementById("normalQrSection"),
  variableQrSection: document.getElementById("variableQrSection"),
  variableId: document.getElementById("variableId"),
  variableQrUrl: document.getElementById("variableQrUrl"),

  // QR入力
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
  updateQrPreview();
}

/**
 * 可変QR用リダイレクトURL（go.html?id=xxx）を組み立てる
 * 現在のページと同じディレクトリにある go.html を使う
 */
function getVariableQrUrl(id) {
  // "index.html" や末尾のファイル名を除いてディレクトリパスを取る
  const base = location.href.replace(/\/[^/?#]*(\?.*)?$/, "/");
  return base + "go.html?id=" + encodeURIComponent(id);
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

/** アップロード済みロゴのデータだけ消す（ファイル入力は触らない） */
function clearUploadedLogoDataOnly() {
  uploadedLogoDataUrl = null;
}

/**
 * ロゴを完全にオフにするとき用（データ＋ファイル入力を空にする）
 * ※「change のたびに最初にこれを呼ぶ」と、選んだファイルが空になって読めなくなるので注意。
 */
function clearUploadedLogo() {
  clearUploadedLogoDataOnly();
  el.logoUpload.value = "";
}

/** ファイルを Data URL（文字列）で読み込む */
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * ロゴ画像の周りに「白い余白」を付けた画像を作る（読み取りやすさ用）
 * ※画像が小さいときは px、大きいときは比率でパディングが増えます。
 */
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

/**
 * qr-code-styling が画像を読み込むときの crossOrigin 設定
 * data:/blob: に anonymous を付けると Canvas に描画できない環境があるため付けません。
 */
function crossOriginForImageUrl(url) {
  if (!url) return {};
  if (/^https?:\/\//i.test(url)) return { crossOrigin: "anonymous" };
  return {};
}

// ===== QR生成（qr-code-styling） =====
// 初期設定（あとで update() で差分更新していきます）
const qrCode = new QRCodeStyling({
  width: 280,
  height: 280,
  type: "canvas", // PNGダウンロードしやすい
  data: "",
  qrOptions: {
    errorCorrectionLevel: "H",
  },
  image: undefined,
  imageOptions: {
    // 中央のドットを消してロゴを浮かせる（これが無いとロゴが見えない／薄くなることがあります）
    hideBackgroundDots: true,
    margin: 12,
    imageSize: 0.2, // QR全体に対して約20%
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
  margin: 10, // quiet zone（余白）
});

// 画面にQRプレビューを描画
qrCode.append(el.qrPreview);

function getLogoImageUrl() {
  // アップロードがある場合はそれが最優先
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
    const id = (el.variableId.value || "").trim();
    if (id) {
      const url = getVariableQrUrl(id);
      data = url;
      el.variableQrUrl.textContent = url;
    } else {
      data = "";
      el.variableQrUrl.textContent = "（IDを入力してください）";
    }
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

  // 入力が空なら、ダウンロードを無効にして案内表示
  const hasData = s.data.length > 0;
  el.downloadPngBtn.disabled = !hasData;
  if (!hasData) setStatus("内容を入力するとQRが表示されます。");
  else setStatus("");

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
/** Blob をファイルとして保存（一部モバイルで qr-code-styling の download() が弱いときの予備） */
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
    setStatus("先に内容を入力してください。");
    return;
  }

  // ファイル名をそれっぽく（URLは長いので短く）
  const safe = s.data
    .replace(/^https?:\/\//, "")
    .replace(/[^\w\-]+/g, "_")
    .slice(0, 30);
  const name = safe ? `qr_${safe}` : "qr";
  const filename = `${name}.png`;

  setStatus("PNGを作成中…");

  // まず Blob を取得する（iOS の Web Share API にも使う）
  let blob = null;
  try {
    blob = await qrCode.getRawData("png");
    if (!(blob instanceof Blob)) blob = null;
  } catch (_) {
    blob = null;
  }

  // --- iOS Safari / Chrome: Web Share API でシェアシートを出す ---
  // シェアシートの「写真に保存」を選ぶと写真アプリに保存できる
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
          // ユーザーがシェアシートをキャンセルした
          setStatus("");
          return;
        }
        console.warn("Web Share API 失敗、通常ダウンロードにフォールバック", shareErr);
      }
    }
  }

  // --- PC・Android・iOS でシェアが使えない場合: 通常ダウンロード ---
  if (blob) {
    downloadBlobAsFile(blob, filename);
    setStatus("PNGをダウンロードしました。");
    return;
  }

  // getRawData が使えない環境は qrCode.download() を試す
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

// QR入力系
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
bindUpdate(el.variableId);

el.logoUpload.addEventListener("change", async () => {
  // 以前アップロードした Data URL だけ破棄（input を空にしない＝今選んだファイルを残す）
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

// 初期表示
syncRangeLabels();
updateQrPreview();
