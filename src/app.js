import {
  DEFAULT_STANDARD,
  EVENT_ORDER,
  EVENT_META,
  calculateStudent,
  cloneStandard,
  formatNumber,
  formatRate,
  summarizeStudents,
} from "./score-engine.js";

const STORAGE_KEYS = {
  records: "sports-score-records-v1",
  standard: "sports-score-standard-v1",
};

const statusLabels = {
  pending: "待测试",
  active: "正常",
  absent: "缺考",
  exempt: "免测",
  incomplete: "缺项",
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

let standard = loadStandard();
let records = loadRecords();
let editingId = null;

function loadStandard() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.standard);
    return saved ? { ...cloneStandard(DEFAULT_STANDARD), ...JSON.parse(saved) } : cloneStandard(DEFAULT_STANDARD);
  } catch {
    return cloneStandard(DEFAULT_STANDARD);
  }
}

function loadRecords() {
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.records);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveRecords() {
  localStorage.setItem(STORAGE_KEYS.records, JSON.stringify(records));
}

function saveStandard() {
  localStorage.setItem(STORAGE_KEYS.standard, JSON.stringify(standard));
}

function makeId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return `record-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showMessage(target, message, tone = "info") {
  const element = typeof target === "string" ? $(target) : target;
  if (!element) return;
  element.textContent = message;
  element.className = `message ${tone}`;
  window.clearTimeout(element._timer);
  element._timer = window.setTimeout(() => {
    element.textContent = "";
    element.className = "message";
  }, 5000);
}

function updateStandardBanner() {
  $("#standard-title").textContent = standard.title || "当前评分标准";
  $("#standard-note").textContent = standard.note || "请确认评分标准后再用于正式成绩。";
  $("#standard-json").value = JSON.stringify(standard, null, 2);
}

function displayEventLabel(eventId, gender) {
  const definition = standard.events?.[eventId] || {};
  if (gender === "female" && definition.femaleLabel) return definition.femaleLabel;
  if (gender === "male" && definition.maleLabel) return definition.maleLabel;
  return definition.label || EVENT_META[eventId].label;
}

function displayUnit(eventId) {
  return standard.events?.[eventId]?.unit || EVENT_META[eventId].unit;
}

function inputHint(eventId) {
  if (eventId === "bmi") return "可直接填 BMI；留空时不能计算。";
  if (eventId === "endurance") return "统一填秒，例如 4分20秒填 260。";
  if (eventId === "sprint50") return "例如 8.2。";
  return "请输入实测原始成绩。";
}

function renderScoreFields() {
  const gender = $("#gender").value;
  $("#score-fields").innerHTML = EVENT_ORDER.map((eventId) => {
    const label = displayEventLabel(eventId, gender);
    const meta = EVENT_META[eventId];
    const value = editingId ? (records.find((record) => record.id === editingId)?.scores?.[eventId] ?? "") : "";
    return `
      <label class="field score-field" for="score-${eventId}">
        <span>${label}<small>${displayUnit(eventId) || ""}</small></span>
        <input id="score-${eventId}" name="${eventId}" type="number" inputmode="${meta.inputMode}" step="${eventId === "sprint50" || eventId === "sitReach" || eventId === "bmi" ? "0.1" : "1"}" min="0" value="${value}" placeholder="原始成绩" />
        <em>${inputHint(eventId)}</em>
      </label>`;
  }).join("");
}

function collectForm() {
  const scores = {};
  EVENT_ORDER.forEach((eventId) => {
    scores[eventId] = $(`#score-${eventId}`)?.value ?? "";
  });
  return {
    id: editingId || makeId(),
    name: $("#student-name").value.trim(),
    className: $("#class-name").value.trim(),
    gradeLevel: $("#grade").value || "初三",
    gender: $("#gender").value,
    status: $("#status").value,
    bonus: $("#bonus").value,
    scores,
  };
}

function calculatedRecord(form) {
  const result = calculateStudent(form);
  return {
    ...form,
    gradeLevel: form.gradeLevel || form.grade || "初三",
    scores: Object.fromEntries(EVENT_ORDER.map((eventId) => [eventId, form.scores[eventId] === "" ? null : Number(form.scores[eventId])])),
    total: result.total,
    baseTotal: result.baseTotal,
    bonus: result.bonus,
    grade: result.grade,
    gradeTone: result.gradeTone,
    itemResults: result.itemResults,
    updatedAt: new Date().toISOString(),
  };
}

function validateForm(form) {
  if (!form.name) return "请填写姓名。";
  if (!form.className) return "请填写班级。";
  if (form.status !== "active") return "";
  const missing = EVENT_ORDER.filter((eventId) => form.scores[eventId] === "" || form.scores[eventId] === null);
  return missing.length ? `正常状态还缺少：${missing.map((id) => displayEventLabel(id, form.gender)).join("、")}。` : "";
}

function renderResult(record) {
  const resultPanel = $("#result-panel");
  const result = calculateStudent(record);
  resultPanel.classList.remove("hidden");
  $("#result-total").textContent = result.total === null ? "—" : formatNumber(result.total);
  $("#result-base").textContent = result.baseTotal === null ? "—" : formatNumber(result.baseTotal);
  $("#result-grade").textContent = result.grade || statusLabels[record.status] || "待完善";
  $("#result-grade").className = `grade-pill ${result.gradeTone || "neutral"}`;
  $("#result-items").innerHTML = result.itemResults.map((item) => `
    <tr>
      <td>${item.label}</td>
      <td>${formatNumber(item.raw)} ${item.unit || ""}</td>
      <td>${item.points === null ? "—" : item.points}</td>
      <td>${item.weight}%</td>
      <td>${item.weighted === null ? "—" : formatNumber(item.weighted)}</td>
    </tr>`).join("");
}

function resetForm() {
  editingId = null;
  $("#student-form").reset();
  $("#status").value = "active";
  $("#gender").value = "male";
  $("#form-title").textContent = "录入一名学生";
  $("#submit-record").textContent = "计算并保存";
  renderScoreFields();
  $("#result-panel").classList.add("hidden");
  $("#form-message").textContent = "";
}

function fillForm(record) {
  editingId = record.id;
  $("#form-title").textContent = `编辑：${record.name}`;
  $("#submit-record").textContent = "更新记录";
  $("#student-name").value = record.name || "";
  $("#class-name").value = record.className || "";
  $("#grade").value = record.gradeLevel || "初三";
  $("#gender").value = record.gender || "male";
  $("#status").value = record.status || "active";
  $("#bonus").value = record.bonus || 0;
  renderScoreFields();
  renderResult(record);
  $("#input-panel").scrollIntoView({ behavior: "smooth", block: "start" });
}

function gradeToneClass(tone) {
  return tone || "neutral";
}

function renderRecords() {
  const search = $("#search-input").value.trim().toLowerCase();
  const classFilter = $("#filter-class").value;
  const filtered = records.filter((record) => {
    const matchesText = !search || [record.name, record.className, record.gradeLevel, record.grade].some((value) => String(value || "").toLowerCase().includes(search));
    const matchesClass = !classFilter || record.className === classFilter;
    return matchesText && matchesClass;
  });
  $("#records-body").innerHTML = filtered.map((record) => `
    <tr>
      <td><strong>${escapeHtml(record.name)}</strong><small>${escapeHtml(record.gradeLevel || "")}</small></td>
      <td>${escapeHtml(record.className || "—")}</td>
      <td>${record.gender === "female" ? "女" : "男"}</td>
      <td><span class="status-chip ${record.status}">${statusLabels[record.status] || record.status}</span></td>
      <td>${record.total === null || record.total === undefined ? "—" : formatNumber(record.total)}</td>
      <td><span class="grade-pill ${gradeToneClass(record.gradeTone)}">${record.grade || "—"}</span></td>
      <td class="actions"><button data-action="view" data-id="${record.id}">查看</button><button data-action="edit" data-id="${record.id}">编辑</button><button class="danger-text" data-action="delete" data-id="${record.id}">删除</button></td>
    </tr>`).join("");
  $("#empty-records").classList.toggle("hidden", filtered.length > 0);
  updateClassFilter();
}

function updateClassFilter() {
  const select = $("#filter-class");
  const current = select.value;
  const classes = [...new Set(records.map((record) => record.className).filter(Boolean))].sort();
  select.innerHTML = `<option value="">全部班级</option>${classes.map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join("")}`;
  select.value = classes.includes(current) ? current : "";
}

function renderAnalysis() {
  const classFilter = $("#analysis-class").value;
  const subset = records.filter((record) => !classFilter || record.className === classFilter);
  const stats = summarizeStudents(subset);
  $("#metric-total").textContent = stats.totalRecords;
  $("#metric-valid").textContent = stats.validCount;
  $("#metric-average").textContent = stats.average === null ? "—" : formatNumber(stats.average);
  $("#metric-excellent-good").textContent = formatRate(stats.excellentGoodRate);
  $("#metric-pass").textContent = formatRate(stats.passRate);
  $("#analysis-note").textContent = `优良率和及格率的分母为有效成绩 ${stats.validCount} 人；缺考、免测、缺项不计入率值。`;
  const groups = [
    ["优秀", stats.excellent, "excellent"],
    ["良好", stats.good, "good"],
    ["及格", stats.pass - stats.excellent - stats.good, "pass"],
    ["不及格", stats.fail, "fail"],
  ];
  $("#grade-bars").innerHTML = groups.map(([label, count, tone]) => {
    const percent = stats.validCount ? (count / stats.validCount) * 100 : 0;
    return `<div class="bar-row"><span>${label}</span><div class="bar-track"><i class="${tone}" style="width:${percent}%"></i></div><strong>${count}人</strong></div>`;
  }).join("");
  updateAnalysisClassFilter();
}

function updateAnalysisClassFilter() {
  const select = $("#analysis-class");
  const current = select.value;
  const classes = [...new Set(records.map((record) => record.className).filter(Boolean))].sort();
  select.innerHTML = `<option value="">全体</option>${classes.map((className) => `<option value="${escapeHtml(className)}">${escapeHtml(className)}</option>`).join("")}`;
  select.value = classes.includes(current) ? current : "";
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[char]));
}

function escapeCsv(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function exportCsv() {
  const headers = ["姓名", "班级", "年级", "性别", "状态", "BMI", "肺活量", "50米跑", "坐位体前屈", "立定跳远", "力量项目", "耐力项目", "附加分", "总分", "等级"];
  const lines = records.map((record) => [
    record.name,
    record.className,
    record.gradeLevel || "初三",
    record.gender === "female" ? "女" : "男",
    statusLabels[record.status] || record.status,
    ...EVENT_ORDER.map((eventId) => record.scores?.[eventId] ?? ""),
    record.bonus ?? 0,
    record.total ?? "",
    record.grade ?? "",
  ].map(escapeCsv).join(","));
  downloadFile("体育成绩记录.csv", `\ufeff${[headers.map(escapeCsv).join(","), ...lines].join("\n")}`, "text/csv;charset=utf-8");
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === "," && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell); cell = "";
      if (row.some((value) => value.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function importCsvText(text) {
  const rows = parseCsv(text.replace(/^\ufeff/, ""));
  if (rows.length < 2) throw new Error("CSV 至少需要一行表头和一行数据。");
  const headers = rows[0].map((header) => header.trim());
  const findIndex = (...names) => names.map((name) => headers.indexOf(name)).find((index) => index >= 0) ?? -1;
  const indexes = {
    name: findIndex("姓名", "name"),
    className: findIndex("班级", "className", "class"),
    grade: findIndex("年级", "grade"),
    gender: findIndex("性别", "gender"),
    status: findIndex("状态", "status"),
    bonus: findIndex("附加分", "bonus"),
    ...Object.fromEntries(EVENT_ORDER.map((eventId) => [eventId, findIndex(standard.events?.[eventId]?.label || EVENT_META[eventId].label, eventId)])),
  };
  if (indexes.name < 0 || indexes.className < 0) throw new Error("CSV 必须包含“姓名”和“班级”列。");
  return rows.slice(1).map((row) => {
    const cellAt = (key) => indexes[key] < 0 ? "" : (row[indexes[key]] || "").trim();
    const genderText = cellAt("gender");
    const statusText = cellAt("status");
    const gender = ["女", "female", "女生"].includes(genderText) ? "female" : "male";
    const status = Object.entries(statusLabels).find(([, label]) => label === statusText)?.[0] || (Object.keys(statusLabels).includes(statusText) ? statusText : "active");
    const scores = Object.fromEntries(EVENT_ORDER.map((eventId) => [eventId, cellAt(eventId) === "" ? null : Number(cellAt(eventId))]));
    const raw = { id: makeId(), name: cellAt("name"), className: cellAt("className"), gradeLevel: cellAt("grade") || "初三", gender, status, bonus: cellAt("bonus") || 0, scores };
    return calculatedRecord(raw);
  }).filter((record) => record.name);
}

function validateStandard(candidate) {
  if (!candidate || typeof candidate !== "object") throw new Error("评分标准必须是 JSON 对象。");
  if (!candidate.events || !candidate.weights || !Array.isArray(candidate.gradeBands)) throw new Error("评分标准缺少 events、weights 或 gradeBands。");
  EVENT_ORDER.forEach((eventId) => {
    if (!candidate.events[eventId]) throw new Error(`缺少项目：${eventId}`);
    if (!Array.isArray(candidate.events[eventId].male) && !Array.isArray(candidate.events[eventId].female)) throw new Error(`项目 ${eventId} 缺少男生或女生评分档位。`);
  });
  return candidate;
}

function switchTab(tabName) {
  $$("[data-tab]").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabName));
  $$("[data-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.panel === tabName));
  if (tabName === "analysis") renderAnalysis();
}

function bindEvents() {
  $$("[data-tab]").forEach((button) => button.addEventListener("click", () => switchTab(button.dataset.tab)));
  $("#gender").addEventListener("change", renderScoreFields);
  $("#reset-form").addEventListener("click", resetForm);
  $("#student-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const form = collectForm();
    const validationMessage = validateForm(form);
    if (validationMessage) {
      showMessage("#form-message", validationMessage, "error");
      renderResult(form);
      return;
    }
    const record = calculatedRecord(form);
    const existingIndex = records.findIndex((item) => item.id === record.id);
    if (existingIndex >= 0) records.splice(existingIndex, 1, record);
    else records.unshift(record);
    saveRecords();
    renderResult(record);
    renderRecords();
    rosterRenderProject();
    rosterRenderFinal();
    renderAnalysis();
    showMessage("#form-message", existingIndex >= 0 ? "记录已更新。" : "记录已保存。", "success");
    editingId = record.id;
    $("#form-title").textContent = `编辑：${record.name}`;
    $("#submit-record").textContent = "更新记录";
  });
  $("#records-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const record = records.find((item) => item.id === button.dataset.id);
    if (!record) return;
    if (button.dataset.action === "view") renderResult(record);
    if (button.dataset.action === "edit") fillForm(record);
    if (button.dataset.action === "delete") {
      if (!window.confirm(`确定删除 ${record.name} 的记录吗？`)) return;
      records = records.filter((item) => item.id !== record.id);
      saveRecords();
      if (editingId === record.id) resetForm();
      renderRecords();
      rosterRenderProject();
      rosterRenderFinal();
      renderAnalysis();
    }
  });
  $("#search-input").addEventListener("input", renderRecords);
  $("#filter-class").addEventListener("change", renderRecords);
  $("#analysis-class").addEventListener("change", renderAnalysis);
  $("#export-csv").addEventListener("click", exportCsv);
  $("#import-csv").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = importCsvText(await file.text());
      records = [...imported, ...records];
      saveRecords();
      renderRecords();
      renderAnalysis();
      showMessage("#list-message", `已导入 ${imported.length} 条记录。`, "success");
    } catch (error) {
      showMessage("#list-message", error.message, "error");
    } finally {
      event.target.value = "";
    }
  });
  $("#clear-records").addEventListener("click", () => {
    if (!records.length || !window.confirm("确定清空当前浏览器保存的全部记录吗？")) return;
    records = [];
    saveRecords();
    resetForm();
    renderRecords();
    rosterRenderProject();
    rosterRenderFinal();
    renderAnalysis();
  });
  $("#load-demo").addEventListener("click", () => {
    $("#standard-json").value = JSON.stringify(DEFAULT_STANDARD, null, 2);
    showMessage("#settings-message", "已载入演示评分表，点击“保存并启用”后生效。", "info");
  });
  $("#save-standard").addEventListener("click", () => {
    try {
      const candidate = validateStandard(JSON.parse($("#standard-json").value));
      standard = cloneStandard(candidate);
      saveStandard();
      updateStandardBanner();
      recalculateAllRecords();
      renderScoreFields();
      renderRecords();
      renderAnalysis();
      showMessage("#settings-message", "评分标准已保存并启用。已有记录会按新标准重新计算。", "success");
    } catch (error) {
      showMessage("#settings-message", error.message, "error");
    }
  });
}

function recalculateAllRecords() {
  records = records.map((record) => calculatedRecord(record));
  saveRecords();
}

function init() {
  updateStandardBanner();
  recalculateAllRecords();
  renderScoreFields();
  renderRecords();
  renderAnalysis();
  bindEvents();
}

init();

// Roster-based, project-by-project testing workflow.
let rosterCurrentId = null;
let rosterSaveTimer = null;

function rosterHasScore(record, eventId) {
  const value = record.scores?.[eventId];
  return value !== null && value !== undefined && value !== "" && Number.isFinite(Number(value));
}

function rosterHasAnyScore(record) {
  return EVENT_ORDER.some((eventId) => rosterHasScore(record, eventId));
}

function rosterHasAllScores(record) {
  return EVENT_ORDER.every((eventId) => rosterHasScore(record, eventId));
}

function rosterCompletion(record) {
  return EVENT_ORDER.filter((eventId) => rosterHasScore(record, eventId)).length;
}

function rosterDerivedStatus(record) {
  if (record.status === "absent" || record.status === "exempt") return record.status;
  if (rosterHasAllScores(record)) return "active";
  return rosterHasAnyScore(record) ? "incomplete" : "pending";
}

function rosterNormalizeRecords() {
  records = records.map((record, index) => {
    const normalized = {
      ...record,
      id: record.id || makeId(),
      name: String(record.name || "").trim(),
      className: String(record.className || "").trim(),
      gradeLevel: record.gradeLevel || record.grade || "初三",
      gender: record.gender === "female" ? "female" : "male",
      status: statusLabels[record.status] ? record.status : "pending",
      bonus: Number(record.bonus) || 0,
      rosterOrder: Number.isFinite(Number(record.rosterOrder)) ? Number(record.rosterOrder) : index + 1,
      scores: Object.fromEntries(EVENT_ORDER.map((eventId) => {
        const value = record.scores?.[eventId];
        return [eventId, value === "" || value === undefined || value === null ? null : Number(value)];
      })),
    };
    normalized.status = rosterDerivedStatus(normalized);
    const result = calculateStudent({ scores: normalized.scores, standard, gender: normalized.gender, status: normalized.status, bonus: normalized.bonus });
    return { ...normalized, grade: result.grade, total: result.total, baseTotal: result.baseTotal, bonus: result.bonus, gradeTone: result.gradeTone, itemResults: result.itemResults, updatedAt: record.updatedAt || new Date().toISOString() };
  });
  saveRecords();
}

function rosterEventLabel(eventId, gender) {
  const definition = standard.events?.[eventId] || {};
  if (gender === "female" && definition.femaleLabel) return definition.femaleLabel;
  if (gender === "male" && definition.maleLabel) return definition.maleLabel;
  return definition.label || EVENT_META[eventId].label;
}

function rosterProjectEvent() {
  return $("#project-select").value || EVENT_ORDER[0];
}

function rosterProjectRows() {
  const classFilter = $("#project-class-filter").value;
  const search = $("#project-search").value.trim().toLowerCase();
  return [...records].sort((a, b) => (Number(a.rosterOrder) || 0) - (Number(b.rosterOrder) || 0)).filter((record) => {
    const classMatch = !classFilter || record.className === classFilter;
    const searchMatch = !search || [record.name, record.className].some((value) => String(value || "").toLowerCase().includes(search));
    return classMatch && searchMatch;
  });
}

function rosterUpdateProjectClasses() {
  const select = $("#project-class-filter");
  const current = select.value;
  const classes = [...new Set(records.map((record) => record.className).filter(Boolean))].sort();
  select.innerHTML = '<option value="">全部班级</option>' + classes.map((className) => '<option value="' + escapeHtml(className) + '">' + escapeHtml(className) + "</option>").join("");
  select.value = classes.includes(current) ? current : "";
}

function rosterUpdateFinalClasses() {
  const select = $("#final-class-filter");
  const current = select.value;
  const classes = [...new Set(records.map((record) => record.className).filter(Boolean))].sort();
  select.innerHTML = '<option value="">全部班级</option>' + classes.map((className) => '<option value="' + escapeHtml(className) + '">' + escapeHtml(className) + "</option>").join("");
  select.value = classes.includes(current) ? current : "";
}

function rosterRenderProjectOptions() {
  const select = $("#project-select");
  const current = select.value || EVENT_ORDER[0];
  select.innerHTML = EVENT_ORDER.map((eventId) => '<option value="' + eventId + '">' + EVENT_META[eventId].label + "</option>").join("");
  select.value = EVENT_ORDER.includes(current) ? current : EVENT_ORDER[0];
}

function rosterCurrentRecord() {
  return records.find((record) => record.id === rosterCurrentId) || null;
}

function rosterRenderProjectCurrent(rows) {
  const eventId = rosterProjectEvent();
  const current = rosterCurrentRecord();
  const index = rows.findIndex((record) => record.id === rosterCurrentId);
  const studentSelect = $("#project-student-select");
  studentSelect.innerHTML = rows.length
    ? rows.map((record, rowIndex) => '<option value="' + record.id + '">' + (rowIndex + 1) + ". " + escapeHtml(record.name) + "｜" + escapeHtml(record.className) + "</option>").join("")
    : '<option value="">暂无学生</option>';
  studentSelect.value = current ? current.id : "";
  $("#project-student-name").textContent = current ? current.name : "请先导入测试名单";
  $("#project-student-meta").textContent = current
    ? current.className + " · " + (current.gradeLevel || "初三") + " · " + (current.gender === "female" ? "女" : "男") + " · 已完成 " + rosterCompletion(current) + "/" + EVENT_ORDER.length + " 项 · 名单顺序 " + (index + 1)
    : "导入名单后，系统会按照名单顺序准备测试对象。";
  const scoreInput = $("#project-score-input");
  const statusSelect = $("#project-status");
  scoreInput.disabled = !current;
  statusSelect.disabled = !current;
  scoreInput.value = current?.scores?.[eventId] ?? "";
  scoreInput.step = eventId === "bmi" || eventId === "sprint50" || eventId === "sitReach" ? "0.1" : "1";
  scoreInput.placeholder = current ? "输入" + rosterEventLabel(eventId, current.gender) + "原始成绩" : "选择学生后输入";
  $("#project-score-label").innerHTML = (current ? rosterEventLabel(eventId, current.gender) : "成绩") + "<small>" + (displayUnit(eventId) || "") + "</small>";
  statusSelect.value = current && ["pending", "active", "incomplete", "absent", "exempt"].includes(current.status) ? current.status : "pending";
  $("#project-prev").disabled = !current || index <= 0;
  $("#project-skip").disabled = !current || index >= rows.length - 1;
  $("#project-save-next").disabled = !current;
}

function rosterRenderProjectRows(rows) {
  const eventId = rosterProjectEvent();
  $("#project-student-body").innerHTML = rows.map((record, index) => {
    const raw = record.scores?.[eventId];
    const result = record.itemResults?.find((item) => item.eventId === eventId);
    const scoreText = raw === null || raw === undefined ? "—" : formatNumber(raw) + (result?.points === null || result?.points === undefined ? "" : " / " + result.points + "分");
    return '<tr class="' + (record.id === rosterCurrentId ? "selected-row" : "") + '"><td>' + (index + 1) + "</td><td><strong>" + escapeHtml(record.name) + "</strong><small>" + (record.gender === "female" ? "女" : "男") + "</small></td><td>" + escapeHtml(record.className) + "</td><td>" + scoreText + "</td><td><span class=\"status-chip " + record.status + "\">" + (statusLabels[record.status] || record.status) + "</span></td><td><button class=\"button-ghost small-button\" data-project-action=\"select\" data-id=\"" + record.id + "\">测试</button></td></tr>";
  }).join("");
  $("#project-empty").classList.toggle("hidden", rows.length > 0);
  const completed = rows.filter((record) => rosterHasScore(record, eventId)).length;
  const currentIndex = rows.findIndex((record) => record.id === rosterCurrentId);
  $("#project-roster-count").textContent = rows.length;
  $("#project-completed-count").textContent = completed;
  $("#project-current-order").textContent = currentIndex < 0 ? "—" : (currentIndex + 1) + "/" + rows.length;
  $("#project-current-label").textContent = EVENT_META[eventId]?.label || "—";
}

function rosterRenderProject() {
  rosterRenderProjectOptions();
  rosterUpdateProjectClasses();
  const rows = rosterProjectRows();
  if (!rows.some((record) => record.id === rosterCurrentId)) rosterCurrentId = rows[0]?.id || null;
  rosterRenderProjectCurrent(rows);
  rosterRenderProjectRows(rows);
}

function rosterRenderFinal() {
  const search = $("#final-search").value.trim().toLowerCase();
  const classFilter = $("#final-class-filter").value;
  const rows = [...records].sort((a, b) => (Number(a.rosterOrder) || 0) - (Number(b.rosterOrder) || 0)).filter((record) => {
    const searchMatch = !search || [record.name, record.className].some((value) => String(value || "").toLowerCase().includes(search));
    return searchMatch && (!classFilter || record.className === classFilter);
  });
  $("#final-table-body").innerHTML = rows.map((record, index) => {
    const scoreCells = EVENT_ORDER.map((eventId) => '<td>' + (record.scores?.[eventId] === null || record.scores?.[eventId] === undefined ? "—" : formatNumber(record.scores[eventId])) + "</td>").join("");
    return "<tr><td>" + (index + 1) + "</td><td><strong>" + escapeHtml(record.name) + "</strong><small>" + escapeHtml(record.gradeLevel || "初三") + "</small></td><td>" + escapeHtml(record.className) + "</td><td>" + (record.gender === "female" ? "女" : "男") + "</td><td><span class=\"status-chip " + record.status + "\">" + (statusLabels[record.status] || record.status) + "</span></td>" + scoreCells + "<td>" + (record.total === null || record.total === undefined ? "—" : formatNumber(record.total)) + "</td><td><span class=\"grade-pill " + (record.gradeTone || "neutral") + "\">" + (record.grade || "—") + "</span></td></tr>";
  }).join("");
  $("#final-empty").classList.toggle("hidden", rows.length > 0);
  rosterUpdateFinalClasses();
}

function rosterRefreshAfterChange() {
  rosterRenderProjectRows(rosterProjectRows());
  rosterRenderFinal();
  renderRecords();
  renderAnalysis();
}

function rosterSaveProjectScore(show = false) {
  const current = rosterCurrentRecord();
  if (!current) return false;
  const input = $("#project-score-input");
  const raw = input.value.trim();
  if (raw !== "" && !Number.isFinite(Number(raw))) {
    showMessage("#roster-message", "请输入有效的数字成绩。", "error");
    return false;
  }
  current.scores[rosterProjectEvent()] = raw === "" ? null : Number(raw);
  if (current.status !== "absent" && current.status !== "exempt") current.status = rosterDerivedStatus(current);
  const result = calculateStudent({ scores: current.scores, standard, gender: current.gender, status: current.status, bonus: current.bonus });
  Object.assign(current, { total: result.total, baseTotal: result.baseTotal, bonus: result.bonus, grade: result.grade, gradeTone: result.gradeTone, itemResults: result.itemResults, updatedAt: new Date().toISOString() });
  saveRecords();
  rosterRefreshAfterChange();
  $("#project-auto-save").textContent = "已自动保存：" + current.name + "的" + rosterEventLabel(rosterProjectEvent(), current.gender) + "成绩。";
  if (show) showMessage("#roster-message", current.name + " 的成绩已保存。", "success");
  return true;
}

function rosterMoveProjectStudent(direction) {
  if (!rosterSaveProjectScore(false)) return;
  const rows = rosterProjectRows();
  const index = rows.findIndex((record) => record.id === rosterCurrentId);
  const next = index + direction;
  if (next < 0 || next >= rows.length) {
    showMessage("#roster-message", direction > 0 ? "已经是当前筛选范围的最后一人。" : "已经是第一人。", "info");
    return;
  }
  rosterCurrentId = rows[next].id;
  rosterRenderProject();
}

function rosterApplyProjectStatus() {
  const current = rosterCurrentRecord();
  if (!current) return;
  current.status = $("#project-status").value;
  if (["pending", "active", "incomplete"].includes(current.status)) current.status = rosterDerivedStatus(current);
  const result = calculateStudent({ scores: current.scores, standard, gender: current.gender, status: current.status, bonus: current.bonus });
  Object.assign(current, { total: result.total, baseTotal: result.baseTotal, bonus: result.bonus, grade: result.grade, gradeTone: result.gradeTone, itemResults: result.itemResults });
  saveRecords();
  rosterRenderProject();
  rosterRenderFinal();
  renderRecords();
  renderAnalysis();
  showMessage("#roster-message", current.name + " 的状态已保存。", "success");
}

function rosterDownloadTemplate() {
  const csv = "\\ufeff序号,姓名,班级,年级,性别,状态\\n1,张三,九年级1班,初三,男,待测试\\n2,李四,九年级1班,初三,女,待测试\\n3,王五,九年级2班,初三,男,待测试\\n";
  downloadFile("体测名单模板.csv", csv, "text/csv;charset=utf-8");
}

function rosterImportListText(text) {
  const rows = parseCsv(text.replace(/^\\ufeff/, ""));
  if (rows.length < 2) throw new Error("名单 CSV 至少需要一行表头和一行数据。");
  const headers = rows[0].map((header) => header.trim());
  const indexes = {
    order: headerIndex(headers, "序号", "编号", "order"),
    name: headerIndex(headers, "姓名", "name"),
    className: headerIndex(headers, "班级", "className", "class"),
    grade: headerIndex(headers, "年级", "grade"),
    gender: headerIndex(headers, "性别", "gender"),
    status: headerIndex(headers, "状态", "status"),
  };
  if (indexes.name < 0 || indexes.className < 0) throw new Error("名单 CSV 必须包含“姓名”和“班级”两列。");
  let added = 0;
  let updated = 0;
  const orderBase = records.reduce((max, record) => Math.max(max, Number(record.rosterOrder) || 0), 0) + 1;
  rows.slice(1).forEach((row, rowIndex) => {
    const name = cellAt(row, indexes.name);
    const className = cellAt(row, indexes.className);
    if (!name || !className) return;
    const grade = cellAt(row, indexes.grade) || "初三";
    const gender = ["女", "female", "女生"].includes(cellAt(row, indexes.gender)) ? "female" : "male";
    const importedStatus = statusFromText(cellAt(row, indexes.status), "pending");
    const existing = records.find((record) => record.name === name && record.className === className && (record.gradeLevel || record.grade) === grade);
    if (existing) {
      existing.gender = gender;
      if (importedStatus === "absent" || importedStatus === "exempt") existing.status = importedStatus;
      updated += 1;
      return;
    }
    records.push({
      id: makeId(), name, className, gradeLevel: grade, gender,
      status: importedStatus === "absent" || importedStatus === "exempt" ? importedStatus : "pending",
      bonus: 0, rosterOrder: Number(cellAt(row, indexes.order)) || orderBase + rowIndex,
      scores: Object.fromEntries(EVENT_ORDER.map((eventId) => [eventId, null])),
    });
    added += 1;
  });
  rosterNormalizeRecords();
  return { added, updated };
}

function rosterBindEvents() {
  $$("[data-tab]").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.tab === "project") rosterRenderProject();
    if (button.dataset.tab === "final") rosterRenderFinal();
  }));
  $("#roster-file").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const result = rosterImportListText(await file.text());
      rosterRenderProject();
      rosterRenderFinal();
      renderRecords();
      renderAnalysis();
      showMessage("#roster-message", "名单已导入：新增 " + result.added + " 人，更新 " + result.updated + " 人。", "success");
      switchTab("project");
    } catch (error) {
      showMessage("#roster-message", error.message, "error");
    } finally {
      event.target.value = "";
    }
  });
  $("#download-roster-template").addEventListener("click", rosterDownloadTemplate);
  $("#project-select").addEventListener("change", rosterRenderProject);
  $("#project-class-filter").addEventListener("change", rosterRenderProject);
  $("#project-search").addEventListener("input", rosterRenderProject);
  $("#project-student-select").addEventListener("change", (event) => {
    rosterCurrentId = event.target.value || null;
    rosterRenderProject();
  });
  $("#project-score-input").addEventListener("input", () => {
    window.clearTimeout(rosterSaveTimer);
    rosterSaveTimer = window.setTimeout(() => rosterSaveProjectScore(false), 150);
    $("#project-auto-save").textContent = "正在自动保存…";
  });
  $("#project-score-input").addEventListener("blur", () => rosterSaveProjectScore(true));
  $("#project-status").addEventListener("change", rosterApplyProjectStatus);
  $("#project-prev").addEventListener("click", () => rosterMoveProjectStudent(-1));
  $("#project-skip").addEventListener("click", () => rosterMoveProjectStudent(1));
  $("#project-save-next").addEventListener("click", () => rosterMoveProjectStudent(1));
  $("#project-student-body").addEventListener("click", (event) => {
    const button = event.target.closest("button[data-project-action='select']");
    if (!button) return;
    rosterCurrentId = button.dataset.id;
    rosterRenderProject();
  });
  $("#final-search").addEventListener("input", rosterRenderFinal);
  $("#final-class-filter").addEventListener("change", rosterRenderFinal);
  $("#export-final-csv").addEventListener("click", () => {
    exportCsv();
    showMessage("#final-message", "成绩表已导出。", "success");
  });
}

rosterNormalizeRecords();
rosterBindEvents();
rosterRenderProject();
rosterRenderFinal();

