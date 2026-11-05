'use strict';

const $ = (id) => document.getElementById(id);
const STORAGE_KEY = 'pe-classroom.v1';
const STATUSES = { present: '出勤', leave: '请假', absent: '旷课' };
const GRADE_LABELS = { A: '优秀', B: '良好', C: '及格', D: '不及格' };
const attendanceList = $('attendance-list');
const rosterDialog = $('roster-dialog');
const rosterDeleteDialog = $('roster-delete-dialog');
const rosterSelection = new Set();
const scoreInputs = $('score-inputs');
let mode = 'single';
let lastScoreStudent = '';
let toastTimer;
let nextTab;
let pendingRosterDeletion;
let state = { students: [], attendance: [], scores: [] };

function today() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function readState(raw) {
  const data = JSON.parse(raw);
  if (!data || !['students', 'attendance', 'scores'].every((key) => Array.isArray(data[key]))) {
    throw new Error('Invalid backup format');
  }
  const students = new Map();
  for (const s of data.students) {
    if (!s || typeof s.id !== 'string' || !s.id || students.has(s.id) ||
        !s.name || typeof s.name !== 'string' || !s.className || typeof s.className !== 'string' ||
        typeof s.number !== 'string' || !Object.hasOwn(SEX, s.sex)) throw new Error('Invalid student');
    students.set(s.id, s);
  }
  const attendanceKeys = new Set();
  for (const a of data.attendance) {
    const key = a && JSON.stringify([a.date, a.student]);
    if (!a || !isDate(a.date) || !students.has(a.student) ||
        !Object.hasOwn(STATUSES, a.status) || attendanceKeys.has(key)) throw new Error('Invalid attendance');
    attendanceKeys.add(key);
  }
  const scoreKeys = new Set();
  for (const s of data.scores) {
    const key = s && JSON.stringify([s.date, s.student, s.item]);
    if (!s || !isDate(s.date) || !students.has(s.student) ||
        (s.item !== 'all' && !ITEM_KEYS.includes(s.item)) || scoreKeys.has(key) ||
        !Number.isFinite(s.score) || s.score < 0 || s.score > 100 ||
        !s.raw || typeof s.raw !== 'object' ||
        !Object.values(s.raw).every((value) => typeof value === 'string')) throw new Error('Invalid score');
    scoreKeys.add(key);
  }
  return data;
}

function loadStored() {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? readState(raw) : null;
}

function storageWarning(message) {
  const box = $('storage-warning');
  box.textContent = message;
  box.hidden = !message;
}

try {
  state = loadStored() ?? state;
} catch {
  storageWarning('浏览器记录无法读取。仍可试算，恢复备份后可继续登记。');
}

function writeState(change, restored = null) {
  try {
    const current = restored ?? loadStored() ?? JSON.parse(JSON.stringify(state));
    change(current);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    state = current;
    storageWarning('');
    return true;
  } catch {
    storageWarning('记录未能保存。请检查浏览器存储，或恢复有效备份。');
    return false;
  }
}

function toast(message) {
  const el = $('toast');
  clearTimeout(toastTimer);
  el.textContent = message;
  el.hidden = false;
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function safe(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}

function options(select, list, placeholder = '全部班级') {
  const previous = select.value;
  select.replaceChildren(new Option(placeholder, ''), ...list.map(([value, label]) => new Option(label, value)));
  if (list.some(([value]) => value === previous)) select.value = previous;
}

function sortedStudents() {
  return [...state.students].sort((a, b) =>
    a.className.localeCompare(b.className, 'zh-CN', { numeric: true }) ||
    a.number.localeCompare(b.number, 'zh-CN', { numeric: true }) ||
    a.name.localeCompare(b.name, 'zh-CN'));
}

function classNames() {
  return [...new Set(sortedStudents().map((student) => student.className))];
}

function studentInfo(student, includeSex = false) {
  return [student.className, student.number && '学号 ' + student.number, includeSex && SEX[student.sex]]
    .filter(Boolean).join(' · ');
}

function person(student, extra = '') {
  return '<div class="person"><strong>' + safe(student.name) + '</strong><small>' +
    safe(studentInfo(student) + (extra ? ' · ' + extra : '')) + '</small></div>';
}

function empty(text, action = false) {
  return '<div class="empty"><p>' + safe(text) + '</p>' +
    (action ? '<button type="button" class="text-button" data-roster>添加学生</button>' : '') + '</div>';
}

function stat(number, title) {
  return '<div class="stat"><strong>' + safe(number) + '</strong>' + safe(title) + '</div>';
}

function initSelectors() {
  const students = sortedStudents();
  const classes = classNames();
  options($('score-student'), students.map((student) => [
    student.id, student.name + ' · ' + studentInfo(student),
  ]), '自由试算');
  options($('attendance-class'), classes.map((name) => [name, name]));
  $('class-list').replaceChildren(...classes.map((name) => new Option(name)));
}

function showPage() {
  const tab = location.hash === '#attendance' ? 'attendance' : 'score';
  for (const page of ['score', 'attendance']) {
    $('page-' + page).hidden = tab !== page;
    if (tab === page) $('nav-' + page).setAttribute('aria-current', 'page');
    else $('nav-' + page).removeAttribute('aria-current');
  }
  if (nextTab && nextTab !== tab) window.scrollTo(0, 0);
  nextTab = tab;
}

function rosterRows() {
  const used = new Set([...state.attendance, ...state.scores].map((row) => row.student));
  const filter = $('roster-class-filter');
  options(filter, classNames().map((name) => [name, name]));
  const students = sortedStudents().filter((s) => !filter.value || s.className === filter.value);
  const visibleIds = new Set(students.map((s) => s.id));
  for (const id of rosterSelection) if (!visibleIds.has(id)) rosterSelection.delete(id);
  filter.disabled = !state.students.length;
  $('roster-list').innerHTML = students.length ? students.map((s) =>
    '<label class="roster-row"><input type="checkbox" data-roster-id="' + safe(s.id) +
    '"' + (rosterSelection.has(s.id) ? ' checked' : '') + '><span class="person"><strong>' +
    safe(s.name) + '</strong><small>' + safe(studentInfo(s, true)) + '</small></span>' +
    (used.has(s.id) ? '<span class="hint roster-record-tag">已有记录</span>' : '') + '</label>'
  ).join('') : empty('导入学生名单后即可点名和保存成绩。');
  updateRosterSelection();
}

function updateRosterSelection() {
  const total = $('roster-list').querySelectorAll('[data-roster-id]').length;
  const selected = rosterSelection.size;
  const all = $('roster-select-all');
  all.checked = total > 0 && selected === total;
  all.indeterminate = selected > 0 && selected < total;
  all.disabled = !total;
  $('roster-selection-count').textContent = '已选 ' + selected + ' 人';
  $('roster-delete').disabled = !selected;
}

function rosterMessage(id, message) {
  const feedback = $(id);
  feedback.textContent = message;
  feedback.hidden = !message;
}

function openRoster() {
  rosterSelection.clear();
  rosterMessage('roster-delete-feedback', '');
  rosterRows();
  $('roster-feedback').textContent = '';
  rosterDialog.showModal();
}

$('open-roster').addEventListener('click', openRoster);
$('close-roster').addEventListener('click', () => rosterDialog.close());
document.addEventListener('click', (event) => {
  if (event.target.closest('[data-roster]')) openRoster();
});

function refreshRoster() {
  const student = $('score-student').value;
  initSelectors();
  if (student !== $('score-student').value) {
    setupScore();
  } else {
    updateResult();
    renderScoreRecords();
  }
  renderAttendance();
  rosterRows();
}

function addRosterStudents(students) {
  let added = 0;
  if (!writeState((data) => {
    const names = new Set(), unnumbered = new Set(), numbers = new Set();
    const nameKey = (s) => JSON.stringify([s.className, s.name, s.sex]);
    const numberKey = (s) => JSON.stringify([s.className, s.number]);
    function track(student) {
      const name = nameKey(student);
      names.add(name);
      if (student.number) numbers.add(numberKey(student));
      else unnumbered.add(name);
    }
    data.students.forEach(track);
    for (const student of students) {
      const name = nameKey(student);
      const duplicate = student.number
        ? numbers.has(numberKey(student)) || unnumbered.has(name)
        : names.has(name);
      if (duplicate) continue;
      const id = Array.from(crypto.getRandomValues(new Uint8Array(16)),
        (byte) => byte.toString(16).padStart(2, '0')).join('');
      data.students.push({ ...student, id });
      track(student);
      added++;
    }
  })) return null;
  refreshRoster();
  return added;
}

const rosterColumns = {
  name: ['姓名', '学生姓名', 'name'],
  className: ['班级', '班级名称', '所属班级', 'class', 'classname'],
  sex: ['性别', '学生性别', 'gender', 'sex'],
  number: ['学号', '学籍号', '学生编号', '编号', '序号', 'studentid', 'number'],
};
const rosterCell = (value) => String(value ?? '').trim();
const rosterHeader = (value) => rosterCell(value).replace(/\s+/g, '').toLowerCase();

function rosterEntries(sheets) {
  const entries = [];
  let invalid = 0, firstInvalid = '';
  for (const sheet of sheets) {
    const header = sheet.rows.findIndex((row) => {
      const keys = row.map(rosterHeader);
      return ['name', 'className', 'sex'].every((field) =>
        rosterColumns[field].some((alias) => keys.includes(alias)));
    });
    if (header < 0) continue;
    const keys = sheet.rows[header].map(rosterHeader);
    const columns = Object.values(rosterColumns).map((aliases) =>
      aliases.map((alias) => keys.indexOf(alias)).find((index) => index >= 0) ?? -1);
    for (const row of sheet.rows.slice(header + 1)) {
      const [name, className, gender, number] = columns.map((column) => rosterCell(row[column]));
      if (!name && !className && !gender && !number) continue;
      if (rosterColumns.name.includes(rosterHeader(name)) &&
          rosterColumns.className.includes(rosterHeader(className)) &&
          rosterColumns.sex.includes(rosterHeader(gender))) continue;
      const code = rosterHeader(gender);
      const sex = /^(男|男生|男性|m|male)$/.test(code) ? 'm' :
        /^(女|女生|女性|f|female)$/.test(code) ? 'f' : '';
      if (!name || !className || !sex || name.length > 40 || className.length > 40 || number.length > 30) {
        invalid++;
        if (!firstInvalid) firstInvalid = '「' + sheet.name + '」中的' +
          (name ? '「' + name.slice(0, 40) + '」' : '一条记录') + '需要检查姓名、班级、性别或学号。';
        continue;
      }
      entries.push({ name, className, sex, number });
    }
  }
  if (!entries.length) throw new Error(firstInvalid ||
    '没有找到可导入的学生。请使用含「姓名、班级、性别」表头的名单，性别填男或女。');
  return { entries, invalid, firstInvalid };
}

$('roster-import-file').addEventListener('click', () => $('roster-file').click());
$('roster-template').addEventListener('click', () => exportCsv('体育课堂名单模板', [
  ['姓名', '班级', '性别', '学号'],
  ['张同学', '初三（1）班', '男', '01'],
  ['李同学', '初三（1）班', '女', '02'],
]));
$('roster-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  const button = $('roster-import-file');
  button.disabled = true;
  rosterMessage('roster-file-feedback', '正在读取名单…');
  try {
    const { readRosterFile } = await import('../src/roster-import.js');
    const { entries, invalid, firstInvalid } = rosterEntries(await readRosterFile(file));
    const added = addRosterStudents(entries);
    if (added === null) {
      rosterMessage('roster-file-feedback', '名单未能保存，请检查浏览器存储后重试。');
      return;
    }
    const duplicate = entries.length - added;
    let message = '已导入 ' + added + ' 人';
    if (duplicate) message += '，跳过 ' + duplicate + ' 条重复记录';
    if (invalid) message += '，跳过 ' + invalid + ' 条无效记录';
    rosterMessage('roster-file-feedback', message + '。' + firstInvalid);
  } catch (error) {
    rosterMessage('roster-file-feedback', error instanceof TypeError
      ? '无法读取名单，请刷新页面重试，或将表格另存为 CSV 后导入。'
      : error.message || '无法读取名单，请检查文件格式。');
  } finally {
    button.disabled = false;
  }
});

$('roster-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const className = $('roster-class').value.trim();
  const sex = $('roster-sex').value;
  const names = $('roster-names').value.split(/\r?\n/).filter((line) => line.trim());
  const feedback = $('roster-feedback');
  if (!className || !names.length) {
    feedback.textContent = '请填写班级和至少一个姓名。';
    return;
  }
  const rows = names.map((line) => line.split(/[,，\t]/).map((part) => part.trim()));
  if (rows.some(([name, number = '', ...extra]) => !name || name.length > 40 || number.length > 30 || extra.length)) {
    feedback.textContent = '请检查名单，每行填写姓名，或用逗号分开姓名与学号。';
    return;
  }
  const added = addRosterStudents(rows.map(([name, number = '']) => ({ name, className, sex, number })));
  if (added === null) {
    feedback.textContent = '名单未能保存，请检查浏览器存储后重试。';
    return;
  }
  $('roster-names').value = '';
  feedback.textContent = '已添加 ' + added + ' 人' + (added < rows.length ? '，跳过 ' + (rows.length - added) + ' 条重复记录。' : '。');
});

$('roster-class-filter').addEventListener('change', () => {
  rosterSelection.clear();
  rosterMessage('roster-delete-feedback', '');
  rosterRows();
});
$('roster-list').addEventListener('change', (event) => {
  const { checked, dataset } = event.target;
  if (!dataset.rosterId) return;
  if (checked) rosterSelection.add(dataset.rosterId);
  else rosterSelection.delete(dataset.rosterId);
  updateRosterSelection();
});
$('roster-select-all').addEventListener('change', (event) => {
  rosterSelection.clear();
  for (const checkbox of $('roster-list').querySelectorAll('[data-roster-id]')) {
    checkbox.checked = event.target.checked;
    if (checkbox.checked) rosterSelection.add(checkbox.dataset.rosterId);
  }
  updateRosterSelection();
});
$('roster-delete').addEventListener('click', () => {
  const selected = new Set(rosterSelection);
  if (!selected.size) return;
  const picked = (row) => selected.has(row.student);
  const scoreCount = state.scores.filter(picked).length;
  const attendanceCount = state.attendance.filter(picked).length;
  const records = scoreCount || attendanceCount
    ? '相关的 ' + scoreCount + ' 条成绩、' + attendanceCount + ' 条考勤也会一并删除。'
    : '';
  pendingRosterDeletion = selected;
  $('roster-delete-detail').textContent = '删除所选的 ' + selected.size + ' 名学生？' + records;
  rosterDeleteDialog.returnValue = '';
  rosterDeleteDialog.showModal();
});
rosterDeleteDialog.addEventListener('close', () => {
  const selected = pendingRosterDeletion;
  pendingRosterDeletion = undefined;
  if (rosterDeleteDialog.returnValue !== 'delete' || !selected?.size) return;
  const picked = (row) => selected.has(row.student);
  let deleted;
  if (!writeState((data) => {
    const previous = data.students.length;
    data.students = data.students.filter((student) => !selected.has(student.id));
    data.scores = data.scores.filter((row) => !picked(row));
    data.attendance = data.attendance.filter((row) => !picked(row));
    deleted = previous - data.students.length;
  })) {
    rosterMessage('roster-delete-feedback', '删除未能保存，请检查浏览器存储后重试。');
    return;
  }
  rosterSelection.clear();
  refreshRoster();
  rosterMessage('roster-delete-feedback', '已删除 ' + deleted + ' 名学生。');
});

function currentStudent() {
  return state.students.find((s) => s.id === $('score-student').value);
}

function scoreContext() {
  return { date: $('score-date').value, student: $('score-student').value,
    item: mode === 'single' ? $('score-item').value : 'all' };
}

function sameTest(row, context) {
  return row.date === context.date && row.student === context.student && row.item === context.item;
}

function scoreItems() {
  return mode === 'single' ? [$('score-item').value] : ITEM_KEYS;
}

function measurement(key, label, hint, keyboard = 'decimal') {
  return '<label>' + label + '<input type="text" inputmode="' + keyboard +
    '" autocomplete="off" maxlength="10" id="measure-' + key +
    '" data-key="' + key + '" placeholder="' + hint + '"></label>';
}

function setupScore(raw) {
  const student = currentStudent();
  lastScoreStudent = student?.id ?? '';
  const sexSelect = $('score-sex');
  sexSelect.disabled = Boolean(student);
  if (student) sexSelect.value = student.sex;
  $('score-item-label').hidden = mode === 'composite';
  for (const button of document.querySelectorAll('[data-mode]')) {
    button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
  }
  const sex = sexSelect.value;
  const data = raw ?? state.scores.find((row) => sameTest(row, scoreContext()))?.raw ?? {};
  scoreInputs.innerHTML = scoreItems().map((item) => {
    let fields;
    if (item === 'run') {
      fields = '<div class="fields split">' + measurement('minutes', '分钟', '如 3', 'numeric') +
        measurement('seconds', '秒', '如 50', 'numeric') + '</div>';
    } else if (item === 'weight') {
      fields = '<div class="fields split">' + measurement('height', '身高（厘米）', '如 165.0') +
        measurement('mass', '体重（公斤）', '如 58.0') + '</div>';
    } else {
      fields = measurement(item, '成绩（米）', ITEMS[item].hint);
    }
    return '<div class="input-group"><div class="input-head"><strong>' +
      itemLabel(item, sex) + '</strong><span class="item-points" id="points-' + item +
      '"></span></div>' + fields + '<p class="hint" id="hint-' + item + '" hidden></p></div>';
  }).join('');
  for (const input of scoreInputs.querySelectorAll('[data-key]')) input.value = data[input.dataset.key] ?? '';
  updateResult();
  renderScoreRecords();
}

function readMeasure(key, integer = false) {
  const input = $('measure-' + key);
  const raw = input.value.trim().normalize('NFKC');
  const valid = integer ? /^\d+$/.test(raw) : /^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw);
  const value = raw === '' ? null : valid ? Number(raw) : NaN;
  input.removeAttribute('aria-invalid');
  return value;
}

function showItemHint(item, hint) {
  const element = $('hint-' + item);
  element.textContent = hint;
  element.hidden = !hint;
}

function invalid(item, keys, hint) {
  for (const key of keys) $('measure-' + key).setAttribute('aria-invalid', 'true');
  showItemHint(item, hint);
  return null;
}

function calculateItem(item, sex) {
  showItemHint(item, '');
  if (item === 'run') {
    const minutes = readMeasure('minutes', true);
    const seconds = readMeasure('seconds', true);
    const total = minutes * 60 + seconds;
    if (Number.isNaN(minutes) || Number.isNaN(seconds) || seconds > 59 ||
        (minutes !== null && seconds !== null && total <= 0)) {
      return invalid(item, ['minutes', 'seconds'], '请填写有效用时，秒数填写 0–59。');
    }
    if (minutes === null || seconds === null) return null;
    return physicalScore(item, sex, total);
  }
  if (item === 'weight') {
    const height = readMeasure('height');
    const mass = readMeasure('mass');
    if (Number.isNaN(height) || Number.isNaN(mass) ||
        (height !== null && height <= 0) || (mass !== null && mass <= 0)) {
      return invalid(item, ['height', 'mass'], '请填写有效的身高与体重。');
    }
    if (height === null || mass === null) return null;
    const result = weightScore(sex, height, mass);
    showItemHint(item, result.category + (result.shifted ? ' · 已按附件注释换算超出表范围的身高' : ''));
    return result.score;
  }
  const value = readMeasure(item);
  if (value === null) return null;
  if (Number.isNaN(value) || value < 0) return invalid(item, [item], '请输入有效的米数，例如 2.41。');
  return physicalScore(item, sex, value);
}

function formatScore(number) {
  return Number.isInteger(number) ? String(number) : number.toFixed(1);
}

function updateResult() {
  const items = scoreItems();
  const sex = $('score-sex').value;
  const values = {};
  for (const item of items) {
    const points = calculateItem(item, sex);
    values[item] = points;
    $('points-' + item).textContent = points === null ? '' : points + ' 分';
  }
  const filled = items.filter((item) => values[item] !== null).length;
  const complete = filled === items.length;
  const score = !complete ? null : mode === 'single' ? values[items[0]] : compositeScore(values);
  const level = complete ? grade(score) : '';
  $('result-label').textContent = mode === 'single' ? '单项得分' : '综合得分';
  $('result-number').textContent = complete ? formatScore(score) : '—';
  $('result-grade').querySelector('strong').textContent = level || '—';
  $('result-grade').className = 'result-grade' + (level ? ' grade-' + level : '');
  $('result-note').textContent = complete ? GRADE_LABELS[level] :
    mode === 'composite' ? '已完成 ' + filled + ' / ' + items.length + ' 项' : '填写成绩后立即换算';
  const context = scoreContext();
  $('save-score').disabled = !complete || !context.student || !isDate(context.date);
  $('save-score').textContent = state.scores.some((row) => sameTest(row, context)) ? '更新成绩' : '保存成绩';
  return score;
}

scoreInputs.addEventListener('input', updateResult);
for (const button of document.querySelectorAll('[data-mode]')) {
  button.addEventListener('click', () => {
    if (mode === button.dataset.mode) return;
    mode = button.dataset.mode;
    setupScore();
  });
}
for (const id of ['score-date', 'score-item']) $(id).addEventListener('change', () => setupScore());
$('score-student').addEventListener('change', () => {
  const isNewRecord = !state.scores.some((row) => sameTest(row, scoreContext()));
  setupScore(!lastScoreStudent && isNewRecord ? currentRaw() : undefined);
});
$('score-sex').addEventListener('change', () => setupScore(currentRaw()));
$('clear-score').addEventListener('click', () => setupScore({}));
$('score-class').addEventListener('change', renderScoreRecords);
$('score-history').addEventListener('change', (event) => {
  if (!event.target.value) return;
  $('score-date').value = event.target.value;
  setupScore();
});

function currentRaw() {
  return Object.fromEntries([...scoreInputs.querySelectorAll('[data-key]')].map((input) => [
    input.dataset.key, input.value.trim(),
  ]));
}

$('save-score').addEventListener('click', () => {
  const score = updateResult();
  const context = scoreContext();
  if (score === null || !context.student || !isDate(context.date)) return;
  const raw = currentRaw();
  const success = writeState((data) => {
    if (!data.students.some((s) => s.id === context.student)) throw new Error('Student unavailable');
    data.scores = data.scores.filter((row) => !sameTest(row, context));
    data.scores.push({ ...context, raw, score });
  });
  if (!success) return;
  updateResult();
  renderScoreRecords();
  toast('成绩已保存');
});

function visibleScores() {
  const context = scoreContext();
  const className = $('score-class').value;
  const students = new Map(sortedStudents().map((student, index) => [student.id, { student, index }]));
  return state.scores.filter((row) => row.date === context.date && row.item === context.item)
    .map((row) => ({ ...row, ...students.get(row.student) }))
    .filter((row) => row.student && (!className || row.student.className === className))
    .sort((a, b) => a.index - b.index);
}

function formatRaw(row, sex) {
  const raw = row.raw;
  const parts = [];
  if (row.item === 'jump' || row.item === 'all') parts.push('跳远 ' + raw.jump + ' 米');
  if (row.item === 'ball' || row.item === 'all') parts.push('实心球 ' + raw.ball + ' 米');
  if (row.item === 'run' || row.item === 'all') parts.push(itemLabel('run', sex) + ' ' + raw.minutes + '分' + raw.seconds + '秒');
  if (row.item === 'weight' || row.item === 'all') parts.push(raw.height + ' 厘米 / ' + raw.mass + ' 公斤');
  return parts.join(' · ');
}

function renderScoreRecords() {
  const { date, item } = scoreContext();
  $('score-record-title').textContent = item === 'all' ? '综合成绩表' : ITEMS[item].short + '成绩表';
  const dates = [...new Set(state.scores.filter((row) => row.item === item).map((row) => row.date))].sort().reverse();
  options($('score-history'), dates.map((value) => [value, value]), '选择日期');
  $('score-history').value = dates.includes(date) ? date : '';
  options($('score-class'), classNames().map((name) => [name, name]));
  $('score-record-controls').hidden = !dates.length;
  const rows = visibleScores();
  $('export-scores').disabled = rows.length === 0;
  const stats = $('score-stats');
  stats.hidden = !rows.length;
  if (rows.length) {
    const percent = (threshold) => (100 * rows.filter((row) => row.score >= threshold).length / rows.length).toFixed(1) + '%';
    stats.innerHTML = stat(rows.length, '已测人数') + stat(percent(75), '优良率') + stat(percent(60), '及格率');
  }
  $('score-records').innerHTML = rows.length ? rows.map((row) => {
    const level = grade(row.score);
    return '<div class="score-row">' + person(row.student, formatRaw(row, row.student.sex)) +
      '<span class="row-score">' + formatScore(row.score) + ' 分 <span class="pill grade-' + level + '">' +
      level + '</span></span><button type="button" class="button secondary compact" data-edit-score="' +
      safe(row.student.id) + '">修改</button><button type="button" class="button secondary compact" data-delete-score="' +
      safe(row.student.id) + '">删除</button></div>';
  }).join('') : empty('这个日期和班级暂无该项目成绩。');
}

$('score-records').addEventListener('click', (event) => {
  const edit = event.target.closest('[data-edit-score]');
  const remove = event.target.closest('[data-delete-score]');
  if (edit) {
    $('score-student').value = edit.dataset.editScore;
    setupScore();
    scoreInputs.querySelector('input')?.focus();
  }
  if (remove && confirm('删除这条测试成绩？')) {
    const context = { ...scoreContext(), student: remove.dataset.deleteScore };
    if (writeState((data) => {
      data.scores = data.scores.filter((row) => !sameTest(row, context));
    })) {
      if ($('score-student').value === context.student) setupScore({});
      else renderScoreRecords();
      toast('成绩已删除');
    }
  }
});

function currentAttendance() {
  const date = $('attendance-date').value;
  const className = $('attendance-class').value;
  const query = $('attendance-search').value.trim().toLowerCase();
  const students = sortedStudents().filter((student) => !className || student.className === className);
  const marks = new Map(state.attendance.filter((row) => row.date === date).map((row) => [row.student, row.status]));
  const visible = students.filter((student) =>
    !query || student.name.toLowerCase().includes(query) || student.number.toLowerCase().includes(query));
  return { date, students, marks, visible };
}

function renderAttendance(focus) {
  const { date, students, marks, visible } = currentAttendance();
  const dates = [...new Set(state.attendance.map((row) => row.date))].sort().reverse();
  options($('attendance-history'), dates.map((value) => [value, value]), dates.length ? '选择日期' : '暂无历史考勤');
  $('attendance-history').value = dates.includes(date) ? date : '';
  $('export-attendance').disabled = !state.attendance.length;
  const tally = { present: 0, leave: 0, absent: 0, unmarked: 0 };
  for (const student of students) tally[marks.get(student.id) ?? 'unmarked']++;
  $('attendance-stats').innerHTML = Object.entries({ ...STATUSES, unmarked: '未登记' })
    .map(([status, label]) => stat(tally[status], label)).join('');
  $('mark-present').disabled = !isDate(date) || !visible.some((student) => !marks.has(student.id));
  attendanceList.innerHTML = visible.length ? visible.map((student) => {
    const status = marks.get(student.id);
    return '<div class="attendance-row">' + person(student) + '<div class="attendance-buttons" role="group" aria-label="' +
      safe(student.name) + '的出勤状态">' + Object.entries(STATUSES).map(([key, label]) =>
      '<button type="button" data-student="' + safe(student.id) + '" data-status="' + key +
      '" aria-pressed="' + (status === key) + '"' + (isDate(date) ? '' : ' disabled') + '>' + label + '</button>'
    ).join('') + '</div></div>';
  }).join('') : state.students.length ? empty('当前筛选下没有学生。') : empty('添加学生名单后，就可以按日期点名。', true);
  if (focus) {
    [...attendanceList.querySelectorAll('button[data-status]')].find((button) =>
      button.dataset.student === focus.student && button.dataset.status === focus.status)?.focus({ preventScroll: true });
  }
}

for (const id of ['attendance-date', 'attendance-class']) $(id).addEventListener('change', () => renderAttendance());
$('attendance-search').addEventListener('input', () => renderAttendance());
$('attendance-history').addEventListener('change', (event) => {
  if (!event.target.value) return;
  $('attendance-date').value = event.target.value;
  renderAttendance();
});
attendanceList.addEventListener('click', (event) => {
  const button = event.target.closest('[data-status]');
  if (!button) return;
  const date = $('attendance-date').value;
  if (!isDate(date)) return;
  const { student, status } = button.dataset;
  if (writeState((data) => {
    if (!data.students.some((row) => row.id === student)) throw new Error('Student unavailable');
    const current = data.attendance.find((row) => row.date === date && row.student === student);
    data.attendance = data.attendance.filter((row) => row.date !== date || row.student !== student);
    if (current?.status !== status) data.attendance.push({ date, student, status });
  })) renderAttendance({ student, status });
});
$('mark-present').addEventListener('click', () => {
  const { date, marks, visible } = currentAttendance();
  const ids = visible.filter((student) => !marks.has(student.id)).map((student) => student.id);
  if (!isDate(date) || !ids.length || !confirm('将当前显示的 ' + ids.length + ' 名未登记学生设为出勤？')) return;
  if (writeState((data) => {
    const alreadyMarked = new Set(data.attendance.filter((row) => row.date === date).map((row) => row.student));
    for (const student of ids) {
      if (!alreadyMarked.has(student) && data.students.some((s) => s.id === student)) {
        data.attendance.push({ date, student, status: 'present' });
      }
    }
  })) {
    renderAttendance();
    toast('出勤已保存');
  }
});

function download(filename, content, mime) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

function exportCsv(filename, rows) {
  const encode = (value) => {
    const cell = String(value);
    const text = /^[\s\uFEFF]*[=+\-@＝＋－＠]|^[\t\r\n]/.test(cell) ? "'" + cell : cell;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  const csv = rows.map((row) => row.map(encode).join(',')).join('\r\n');
  download(filename + '.csv', '\uFEFF' + csv, 'text/csv;charset=utf-8');
}

$('export-attendance').addEventListener('click', () => {
  const students = new Map(sortedStudents().map((student) => [student.id, student]));
  const records = [...state.attendance].sort((a, b) => b.date.localeCompare(a.date) ||
    students.get(a.student).className.localeCompare(students.get(b.student).className, 'zh-CN') ||
    students.get(a.student).name.localeCompare(students.get(b.student).name, 'zh-CN'));
  exportCsv('体育考勤表', [
    ['点名日期', '班级', '姓名', '学号', '考勤状态'],
    ...records.map((row) => {
      const student = students.get(row.student);
      return [row.date, student.className, student.name, student.number, STATUSES[row.status]];
    }),
  ]);
});

$('export-scores').addEventListener('click', () => {
  const { date, item } = scoreContext();
  exportCsv(date + '-' + (item === 'all' ? '综合' : ITEMS[item].short) + '成绩表', [
    ['测试日期', '班级', '姓名', '学号', '性别', '项目', '原始成绩', '得分', '等级'],
    ...visibleScores().map((row) => [row.date, row.student.className, row.student.name,
      row.student.number, SEX[row.student.sex], row.item === 'all' ? '综合测试' : itemLabel(row.item, row.student.sex),
      formatRaw(row, row.student.sex), formatScore(row.score), grade(row.score)]),
  ]);
});

$('backup-data').addEventListener('click', () => download('体育课堂备份-' + today() + '.json',
  JSON.stringify(state, null, 2), 'application/json'));
$('restore-data').addEventListener('click', () => $('restore-file').click());
$('restore-file').addEventListener('change', async (event) => {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  let restored;
  try {
    restored = readState(await file.text());
  } catch {
    toast('无法读取这个备份文件');
    return;
  }
  if (!confirm('恢复备份会替换当前浏览器里的名单、考勤和成绩。继续恢复？')) return;
  if (writeState(() => {}, restored)) {
    initSelectors();
    setupScore();
    renderAttendance();
    toast('备份已恢复');
  }
});

window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return;
  try {
    const raw = currentRaw();
    state = loadStored() ?? { students: [], attendance: [], scores: [] };
    initSelectors();
    setupScore(raw);
    renderAttendance();
    if (rosterDialog.open) rosterRows();
  } catch {
    storageWarning('无法同步同一浏览器的记录。');
  }
});

$('score-date').value = today();
$('attendance-date').value = today();
window.addEventListener('hashchange', showPage);
showPage();
initSelectors();
setupScore();
renderAttendance();
