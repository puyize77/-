// Browser-local roster import. Workbook data never leaves the user's device.
const utf8 = new TextDecoder();
const MAX_XML_SIZE = 64 * 1024 * 1024;
const clean = (value) => String(value ?? "").replace(/^\ufeff/, "").trim();
const headerKey = (value) => clean(value).replace(/\s+/g, "").toLowerCase();

export function parseRosterCsv(text) {
  text = text.replace(/^\ufeff/, "");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes("\t") ? "\t" : firstLine.includes(",") ? "," : ";";
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index], next = text[index + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { row.push(cell); cell = ""; continue; }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV 的引号没有闭合，请重新另存为 CSV 后导入。");
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

export function decodeRosterText(bytes) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes);
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); }
  catch { return new TextDecoder("gb18030").decode(bytes); }
}

// Read the central directory instead of scanning ZIP payloads for signatures.
export async function unzipWorkbook(bytes) {
  if (bytes.length < 22) throw new Error("Excel 文件不完整，请重新保存为 .xlsx 后导入。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  const lower = Math.max(0, end - 65535);
  while (end >= lower && view.getUint32(end, true) !== 0x06054b50) end -= 1;
  if (end < lower) throw new Error("Excel 文件不完整，请重新保存为 .xlsx 后导入。");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true), totalSize = 0;
  const entries = new Map();
  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error("Excel 压缩目录损坏。");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = utf8.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + nameLength + extraLength + commentLength;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue;
    if (flags & 1) throw new Error("暂不支持加密 Excel，请取消文件密码后再导入。");
    totalSize += size;
    if (size > MAX_XML_SIZE || totalSize > MAX_XML_SIZE * 2) throw new Error("Excel 数据过大，请只保留名单工作表后再导入。");
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== 0x04034b50) throw new Error("Excel 数据损坏。");
    const start = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
    if (start + compressedSize > bytes.length) throw new Error("Excel 文件不完整。");
    let content = bytes.slice(start, start + compressedSize);
    if (method === 8) {
      let decompressor;
      try { decompressor = new DecompressionStream("deflate-raw"); }
      catch { throw new Error("当前浏览器暂不支持 Excel 解压，请更新浏览器，或将名单另存为 CSV 后导入。"); }
      content = new Uint8Array(await new Response(new Blob([content]).stream().pipeThrough(decompressor)).arrayBuffer());
    } else if (method !== 0) throw new Error("Excel 使用了不支持的压缩格式，请重新另存为 .xlsx。");
    if (content.length !== size) throw new Error("Excel 数据长度不一致，请重新保存文件。");
    entries.set(name, utf8.decode(content));
  }
  if (!entries.has("xl/workbook.xml")) throw new Error("未找到 Excel 工作簿，请使用 .xlsx 文件。");
  return entries;
}

function browserXml(text) {
  const document = new DOMParser().parseFromString(text, "application/xml");
  if (document.getElementsByTagName("parsererror").length) throw new Error("Excel 内容格式错误，请重新保存文件。");
  return document;
}

const tags = (node, tag) => [...node.getElementsByTagNameNS("*", tag)];
const textOf = (node, tag) => tags(node, tag)[0]?.textContent ?? "";
function workbookPath(target) {
  const parts = (target.startsWith("/") ? target.slice(1) : "xl/" + target).split("/");
  const result = [];
  for (const part of parts) {
    if (part === "..") result.pop();
    else if (part && part !== ".") result.push(part);
  }
  return result.join("/");
}

export function workbookSheets(entries, parseXml = browserXml) {
  const shared = entries.has("xl/sharedStrings.xml")
    ? tags(parseXml(entries.get("xl/sharedStrings.xml")), "si").map((node) => tags(node, "t").map((text) => text.textContent).join("")) : [];
  const relations = new Map(tags(parseXml(entries.get("xl/_rels/workbook.xml.rels") || "<Relationships/>"), "Relationship")
    .filter((node) => node.getAttribute("TargetMode") !== "External")
    .map((node) => [node.getAttribute("Id"), workbookPath(node.getAttribute("Target"))]));
  const sheets = tags(parseXml(entries.get("xl/workbook.xml")), "sheet");
  return sheets.map((sheet) => {
    const relationId = sheet.getAttribute("r:id") || sheet.getAttributeNS?.("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const path = relations.get(relationId);
    if (!path || !entries.has(path)) throw new Error("找不到工作表“" + sheet.getAttribute("name") + "”的数据。");
    const rows = tags(parseXml(entries.get(path)), "row").map((row) => {
      const values = [];
      let nextColumn = 0;
      for (const cell of tags(row, "c")) {
        const letters = (cell.getAttribute("r") || "").match(/^[A-Z]+/i)?.[0];
        let column = letters ? [...letters.toUpperCase()].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0) - 1 : nextColumn;
        const type = cell.getAttribute("t");
        const raw = textOf(cell, "v");
        values[column] = type === "s" ? shared[Number(raw)] ?? "" : type === "inlineStr" ? tags(cell, "t").map((text) => text.textContent).join("") : raw;
        nextColumn = column + 1;
      }
      return Array.from({ length: values.length }, (_, index) => values[index] ?? "");
    });
    return { name: sheet.getAttribute("name"), rows };
  });
}

export async function readRosterFile(file) {
  if (file.size > 20 * 1024 * 1024) throw new Error("名单文件不能超过 20MB，请删除无关内容后重试。");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!bytes.length) throw new Error("名单文件是空的，请选择包含学生名单的文件。");
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  if (isZip) return workbookSheets(await unzipWorkbook(bytes));
  if (/\.xls$/i.test(file.name) || bytes[0] === 0xd0 && bytes[1] === 0xcf) throw new Error("这是旧版 .xls 文件，请在 Excel 中另存为 .xlsx 后导入；不要只修改后缀。");
  if (/\.xlsx$/i.test(file.name)) throw new Error("这个文件不是有效的 .xlsx，请在 Excel 中重新另存为 .xlsx 后导入。");
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error("请选择 Excel（.xlsx）或 CSV 名单文件。");
  return [{ name: file.name, rows: parseRosterCsv(decodeRosterText(bytes)) }];
}

const aliases = {
  name: ["姓名", "学生姓名", "name"],
  className: ["班级", "班级名称", "classname", "class"],
  gradeLevel: ["年级", "grade", "gradelevel"],
  gender: ["性别", "gender"],
  order: ["序号", "编号", "学号", "order"],
  status: ["状态", "status"],
};

export function studentsFromSheets(sheets) {
  const students = [], usedSheets = [], skippedSheets = [];
  let skippedRows = 0, missingGender = 0;
  for (const sheet of sheets) {
    const headerRow = sheet.rows.findIndex((row) => {
      const keys = row.map(headerKey);
      return aliases.name.some((alias) => keys.includes(alias)) && aliases.className.some((alias) => keys.includes(alias));
    });
    if (headerRow < 0) { skippedSheets.push(sheet.name); continue; }
    const headers = sheet.rows[headerRow].map(headerKey);
    const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, headers.findIndex((header) => names.includes(header))]));
    const get = (row, key) => indexes[key] < 0 ? "" : clean(row[indexes[key]]);
    let sheetCount = 0;
    for (const row of sheet.rows.slice(headerRow + 1)) {
      const name = get(row, "name"), className = get(row, "className");
      if (!name && !className) continue;
      if (aliases.name.includes(headerKey(name)) && aliases.className.includes(headerKey(className))) continue;
      if (!name || !className) { skippedRows += 1; continue; }
      const genderText = get(row, "gender").toLowerCase();
      if (genderText && !["男", "男生", "male", "m", "女", "女生", "female", "f"].includes(genderText)) throw new Error("工作表“" + sheet.name + "”中“" + name + "”的性别无法识别，请填写“男”或“女”。");
      if (!genderText) missingGender += 1;
      students.push({ name, className, gradeLevel: get(row, "gradeLevel") || "初三", gender: ["女", "女生", "female", "f"].includes(genderText) ? "female" : "male", sourceOrder: get(row, "order"), statusText: get(row, "status"), fields: Object.fromEntries(headers.map((header, index) => [header, clean(row[index])])) });
      sheetCount += 1;
    }
    if (sheetCount) usedSheets.push(sheet.name);
    else skippedSheets.push(sheet.name);
  }
  if (!students.length) throw new Error("没有找到学生名单。请确认表中包含“姓名”和“班级”表头，并且下面有学生数据。");
  return { students, usedSheets, skippedSheets, skippedRows, missingGender };
}

export function mergeRosterRecords(records, students, { makeId, eventIds }) {
  const merged = records.map((record) => ({ ...record, scores: { ...record.scores } }));
  const keyOf = (student) => JSON.stringify([student.name, student.className, student.gradeLevel || "初三"]);
  const byIdentity = new Map(merged.map((record) => [keyOf(record), record]));
  const updatedKeys = new Set();
  let nextOrder = merged.reduce((max, record) => Math.max(max, Number(record.rosterOrder) || 0), 0) + 1;
  let added = 0;
  for (const student of students) {
    const key = keyOf(student);
    let record = byIdentity.get(key);
    if (record) {
      if (records.some((existing) => existing.id === record.id)) updatedKeys.add(key);
    } else {
      record = { id: makeId(), name: student.name, className: student.className, gradeLevel: student.gradeLevel, status: "pending", bonus: 0, rosterOrder: nextOrder++, scores: Object.fromEntries(eventIds.map((id) => [id, null])) };
      merged.push(record); byIdentity.set(key, record); added += 1;
    }
    record.gender = student.gender;
    record.sourceOrder = student.sourceOrder;
    if (["absent", "exempt"].includes(student.status)) record.status = student.status;
    if (student.bonus !== undefined) record.bonus = student.bonus;
    Object.assign(record.scores, student.scores || {});
  }
  return { records: merged, added, updated: updatedKeys.size };
}

export function rosterTemplateCsv() {
  return "\ufeff序号,姓名,班级,年级,性别,状态\r\n1,张三,九年级1班,初三,男,待测试\r\n2,李四,九年级1班,初三,女,待测试\r\n3,王五,九年级2班,初三,男,待测试\r\n";
}
