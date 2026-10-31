const state = {
  fileName: "示例内容.srt",
  rows: [],
  selectedRowId: "",
  selectedGroup: "",
  groupDrafts: {},
  groupTouched: {},
  mergedText: "",
  listening: false,
  keepListening: false,
  recognitionStarting: false,
  nativeListening: false,
  nativePollTimer: null,
  nativeFinalID: 0,
  heardText: "还没有收到语音内容。",
  plugins: {
    speech: true,
    buttonRead: true,
    rowRead: true
  },
  voiceReply: "现在待命中，你可以先碰一下任意地方听内容，也可以直接说读帮助。",
  lastAction: "还没有执行动作。",
  pendingButtonAction: "",
  pendingButtonTimer: null,
  pendingButtonElement: null,
  pendingButtonReady: false,
  voiceEditTarget: null,
  voiceEditStart: 0,
  voiceEditEnd: 0,
  lastReadElement: null,
  lastReadAt: 0,
  readCursor: -1,
  micReady: false
};

const dom = {
  pageIntro: document.getElementById("pageIntro"),
  fileCard: document.getElementById("fileCard"),
  focusCard: document.getElementById("focusCard"),
  noticeCard: document.getElementById("noticeCard"),
  stepOneCard: document.getElementById("stepOneCard"),
  stepTwoCard: document.getElementById("stepTwoCard"),
  stepThreeCard: document.getElementById("stepThreeCard"),
  stepFourCard: document.getElementById("stepFourCard"),
  mainActionHelp: document.getElementById("mainActionHelp"),
  voiceReplyBox: document.getElementById("voiceReplyBox"),
  lastActionBox: document.getElementById("lastActionBox"),
  voiceModeBox: document.getElementById("voiceModeBox"),
  heardBox: document.getElementById("heardBox"),
  canSayBox: document.getElementById("canSayBox"),
  tableHelp: document.getElementById("tableHelp"),
  segmentHelp: document.getElementById("segmentHelp"),
  exportHelp: document.getElementById("exportHelp"),
  mergeHelp: document.getElementById("mergeHelp"),
  fileNameText: document.getElementById("fileNameText"),
  focusText: document.getElementById("focusText"),
  statusText: document.getElementById("statusText"),
  readHint: document.getElementById("readHint"),
  voiceReplyText: document.getElementById("voiceReplyText"),
  lastActionText: document.getElementById("lastActionText"),
  nativeVoiceStatusText: document.getElementById("nativeVoiceStatusText"),
  listenToggle: document.getElementById("listenToggle"),
  listenButtonText: document.getElementById("listenButtonText"),
  heardText: document.getElementById("heardText"),
  groupTitleText: document.getElementById("groupTitleText"),
  groupMetaText: document.getElementById("groupMetaText"),
  groupWriter: document.getElementById("groupWriter"),
  rowTableBody: document.getElementById("rowTableBody"),
  exportPreview: document.getElementById("exportPreview"),
  mergePreview: document.getElementById("mergePreview"),
  liveText: document.getElementById("liveText"),
  fileInput: document.getElementById("fileInput")
};

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = null;
const nativeVoiceURL = "http://127.0.0.1:4174";

function openedAsFile() {
  return window.location.protocol === "file:";
}

function canListenHere() {
  return !!SpeechRecognition;
}

function voiceHintLine() {
  if (!canListenHere()) {
    return "当前这台设备现在这款浏览器还不支持直接听你说话，换成电脑上的 Chrome 或 Edge 会更稳。";
  }

  if (openedAsFile()) {
    return "如果开始说话没反应，通常是因为这页是直接打开的文件，换成浏览器里的本地预览会更稳。";
  }

  return "第一次开始说话时，会先后询问听写和麦克风，两次都要点允许。";
}

function listenFailText(problem) {
  const name =
    typeof problem === "string"
      ? problem
      : String((problem && (problem.error || problem.name)) || "");

  if (!canListenHere()) {
    return "当前这款浏览器还不支持直接听你说话，换成电脑上的 Chrome 或 Edge 再试。";
  }

  if (name === "not-allowed" || name === "NotAllowedError" || name === "SecurityError") {
    if (openedAsFile()) {
      return "你还没成功打开麦克风，而且这页像是直接打开的文件。请改用浏览器里的本地预览，再点允许麦克风。";
    }

    return "你还没允许这页使用麦克风。请点允许后再试；如果系统又询问听写，也要点允许。";
  }

  if (name === "service-not-allowed") {
    return "这台设备把说话功能拦住了，换成 Chrome 或 Edge 再试。";
  }

  if (name === "audio-capture" || name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "没有找到能用的麦克风，请先把麦克风连好。";
  }

  if (name === "NotReadableError" || name === "TrackStartError") {
    return "麦克风现在可能正被别的软件占着，先关掉别的软件再试。";
  }

  if (name === "network") {
    return "现在连不上说话服务，请检查网络后再试。";
  }

  if (name === "no-speech") {
    return "刚才没有听到你的声音，请靠近麦克风再说一次。";
  }

  if (name === "aborted") {
    return "刚开始就被打断了，请再点一次开始说话。";
  }

  if (openedAsFile()) {
    return "现在这页像是直接打开的文件，这种打开法常常拿不到麦克风。请改用浏览器里的本地预览再试。";
  }

  return "现在还不能开始听你说话，请再试一次。";
}

async function warmUpMic() {
  if (state.micReady) {
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((track) => track.stop());
  state.micReady = true;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function numberToChinese(value) {
  const digits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const units = ["", "十", "百", "千"];
  const text = String(value).trim();

  if (!/^\d+$/.test(text)) {
    return text;
  }

  const number = Number(text);
  if (number === 0) {
    return digits[0];
  }

  if (number < 10) {
    return digits[number];
  }

  const chars = String(number).split("");
  let result = "";

  chars.forEach((char, index) => {
    const digit = Number(char);
    const unitIndex = chars.length - index - 1;

    if (digit === 0) {
      if (!result.endsWith(digits[0]) && unitIndex > 0) {
        result += digits[0];
      }
      return;
    }

    result += digits[digit] + units[unitIndex];
  });

  return result
    .replace(/零+/g, "零")
    .replace(/零$/g, "")
    .replace(/^一十/, "十");
}

function speechFriendlyText(text) {
  return String(text || "")
    .replace(/第\s*(\d+)\s*行/g, (_, number) => `第${numberToChinese(number)}行`)
    .replace(/(\d+)\s*行/g, (_, number) => `${numberToChinese(number)}行`)
    .replace(/当前行/g, "当前这一行")
    .replace(/上一行/g, "上面一行")
    .replace(/下一行/g, "下面一行");
}

function setSpeechLabel(element, text) {
  if (!element) {
    return;
  }

  element.setAttribute("aria-label", speechFriendlyText(text));
}

function sampleRows() {
  return [
    {
      id: "row-1",
      no: 1,
      start: "00:00:00,000",
      end: "00:00:03,000",
      source: "现在开始读屏。",
      draft: "现在开始读屏。",
      group: "第 1 段",
      owner: "你",
      status: "已写"
    },
    {
      id: "row-2",
      no: 2,
      start: "00:00:03,500",
      end: "00:00:06,000",
      source: "你可以说下一行，继续往下听。",
      draft: "你可以说下一行，继续往下听。",
      group: "第 1 段",
      owner: "小林",
      status: "待写"
    },
    {
      id: "row-3",
      no: 3,
      start: "00:00:06,500",
      end: "00:00:09,000",
      source: "也可以说读当前行，听清这一行的内容。",
      draft: "也可以说读当前行，听清这一行的内容。",
      group: "第 1 段",
      owner: "你",
      status: "待写"
    },
    {
      id: "row-4",
      no: 4,
      start: "00:00:10,000",
      end: "00:00:12,800",
      source: "点进改写这一格后，直接说话就会写进去。",
      draft: "点进改写这一格后，直接说话就会写进去。",
      group: "第 2 段",
      owner: "小周",
      status: "待写"
    },
    {
      id: "row-5",
      no: 5,
      start: "00:00:13,000",
      end: "00:00:16,000",
      source: "如果不想继续写，就说停止写字。",
      draft: "如果不想继续写，就说停止写字。",
      group: "第 2 段",
      owner: "你",
      status: "待写"
    },
    {
      id: "row-6",
      no: 6,
      start: "00:00:16,500",
      end: "00:00:19,800",
      source: "最后可以读整页，再导出文字。",
      draft: "最后可以读整页，再导出文字。",
      group: "第 3 段",
      owner: "小林",
      status: "并审中"
    }
  ];
}

function normalizeRows(rows) {
  return rows.map((row, index) => ({
    id: row.id || `row-${index + 1}`,
    no: index + 1,
    start: row.start || "00:00:00,000",
    end: row.end || "00:00:02,000",
    source: row.source || "",
    draft: row.draft || row.source || "",
    group: row.group || `第 ${Math.floor(index / 3) + 1} 段`,
    owner: row.owner || "你",
    status: row.status || "待写"
  }));
}

function currentRowIndex() {
  return state.rows.findIndex((row) => row.id === state.selectedRowId);
}

function currentRow() {
  return state.rows[currentRowIndex()] || state.rows[0] || null;
}

function buildGroups() {
  const order = [];
  const map = new Map();

  state.rows.forEach((row) => {
    const name = row.group || "未分段";
    if (!map.has(name)) {
      map.set(name, []);
      order.push(name);
    }
    map.get(name).push(row);
  });

  return order.map((name) => ({
    name,
    rows: map.get(name)
  }));
}

function groupTextFromRows(group) {
  return group.rows.map((row) => row.draft || row.source).join("\n");
}

function ensureGroupDrafts(resetAll = false) {
  const nextDrafts = {};
  const nextTouched = {};
  const groups = buildGroups();

  groups.forEach((group) => {
    if (
      !resetAll &&
      state.groupTouched[group.name] &&
      Object.prototype.hasOwnProperty.call(state.groupDrafts, group.name)
    ) {
      nextDrafts[group.name] = state.groupDrafts[group.name];
      nextTouched[group.name] = true;
      return;
    }

    nextDrafts[group.name] = groupTextFromRows(group);
    nextTouched[group.name] = false;
  });

  state.groupDrafts = nextDrafts;
  state.groupTouched = nextTouched;

  if (!groups.length) {
    state.selectedGroup = "";
    return;
  }

  const hasSelected = groups.some((group) => group.name === state.selectedGroup);
  if (!hasSelected) {
    state.selectedGroup = groups[0].name;
  }
}

function selectedGroupData() {
  return buildGroups().find((group) => group.name === state.selectedGroup) || buildGroups()[0] || null;
}

function groupMetaText(group) {
  if (!group) {
    return "打开文字后，这里会显示当前这一段。";
  }

  return `${group.rows.length} 行，时间沿用原稿，不用一条条卡。`;
}

function groupDraftValue(groupName, fallback = "") {
  if (Object.prototype.hasOwnProperty.call(state.groupDrafts, groupName)) {
    return state.groupDrafts[groupName];
  }

  return fallback;
}

function splitOnePiece(text) {
  const clean = String(text || "").trim();
  if (!clean) {
    return [];
  }

  const byComma = clean.match(/[^，,、；;：:]+[，,、；;：:]?/g) || [];

  if (byComma.length > 1) {
    return byComma.map((item) => item.trim()).filter(Boolean);
  }

  const middle = Math.ceil(clean.length / 2);
  return [clean.slice(0, middle).trim(), clean.slice(middle).trim()].filter(Boolean);
}

function splitByLength(text, count) {
  const clean = String(text || "").trim();
  if (!clean) {
    return Array.from({ length: count }, () => "");
  }

  if (count <= 1) {
    return [clean];
  }

  const chars = Array.from(clean);
  const base = Math.floor(chars.length / count);
  const extra = chars.length % count;
  const parts = [];
  let cursor = 0;

  for (let index = 0; index < count; index += 1) {
    const size = base + (index < extra ? 1 : 0);
    parts.push(chars.slice(cursor, cursor + size).join("").trim());
    cursor += size;
  }

  return parts;
}

function collectPieces(text) {
  const clean = String(text || "").replace(/\r/g, "").trim();
  if (!clean) {
    return [];
  }

  const lineParts = clean
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (lineParts.length > 1) {
    return lineParts;
  }

  const sentenceParts = clean.match(/[^。！？!?]+[。！？!?]?/g) || [];

  if (sentenceParts.length > 1) {
    return sentenceParts.map((item) => item.trim()).filter(Boolean);
  }

  const commaParts = clean.match(/[^，,、；;：:]+[，,、；;：:]?/g) || [];

  if (commaParts.length > 1) {
    return commaParts.map((item) => item.trim()).filter(Boolean);
  }

  return [clean];
}

function spreadPiecesToCount(parts, count) {
  const queue = parts.slice();

  while (queue.length < count) {
    let longestIndex = 0;

    queue.forEach((item, index) => {
      if (String(item || "").length > String(queue[longestIndex] || "").length) {
        longestIndex = index;
      }
    });

    const broken = splitOnePiece(queue[longestIndex]);
    if (broken.length < 2) {
      break;
    }

    queue.splice(longestIndex, 1, ...broken);
  }

  if (queue.length < count) {
    return splitByLength(queue.join(""), count);
  }

  if (queue.length === count) {
    return queue.map((item) => String(item || "").trim());
  }

  const result = [];
  let cursor = 0;
  const totalLength = queue.reduce((sum, item) => sum + String(item || "").length, 0);
  let remainingLength = totalLength;

  for (let index = 0; index < count; index += 1) {
    const remainingCount = count - index;

    if (remainingCount === 1) {
      result.push(queue.slice(cursor).join("").trim());
      break;
    }

    const target = remainingLength / remainingCount;
    let text = "";
    let usedLength = 0;

    while (cursor < queue.length - (remainingCount - 1)) {
      const next = String(queue[cursor] || "");
      const nextLength = next.length;

      if (text && usedLength + nextLength > target * 1.15) {
        break;
      }

      text += next;
      usedLength += nextLength;
      cursor += 1;

      if (usedLength >= target * 0.75) {
        break;
      }
    }

    if (!text && cursor < queue.length) {
      text = String(queue[cursor] || "");
      usedLength = text.length;
      cursor += 1;
    }

    result.push(text.trim());
    remainingLength -= usedLength;
  }

  while (result.length < count) {
    result.push("");
  }

  return result;
}

function splitDraftForRows(text, count) {
  if (count <= 1) {
    return [String(text || "").trim()];
  }

  const clean = String(text || "").replace(/\r/g, "").trim();
  if (!clean) {
    return Array.from({ length: count }, () => "");
  }

  const parts = collectPieces(clean);
  return spreadPiecesToCount(parts, count);
}

function applyDraftToGroupRows(groupName, text) {
  const groups = buildGroups();
  const group = groups.find((item) => item.name === groupName);
  if (!group) {
    return;
  }

  const parts = splitDraftForRows(text, group.rows.length);

  group.rows.forEach((row, index) => {
    row.draft = String(parts[index] || "").trim();
    row.status = row.draft ? "已写" : "待写";
  });

  state.groupDrafts[group.name] = text;
  state.groupTouched[group.name] = true;
}

function updateVoice(message, actionText = "", shouldSpeak = true) {
  const speechMessage = speechFriendlyText(message);
  state.voiceReply = message;
  state.lastAction = actionText || message;
  dom.liveText.textContent = speechMessage;
  dom.statusText.textContent = message;
  dom.voiceReplyText.textContent = message;
  dom.lastActionText.textContent = state.lastAction;
  setSpeechLabel(dom.liveText, speechMessage);
  setSpeechLabel(dom.statusText, message);
  setSpeechLabel(dom.voiceReplyText, message);
  setSpeechLabel(dom.lastActionText, state.lastAction);

  if (!shouldSpeak || !state.plugins.speech || !("speechSynthesis" in window)) {
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(speechMessage);
  utterance.lang = "zh-CN";
  utterance.rate = 1;
  utterance.pitch = 1;
  window.speechSynthesis.speak(utterance);
}

function updateReadHint() {
  if (!state.plugins.speech) {
    dom.readHint.textContent = "读屏已关闭。";
    return;
  }

  dom.readHint.textContent = `整页点到哪里都会读哪里，右边可以整段一起写，左边会自己分回去。${voiceHintLine()}`;
}

function focusLabel() {
  const row = currentRow();
  if (!row) {
    return "还没有内容";
  }

  return `第 ${row.no} 行 / ${row.group}`;
}

function setSelectedRowState(rowId) {
  const row = state.rows.find((item) => item.id === rowId);
  if (!row) {
    return null;
  }

  state.selectedRowId = row.id;
  state.selectedGroup = row.group;
  if (state.voiceEditTarget && state.voiceEditTarget.mode === "group") {
    state.voiceEditTarget.groupName = row.group;
  }
  return row;
}

function syncSelectedRowHighlight() {
  dom.rowTableBody.querySelectorAll("tr[data-row-id]").forEach((row) => {
    row.classList.toggle("selected", row.dataset.rowId === state.selectedRowId);
  });
}

function rememberVoiceEditTarget(rowId, field, element) {
  if (!rowId || !field || field === "status") {
    return;
  }

  state.voiceEditTarget = {
    mode: "row",
    rowId,
    field
  };

  if (element && typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
    state.voiceEditStart = element.selectionStart;
    state.voiceEditEnd = element.selectionEnd;
    return;
  }

  const row = state.rows.find((item) => item.id === rowId);
  const text = row ? String(row[field] || "") : "";
  state.voiceEditStart = text.length;
  state.voiceEditEnd = text.length;
}

function rememberGroupVoiceEditTarget(element) {
  if (!state.selectedGroup) {
    return;
  }

  state.voiceEditTarget = {
    mode: "group",
    groupName: state.selectedGroup
  };

  const currentText = String(groupDraftValue(state.selectedGroup, ""));

  if (element && typeof element.selectionStart === "number" && typeof element.selectionEnd === "number") {
    state.voiceEditStart = element.selectionStart;
    state.voiceEditEnd = element.selectionEnd;
    return;
  }

  state.voiceEditStart = currentText.length;
  state.voiceEditEnd = currentText.length;
}

function rowFieldLabel(field) {
  const labels = {
    start: "开始时间",
    end: "结束时间",
    source: "原文",
    draft: "改写",
    group: "分段",
    owner: "负责人",
    status: "状态"
  };

  return labels[field] || "内容";
}

function readTextOut(label, value) {
  const clean = String(value || "").trim();
  updateVoice(clean ? `${label}。${clean}` : `${label}现在还是空的。`, `读${label}`);
}

function speakElementText(element) {
  if (!state.plugins.speech || !element) {
    return;
  }

  if (element.closest("button[data-action]")) {
    return;
  }

  if (element.closest("tr[data-row-id]") && element.dataset && element.dataset.field) {
    return;
  }

  const areaLabel = element.dataset.readLabel || "";
  const rawText = (element.dataset.readValue || element.textContent || "").replace(/\s+/g, " ").trim();

  if (!rawText) {
    return;
  }

  readTextOut(areaLabel || "这里", rawText);
}

function justReadThisElement(element) {
  return state.lastReadElement === element && Date.now() - state.lastReadAt < 500;
}

function markReadElement(element) {
  state.lastReadElement = element;
  state.lastReadAt = Date.now();
}

function findReadableTarget(node) {
  if (!node || !node.closest) {
    return null;
  }

  return node.closest(
    "[data-read-label], .workflow-card, .hero-copy, .status-card, .toolbar-head, .panel-head, .voice-box, th"
  );
}

function readableAreas() {
  return [
    { names: ["页面介绍", "首页", "介绍", "总说明"], element: dom.pageIntro },
    { names: ["当前文件", "文件"], element: dom.fileCard },
    { names: ["当前定位", "定位"], element: dom.focusCard },
    { names: ["提醒"], element: dom.noticeCard },
    { names: ["怎么听页面", "先听", "第一步", "第1步"], element: dom.stepOneCard },
    { names: ["怎么找内容", "怎么找行", "再找", "第二步", "第2步"], element: dom.stepTwoCard },
    { names: ["怎么改字", "再说", "第三步", "第3步"], element: dom.stepThreeCard },
    { names: ["怎么导出", "最后", "第四步", "第4步"], element: dom.stepFourCard },
    { names: ["主操作", "常用按钮"], element: dom.mainActionHelp },
    { names: ["当前读回"], element: dom.voiceReplyBox },
    { names: ["最近动作"], element: dom.lastActionBox },
    { names: ["当前方式"], element: dom.voiceModeBox },
    { names: ["我刚听到"], element: dom.heardBox },
    { names: ["你可以说", "可以说"], element: dom.canSayBox },
    { names: ["逐行改字", "表格", "写字区", "字幕表格"], element: dom.tableHelp },
    { names: ["按段排稿", "当前段", "整段写", "右边这一段"], element: dom.segmentHelp },
    { names: ["导出文字", "导出区", "预览区", "字幕预览"], element: dom.exportHelp },
    { names: ["整页文字", "整页", "整稿", "全文", "通读区"], element: dom.mergeHelp }
  ].filter((item) => item.element);
}

function readAreaElement(element) {
  if (!element) {
    return false;
  }

  markReadElement(element);
  speakElementText(element);
  return true;
}

function readAreaByStep(step) {
  const areas = readableAreas();
  if (!areas.length) {
    return;
  }

  const nextIndex =
    state.readCursor < 0
      ? 0
      : (state.readCursor + step + areas.length) % areas.length;

  state.readCursor = nextIndex;
  readAreaElement(areas[nextIndex].element);
}

function readNamedArea(text) {
  const areas = readableAreas();
  const areaIndex = areas.findIndex((item) => item.names.some((name) => text.includes(name)));
  if (areaIndex < 0) {
    return false;
  }

  state.readCursor = areaIndex;
  readAreaElement(areas[areaIndex].element);
  return true;
}

function readRowField(row, field, value) {
  const label = rowFieldLabel(field);
  const clean = String(value || "").trim();
  updateVoice(
    clean ? `第 ${row.no} 行，${label}。${clean}` : `第 ${row.no} 行，${label}现在还是空的。`,
    `读第 ${row.no} 行${label}`
  );
}

function moveRow(step) {
  const index = currentRowIndex();
  if (index < 0 || !state.rows.length) {
    updateVoice("现在还没有可以移动的内容。", "不能移动");
    return;
  }

  const nextIndex = Math.min(Math.max(index + step, 0), state.rows.length - 1);
  selectRow(state.rows[nextIndex].id, true);
}

function moveGroup(step) {
  const groups = buildGroups();
  if (!groups.length) {
    updateVoice("现在还没有可以切换的段。", "不能换段");
    return;
  }

  const currentIndex = groups.findIndex((group) => group.name === state.selectedGroup);
  const safeIndex = currentIndex < 0 ? 0 : currentIndex;
  const nextIndex = Math.min(Math.max(safeIndex + step, 0), groups.length - 1);
  const nextGroup = groups[nextIndex];

  state.selectedGroup = nextGroup.name;
  state.selectedRowId = nextGroup.rows[0] ? nextGroup.rows[0].id : state.selectedRowId;
  if (state.voiceEditTarget && state.voiceEditTarget.mode === "group") {
    state.voiceEditTarget.groupName = nextGroup.name;
    const text = String(groupDraftValue(nextGroup.name, ""));
    state.voiceEditStart = text.length;
    state.voiceEditEnd = text.length;
  }
  render();

  updateVoice(
    `现在在${nextGroup.name}。这里有 ${nextGroup.rows.length} 行。你可以直接在右边整段写，不用一条条卡时间。`,
    `切到${nextGroup.name}`
  );
}

function readCurrentGroup() {
  const group = selectedGroupData();
  if (!group) {
    updateVoice("现在还没有可以读的段。", "没有可读段");
    return;
  }

  const text = String(groupDraftValue(group.name, groupTextFromRows(group))).trim();
  updateVoice(
    text ? `${group.name}。一共 ${group.rows.length} 行。整段内容是：${text}` : `${group.name}现在还是空的。`,
    `读${group.name}`
  );
}

function startVoiceEditForCurrent(field) {
  const row = currentRow();
  if (!row) {
    updateVoice("先选一行，再开始改字。", "还没选行");
    return;
  }

  const text = String(row[field] || "");
  state.voiceEditTarget = {
    mode: "row",
    rowId: row.id,
    field
  };
  state.voiceEditStart = text.length;
  state.voiceEditEnd = text.length;
  updateVoice(`现在会把你说的话写进第 ${row.no} 行的${rowFieldLabel(field)}。说完就会直接写进去。`, `准备写第 ${row.no} 行${rowFieldLabel(field)}`);
}

function startVoiceEditForCurrentGroup(shouldSpeak = true) {
  const group = selectedGroupData();
  if (!group) {
    updateVoice("先打开内容，再开始整段写。", "还没有段");
    return;
  }

  const text = String(groupDraftValue(group.name, ""));
  state.voiceEditTarget = {
    mode: "group",
    groupName: group.name
  };
  state.voiceEditStart = text.length;
  state.voiceEditEnd = text.length;
  if (dom.groupWriter) {
    dom.groupWriter.focus();
    if (typeof dom.groupWriter.setSelectionRange === "function") {
      dom.groupWriter.setSelectionRange(text.length, text.length);
    }
  }
  updateVoice(
    `现在会把你说的话写进${group.name}。这段写完以后，左边会自己分回每一行。`,
    `准备写${group.name}`,
    shouldSpeak
  );
}

function stopVoiceEdit() {
  state.voiceEditTarget = null;
  state.voiceEditStart = 0;
  state.voiceEditEnd = 0;
  updateVoice("已经停下写字。", "停止写字");
}

function syncCurrentGroup() {
  const group = selectedGroupData();
  if (!group) {
    updateVoice("现在还没有可以分回去的段。", "没有可分回段");
    return;
  }

  const text = groupDraftValue(group.name, groupTextFromRows(group));
  applyDraftToGroupRows(group.name, text);
  renderTop();
  renderTable();
  renderPreview();
  renderGroupPanel(true);
  syncSelectedRowHighlight();
  updateVoice(`${group.name}已经重新分回左边了。你不用自己一条条卡时间。`, `重新分回${group.name}`);
}

function readHelp() {
  updateVoice(
    "你可以说：读帮助，读页面介绍，上一段，下一段，读当前段，上一行，下一行，读当前行，读整页，开始写这一段，开始写改写，停止写字，导出文字。",
    "读使用说明"
  );
}

function readMerged() {
  renderPreview();
  readTextOut("整页文字", dom.mergePreview.value);
}

function readExportPreview() {
  renderPreview();
  readTextOut("导出文字", dom.exportPreview.value);
}

function writeVoiceTextToCurrentField(text) {
  const target = state.voiceEditTarget;
  if (!target) {
    return false;
  }

  if (target.mode === "group") {
    const group = buildGroups().find((item) => item.name === target.groupName);
    if (!group) {
      return false;
    }

    const currentText = String(groupDraftValue(target.groupName, ""));
    const start = Math.max(0, Math.min(state.voiceEditStart, currentText.length));
    const end = Math.max(start, Math.min(state.voiceEditEnd, currentText.length));
    const nextText = `${currentText.slice(0, start)}${text}${currentText.slice(end)}`;
    const nextCursor = start + text.length;

    state.groupDrafts[target.groupName] = nextText;
    state.groupTouched[target.groupName] = true;
    applyDraftToGroupRows(target.groupName, nextText);
    state.voiceEditStart = nextCursor;
    state.voiceEditEnd = nextCursor;

    renderTop();
    renderTable();
    renderPreview();
    renderGroupPanel(true);
    syncSelectedRowHighlight();
    dom.groupWriter.value = nextText;
    dom.groupWriter.focus();
    if (typeof dom.groupWriter.setSelectionRange === "function") {
      dom.groupWriter.setSelectionRange(nextCursor, nextCursor);
    }

    updateVoice(
      `已经把你刚才说的话写进${group.name}。左边也已经一起更新了。`,
      `写入${group.name}`,
      !state.keepListening
    );
    return true;
  }

  const row = state.rows.find((item) => item.id === target.rowId);
  if (!row) {
    return false;
  }

  const currentText = String(row[target.field] || "");
  const start = Math.max(0, Math.min(state.voiceEditStart, currentText.length));
  const end = Math.max(start, Math.min(state.voiceEditEnd, currentText.length));
  const nextText = `${currentText.slice(0, start)}${text}${currentText.slice(end)}`;
  const nextCursor = start + text.length;

  setRowField(target.rowId, target.field, nextText);
  state.voiceEditStart = nextCursor;
  state.voiceEditEnd = nextCursor;
  updateVoice(
    `已经把你刚才说的话写进第 ${row.no} 行的${rowFieldLabel(target.field)}。`,
    `写入第 ${row.no} 行${rowFieldLabel(target.field)}`,
    !state.keepListening
  );
  return true;
}

function renderTable() {
  dom.rowTableBody.innerHTML = state.rows
    .map((row) => {
      const selectedClass = row.id === state.selectedRowId ? "selected" : "";

      return `
        <tr class="${selectedClass}" data-row-id="${escapeHtml(row.id)}">
          <td>${row.no}</td>
          <td><input class="cell-input" data-field="start" value="${escapeHtml(row.start)}" /></td>
          <td><input class="cell-input" data-field="end" value="${escapeHtml(row.end)}" /></td>
          <td><textarea class="cell-area" data-field="source">${escapeHtml(row.source)}</textarea></td>
          <td><textarea class="cell-area" data-field="draft">${escapeHtml(row.draft)}</textarea></td>
          <td><input class="cell-input" data-field="group" value="${escapeHtml(row.group)}" /></td>
          <td><input class="cell-input" data-field="owner" value="${escapeHtml(row.owner)}" /></td>
          <td>
            <select class="cell-select" data-field="status">
              <option value="待写" ${row.status === "待写" ? "selected" : ""}>待写</option>
              <option value="已写" ${row.status === "已写" ? "selected" : ""}>已写</option>
              <option value="并审中" ${row.status === "并审中" ? "selected" : ""}>并审中</option>
              <option value="已定稿" ${row.status === "已定稿" ? "selected" : ""}>已定稿</option>
            </select>
          </td>
        </tr>
      `;
    })
    .join("");
}

function buildMergedText() {
  return buildGroups()
    .map((group) => {
      const body = groupDraftValue(group.name, groupTextFromRows(group));
      return `${group.name}\n${body}`;
    })
    .join("\n\n");
}

function buildSrtText() {
  return state.rows
    .map((row, index) => `${index + 1}\n${row.start} --> ${row.end}\n${row.draft || row.source}`)
    .join("\n\n");
}

function csvCell(text) {
  const clean = String(text).replaceAll('"', '""');
  return `"${clean}"`;
}

function buildSheetText() {
  const head = ["行", "开始", "结束", "原文", "改写", "分段", "负责人", "状态"];
  const lines = [head.map(csvCell).join(",")];

  state.rows.forEach((row) => {
    lines.push(
      [
        row.no,
        row.start,
        row.end,
        row.source,
        row.draft,
        row.group,
        row.owner,
        row.status
      ]
        .map(csvCell)
        .join(",")
    );
  });

  return lines.join("\n");
}

function renderPreview() {
  state.mergedText = buildMergedText();
  dom.mergePreview.value = state.mergedText;
  dom.exportPreview.value = buildSrtText();
}

function renderGroupPanel(keepWriter = false) {
  if (!dom.groupWriter || !dom.groupTitleText || !dom.groupMetaText) {
    return;
  }

  const group = selectedGroupData();
  if (!group) {
    dom.groupTitleText.textContent = "还没有段落";
    dom.groupMetaText.textContent = "打开文字后，这里会显示当前这一段。";
    dom.groupWriter.value = "";
    dom.groupWriter.disabled = true;
    return;
  }

  dom.groupWriter.disabled = false;
  dom.groupTitleText.textContent = group.name;
  dom.groupMetaText.textContent = groupMetaText(group);
  setSpeechLabel(dom.groupTitleText, group.name);
  setSpeechLabel(dom.groupMetaText, dom.groupMetaText.textContent);

  if (!keepWriter) {
    dom.groupWriter.value = groupDraftValue(group.name, groupTextFromRows(group));
  }
}

function renderTop() {
  dom.fileNameText.textContent = state.fileName;
  dom.focusText.textContent = focusLabel();
  dom.voiceReplyText.textContent = state.voiceReply;
  dom.lastActionText.textContent = state.lastAction;
  dom.heardText.textContent = state.heardText;
  dom.listenButtonText.textContent = state.keepListening ? "停止语音转文字" : "开始语音转文字";
  dom.listenToggle.classList.toggle("is-listening", state.keepListening);
  dom.listenToggle.setAttribute("aria-pressed", state.keepListening ? "true" : "false");
  setSpeechLabel(dom.focusText, dom.focusText.textContent);
  setSpeechLabel(dom.voiceReplyText, state.voiceReply);
  setSpeechLabel(dom.lastActionText, state.lastAction);
  setSpeechLabel(dom.heardText, state.heardText);
  updateReadHint();
}

function render() {
  ensureGroupDrafts(false);
  renderTop();
  renderTable();
  renderPreview();
  renderGroupPanel();
}

function renderAside() {
  ensureGroupDrafts(false);
  renderTop();
  renderPreview();
  renderGroupPanel();
}

function selectRow(rowId, shouldRead = true) {
  const row = setSelectedRowState(rowId);
  if (!row) {
    return;
  }

  render();

  if (shouldRead && state.plugins.rowRead) {
    updateVoice(
      `现在在第 ${row.no} 行，属于${row.group}。改写内容是：${row.draft || row.source}。时间会沿用原稿。`,
      `定位到第 ${row.no} 行`
    );
  }
}

function setRowField(rowId, field, value, renderMode = "full") {
  const row = state.rows.find((item) => item.id === rowId);
  if (!row) {
    return;
  }

  row[field] = value;

  if (field === "draft" && value.trim() && row.status === "待写") {
    row.status = "已写";
  }

  if (field === "group" && !value.trim()) {
    row.group = "未分段";
  }

  if (field === "source" && !row.draft.trim()) {
    row.draft = value;
  }

  if (state.selectedRowId === rowId) {
    state.selectedGroup = row.group;
  }

  ensureGroupDrafts(true);

  if (renderMode === "soft") {
    renderAside();
    return;
  }

  render();
}

function loadSample() {
  state.fileName = "示例内容.srt";
  state.rows = normalizeRows(sampleRows());
  state.selectedRowId = state.rows[1].id;
  state.selectedGroup = state.rows[1].group;
  state.groupDrafts = {};
  state.groupTouched = {};
  ensureGroupDrafts(true);
  render();
  updateVoice(
    `示例内容已经载入。现在在第 2 行。右边可以整段写，左边会自己分回去。${voiceHintLine()} 你可以直接说：读帮助、下一段、读当前段、读当前行、读整页、开始写这一段。`,
    "载入示例内容"
  );
}

function downloadText(fileName, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

function exportSrt() {
  const text = buildSrtText();
  dom.exportPreview.value = text;
  downloadText(state.fileName.replace(/\.[^.]+$/, "") + "-新稿.srt", text, "text/plain;charset=utf-8");
  updateVoice("整理好的文字已经导出，下面的导出区也同步更新了。", "导出文字");
}

function exportSheet() {
  const text = buildSheetText();
  downloadText(state.fileName.replace(/\.[^.]+$/, "") + "-表格.csv", text, "text/csv;charset=utf-8");
  updateVoice("表格内容已经导出，可以直接打开继续看。", "导出表格");
}

function readCurrentRow() {
  const row = currentRow();
  if (!row) {
    return;
  }

  updateVoice(
    `第 ${row.no} 行，属于${row.group}。原文是：${row.source}。改写是：${row.draft || "还没有写"}。时间沿用原稿。`,
    `读第 ${row.no} 行`
  );
}

function mergeAll() {
  renderPreview();
  updateVoice("已经把全部内容整理到一起了。现在可以读整页，听听顺不顺。", "整理整页");
}

function handleVoiceCommand(rawText) {
  const heard = rawText.trim();
  const text = heard.replace(/\s+/g, "");

  state.heardText = heard || "没有听清。";
  renderTop();

  if (!text) {
    updateVoice("没有听清，你可以再说一次。", "没有听清");
    return;
  }

  if (state.voiceEditTarget) {
    if (/^(停止写字|停止改字|结束写字|结束改字|停止说话|结束说话|停止听写)$/.test(text)) {
      stopVoiceEdit();
      stopListening();
      updateVoice("已经停止语音转文字。", "停止语音转文字");
      return;
    }

    writeVoiceTextToCurrentField(heard);
    return;
  }

  if (/读下一块|下一块|下一个地方/.test(text)) {
    readAreaByStep(1);
    return;
  }

  if (/读上一块|上一块|上一个地方/.test(text)) {
    readAreaByStep(-1);
    return;
  }

  if (/读当前这块|读当前区域|读这一块/.test(text)) {
    readAreaByStep(0);
    return;
  }

  if (/读整稿|读通读区|读整页|读全文/.test(text)) {
    readMerged();
    return;
  }

  if (/读导出区|读导出文稿|读预览区|读字幕预览|读导出文字/.test(text)) {
    readExportPreview();
    return;
  }

  if (
    /页面介绍|首页|总说明|当前文件|当前定位|提醒|怎么听页面|先听|第一步|第1步|怎么找内容|怎么找行|再找|第二步|第2步|怎么改字|再说|第三步|第3步|怎么导出|最后|第四步|第4步|主操作|常用按钮|当前读回|最近动作|当前方式|我刚听到|你可以说|逐行改字|表格|写字区|按段排稿|当前段|整段写|右边这一段|导出文字|导出区|预览区|整页文字|整页|全文|通读区/.test(text) &&
    /读|看看|念/.test(text)
  ) {
    if (readNamedArea(text)) {
      return;
    }
  }

  if (/读帮助|读说明|你可以说什么|怎么用/.test(text)) {
    readHelp();
    return;
  }

  if (/下一段|下段/.test(text)) {
    moveGroup(1);
    return;
  }

  if (/上一段|上段/.test(text)) {
    moveGroup(-1);
    return;
  }

  if (/读当前段|读这一段/.test(text)) {
    readCurrentGroup();
    return;
  }

  if (/停止写字|停止改字|结束写字|结束改字/.test(text)) {
    stopVoiceEdit();
    return;
  }

  if (/下一行|下行/.test(text)) {
    moveRow(1);
    return;
  }

  if (/上一行|上行/.test(text)) {
    moveRow(-1);
    return;
  }

  if (/开始写这一段|开始写当前段|开始写整段|整段写/.test(text)) {
    startVoiceEditForCurrentGroup();
    return;
  }

  if (/开始写改写|写改写|改写框/.test(text)) {
    startVoiceEditForCurrent("draft");
    return;
  }

  if (/开始写原文|写原文|原文框/.test(text)) {
    startVoiceEditForCurrent("source");
    return;
  }

  if (/开始写分段|写分段/.test(text)) {
    startVoiceEditForCurrent("group");
    return;
  }

  if (/开始写负责人|写负责人/.test(text)) {
    startVoiceEditForCurrent("owner");
    return;
  }

  if (/开始写开始时间|写开始时间/.test(text)) {
    startVoiceEditForCurrent("start");
    return;
  }

  if (/开始写结束时间|写结束时间/.test(text)) {
    startVoiceEditForCurrent("end");
    return;
  }

  if (/重新分回|分回左边|重新排这一段/.test(text)) {
    syncCurrentGroup();
    return;
  }

  if (state.voiceEditTarget && writeVoiceTextToCurrentField(heard)) {
    return;
  }

  if (/载入示例|打开示例/.test(text)) {
    loadSample();
  } else if (/读当前行|读这一行/.test(text)) {
    readCurrentRow();
  } else if (/点打开文件|点导入字幕|打开字幕文件|打开文字文件/.test(text)) {
    runAction("open-file");
  } else if (/点载入示例/.test(text)) {
    runAction("load-sample");
  } else if (/点读帮助|点使用说明/.test(text)) {
    runAction("read-help");
  } else if (/点读当前段/.test(text)) {
    runAction("read-current-group");
  } else if (/点上一段/.test(text)) {
    runAction("prev-group");
  } else if (/点下一段/.test(text)) {
    runAction("next-group");
  } else if (/点重新分回|点重新排这一段/.test(text)) {
    runAction("sync-current-group");
  } else if (/点通读检查|开始通读检查/.test(text)) {
    runAction("merge-all");
  } else if (/点读整页|点读整稿/.test(text)) {
    runAction("read-merge");
  } else if (/点导出文稿|导出当前文稿|点导出文字|导出文字/.test(text)) {
    runAction("export-srt");
  } else if (/点导出表格|开始导出表格/.test(text)) {
    runAction("export-sheet");
  } else if (/点读当前行/.test(text)) {
    runAction("read-current-row");
  } else if (/合并审阅|重新合并|合并/.test(text)) {
    mergeAll();
  } else if (/导回字幕|导出字幕/.test(text)) {
    exportSrt();
  } else if (/导出表格/.test(text)) {
    exportSheet();
  } else {
    updateVoice("这句我还没学会。你可以说：读帮助、下一行、读当前行、读整页、读下一块、开始写改写、导出文字。", "暂时没听懂");
  }
}

function startRecognitionCycle() {
  if (!recognition || !state.keepListening || state.listening || state.recognitionStarting) {
    return;
  }

  try {
    state.recognitionStarting = true;
    recognition.start();
  } catch (error) {
    state.recognitionStarting = false;
    state.keepListening = false;
    state.listening = false;
    renderTop();
    updateVoice(listenFailText(error), "收听失败");
  }
}

async function callNativeVoice(path, method = "GET") {
  const response = await fetch(`${nativeVoiceURL}${path}`, {
    method,
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error("local-voice-unavailable");
  }

  return response.json();
}

async function checkNativeVoiceStatus() {
  if (!dom.nativeVoiceStatusText) {
    return;
  }

  try {
    const result = await callNativeVoice("/state");
    dom.nativeVoiceStatusText.textContent =
      result.status === "error"
        ? String(result.message || "电脑听写没有打开。")
        : "电脑听写已连接，可以开始说话。";
  } catch (error) {
    dom.nativeVoiceStatusText.textContent = "电脑听写未连接，请重新双击“打开应用”。";
  }
}

function stopNativePolling() {
  window.clearTimeout(state.nativePollTimer);
  state.nativePollTimer = null;
}

async function pollNativeVoice() {
  if (!state.nativeListening || !state.keepListening) {
    return;
  }

  try {
    const result = await callNativeVoice("/state");
    const changingText = String(result.changingText || "").trim();
    const finalText = String(result.finalText || "").trim();
    const finalID = Number(result.finalID || 0);

    if (changingText) {
      state.heardText = changingText;
      renderTop();
    }

    if (finalText && finalID > state.nativeFinalID) {
      state.nativeFinalID = finalID;
      handleVoiceCommand(finalText);
    }

    if (result.status === "error") {
      state.nativeListening = false;
      state.keepListening = false;
      renderTop();
      updateVoice(String(result.message || "本机听写没有成功打开。"), "听写没有打开");
      return;
    }
  } catch (error) {
    state.nativeListening = false;
    state.keepListening = false;
    renderTop();
    updateVoice("本机听写助手断开了。请重新双击“打开应用”。", "听写助手断开");
    return;
  }

  state.nativePollTimer = window.setTimeout(pollNativeVoice, 180);
}

async function tryStartNativeListening() {
  try {
    const result = await callNativeVoice("/start", "POST");
    state.nativeListening = true;
    state.nativeFinalID = Number(result.finalID || 0);
    state.keepListening = true;
    state.listening = true;
    state.heardText = "正在等你说话……";
    renderTop();
    updateVoice("正在使用电脑自己的听写。你说的话会写进右边当前这一段。", "开始语音转文字", false);
    pollNativeVoice();
    return true;
  } catch (error) {
    return false;
  }
}

async function startListening() {
  if ("speechSynthesis" in window) {
    window.speechSynthesis.cancel();
  }

  if (!state.voiceEditTarget) {
    startVoiceEditForCurrentGroup(false);
  }

  if (await tryStartNativeListening()) {
    return;
  }

  if (!canListenHere()) {
    updateVoice("本机听写助手没有启动。请双击文件夹里的“打开应用”。", "不能开始收听");
    return;
  }

  if (!recognition) {
    setupRecognition();
  }

  if (!recognition) {
    updateVoice(listenFailText("not-supported"), "不能开始收听");
    return;
  }

  try {
    await warmUpMic();
    state.keepListening = true;
    state.heardText = "正在等你说话……";
    renderTop();
    updateVoice("正在听。你说的话会变成文字，写进右边当前这一段。再按一次按钮就停止。", "开始语音转文字", false);
    startRecognitionCycle();
  } catch (error) {
    state.keepListening = false;
    state.listening = false;
    state.recognitionStarting = false;
    renderTop();
    updateVoice(listenFailText(error), "麦克风没打开");
  }
}

function stopListening() {
  state.keepListening = false;
  state.listening = false;
  state.recognitionStarting = false;
  stopNativePolling();
  renderTop();

  if (state.nativeListening) {
    state.nativeListening = false;
    callNativeVoice("/stop", "POST").catch(() => {});
  }

  if (recognition) {
    try {
      recognition.stop();
    } catch (error) {
      // It may already be between two listening rounds.
    }
  }
}

function toggleListening() {
  if (state.keepListening || state.listening || state.recognitionStarting) {
    stopListening();
    updateVoice("已停止语音转文字。", "停止语音转文字");
    return;
  }

  startListening();
}

function setupRecognition() {
  if (!SpeechRecognition) {
    return;
  }

  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    state.recognitionStarting = false;
    state.listening = true;
    renderTop();
  };

  recognition.onresult = (event) => {
    let finalText = "";
    let changingText = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const transcript = String(result[0] && result[0].transcript || "").trim();
      if (!transcript) {
        continue;
      }

      if (result.isFinal) {
        finalText += transcript;
      } else {
        changingText += transcript;
      }
    }

    state.heardText = changingText || finalText || "正在等你继续说……";
    renderTop();

    if (finalText) {
      handleVoiceCommand(finalText);
    }
  };

  recognition.onerror = (event) => {
    state.recognitionStarting = false;
    state.listening = false;
    renderTop();

    if (event.error === "aborted" || (event.error === "no-speech" && state.keepListening)) {
      return;
    }

    state.keepListening = false;
    renderTop();
    updateVoice(listenFailText(event), event.error === "no-speech" ? "没有听清" : "收听中断");
  };

  recognition.onend = () => {
    state.recognitionStarting = false;
    state.listening = false;
    renderTop();

    if (state.keepListening) {
      window.setTimeout(startRecognitionCycle, 180);
    }
  };
}

function parseSrt(text) {
  const blocks = text.replace(/\r/g, "").trim().split(/\n{2,}/);
  const rows = [];

  blocks.forEach((block, index) => {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
      return;
    }

    let timeLine = "";
    let textLines = [];

    if (lines[0].includes("-->")) {
      timeLine = lines[0];
      textLines = lines.slice(1);
    } else if (lines[1] && lines[1].includes("-->")) {
      timeLine = lines[1];
      textLines = lines.slice(2);
    } else {
      return;
    }

    const [start, end] = timeLine.split("-->").map((item) => item.trim());
    rows.push({
      id: `row-${index + 1}`,
      start,
      end,
      source: textLines.join(" "),
      draft: textLines.join(" "),
      group: `第 ${Math.floor(index / 3) + 1} 段`,
      owner: index % 2 === 0 ? "你" : "小林",
      status: "待写"
    });
  });

  return normalizeRows(rows);
}

function loadFromFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    const rows = parseSrt(text);

    if (!rows.length) {
      updateVoice("没有读到能用的文字内容，请换一个文件再试。", "打开失败");
      return;
    }

    state.fileName = file.name;
    state.rows = rows;
    state.selectedRowId = rows[0].id;
    state.selectedGroup = rows[0].group;
    state.groupDrafts = {};
    state.groupTouched = {};
    ensureGroupDrafts(true);
    render();
    updateVoice(`已打开 ${file.name}，一共 ${rows.length} 行。右边可以整段写，左边会自己分回去，不用一条条卡时间。`, `打开${file.name}`);
  };
  reader.readAsText(file, "utf-8");
}

function readButtonLabel(button) {
  if (!state.plugins.buttonRead) {
    return;
  }

  const label = button.dataset.readLabel || button.textContent.trim();
  if (button.dataset.action === "toggle-listen") {
    updateVoice(`${label}。再点一下就会执行。第一次可能会问你要不要开麦克风。`, `读按钮：${label}`);
    return;
  }
  updateVoice(`${label}。再点一下就会执行。`, `读按钮：${label}`);
}

function clearPendingButton() {
  window.clearTimeout(state.pendingButtonTimer);

  if (state.pendingButtonElement) {
    state.pendingButtonElement.classList.remove("waiting-action");
  }

  state.pendingButtonAction = "";
  state.pendingButtonTimer = null;
  state.pendingButtonElement = null;
  state.pendingButtonReady = false;
}

function setPendingButton(button, ready = false) {
  clearPendingButton();
  state.pendingButtonAction = button.dataset.action || "";
  state.pendingButtonElement = button;
  state.pendingButtonReady = ready;
  button.classList.add("waiting-action");
  state.pendingButtonTimer = window.setTimeout(() => {
    clearPendingButton();
  }, 2500);
}

function previewButtonRead(button) {
  if (!state.plugins.buttonRead || state.pendingButtonElement === button) {
    return;
  }

  setPendingButton(button, false);
  readButtonLabel(button);
}

function runAction(action) {
  const actions = {
    "open-file": () => dom.fileInput.click(),
    "load-sample": loadSample,
    "read-help": readHelp,
    "prev-group": () => moveGroup(-1),
    "next-group": () => moveGroup(1),
    "read-current-group": readCurrentGroup,
    "sync-current-group": syncCurrentGroup,
    "merge-all": mergeAll,
    "read-merge": readMerged,
    "export-srt": exportSrt,
    "export-sheet": exportSheet,
    "read-current-row": readCurrentRow,
    "toggle-listen": toggleListening
  };

  if (actions[action]) {
    actions[action]();
  }
}

function bindButtons() {
  document.addEventListener("touchstart", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    previewButtonRead(button);
  }, { passive: true });

  document.addEventListener("mouseenter", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    previewButtonRead(button);
  }, true);

  document.addEventListener("focusin", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    previewButtonRead(button);
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) {
      return;
    }

    const action = button.dataset.action;

    clearPendingButton();
    runAction(action);
  });
}

function bindTable() {
  dom.rowTableBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-row-id]");
    if (!row) {
      return;
    }

    const rowData = setSelectedRowState(row.dataset.rowId);
    if (!rowData) {
      return;
    }

    const field = event.target.dataset.field;
    if (field) {
      rememberVoiceEditTarget(rowData.id, field, event.target);
      renderTop();
      renderPreview();
      syncSelectedRowHighlight();

      if (state.plugins.rowRead) {
        readRowField(rowData, field, event.target.value);
      }
      return;
    }

    selectRow(row.dataset.rowId, true);
  });

  dom.rowTableBody.addEventListener("focusin", (event) => {
    const row = event.target.closest("tr[data-row-id]");
    if (!row) {
      return;
    }

    setSelectedRowState(row.dataset.rowId);
    if (event.target.dataset.field) {
      rememberVoiceEditTarget(row.dataset.rowId, event.target.dataset.field, event.target);
    }
    renderAside();
    syncSelectedRowHighlight();
  });

  dom.rowTableBody.addEventListener("input", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest("tr[data-row-id]");
    if (!field || !row) {
      return;
    }

    rememberVoiceEditTarget(row.dataset.rowId, field, event.target);
    setRowField(row.dataset.rowId, field, event.target.value, "soft");
  });

  dom.rowTableBody.addEventListener("change", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest("tr[data-row-id]");
    if (!field || !row) {
      return;
    }

    rememberVoiceEditTarget(row.dataset.rowId, field, event.target);
    setRowField(row.dataset.rowId, field, event.target.value);
  });

  dom.rowTableBody.addEventListener("keyup", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest("tr[data-row-id]");
    if (!field || !row) {
      return;
    }

    rememberVoiceEditTarget(row.dataset.rowId, field, event.target);
  });

  dom.rowTableBody.addEventListener("select", (event) => {
    const field = event.target.dataset.field;
    const row = event.target.closest("tr[data-row-id]");
    if (!field || !row) {
      return;
    }

    rememberVoiceEditTarget(row.dataset.rowId, field, event.target);
  });
}

function bindGroupWriter() {
  if (!dom.groupWriter) {
    return;
  }

  const rememberCurrent = (element) => {
    rememberGroupVoiceEditTarget(element || dom.groupWriter);
  };

  dom.groupWriter.addEventListener("focus", (event) => {
    rememberCurrent(event.target);
  });

  dom.groupWriter.addEventListener("click", (event) => {
    rememberCurrent(event.target);
  });

  dom.groupWriter.addEventListener("keyup", (event) => {
    rememberCurrent(event.target);
  });

  dom.groupWriter.addEventListener("select", (event) => {
    rememberCurrent(event.target);
  });

  dom.groupWriter.addEventListener("input", (event) => {
    const group = selectedGroupData();
    if (!group) {
      return;
    }

    const text = event.target.value;
    state.groupDrafts[group.name] = text;
    state.groupTouched[group.name] = true;
    rememberCurrent(event.target);
    applyDraftToGroupRows(group.name, text);
    renderTop();
    renderTable();
    renderPreview();
    renderGroupPanel(true);
    syncSelectedRowHighlight();
  });
}

function bindReadAreas() {
  const previewSpeak = (target) => {
    if (!target || justReadThisElement(target)) {
      return;
    }

    markReadElement(target);
    speakElementText(target);
  };

  dom.mergePreview.addEventListener("click", () => {
    if (!state.plugins.speech) {
      return;
    }

    readTextOut("整稿", dom.mergePreview.value);
  });

  dom.exportPreview.addEventListener("click", () => {
    if (!state.plugins.speech) {
      return;
    }

    readTextOut("字幕预览", dom.exportPreview.value);
  });

  document.addEventListener("touchstart", (event) => {
    const target = findReadableTarget(event.target);
    if (!target) {
      return;
    }

    previewSpeak(target);
  }, { passive: true });

  document.addEventListener("focusin", (event) => {
    const target = findReadableTarget(event.target);
    if (!target) {
      return;
    }

    previewSpeak(target);
  });

  document.addEventListener("click", (event) => {
    const target = findReadableTarget(event.target);
    if (!target) {
      return;
    }

    previewSpeak(target);
  });
}

function bindFileInput() {
  dom.fileInput.addEventListener("change", (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }

    loadFromFile(file);
    event.target.value = "";
  });
}

function setupReadableFocus() {
  document.querySelectorAll("[data-read-label]").forEach((element) => {
    setSpeechLabel(element, element.dataset.readLabel || element.textContent || "");

    if (element.matches("button, input, textarea, select, a")) {
      return;
    }

    element.tabIndex = 0;
  });
}

bindButtons();
bindTable();
bindGroupWriter();
bindReadAreas();
bindFileInput();
setupReadableFocus();
setupRecognition();
loadSample();
checkNativeVoiceStatus();
