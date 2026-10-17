export const EVENT_ORDER = [
  "bmi",
  "vitalCapacity",
  "sprint50",
  "sitReach",
  "longJump",
  "strength",
  "endurance",
];

export const EVENT_META = {
  bmi: { label: "BMI", unit: "", inputMode: "decimal" },
  vitalCapacity: { label: "肺活量", unit: "毫升", inputMode: "numeric" },
  sprint50: { label: "50米跑", unit: "秒", inputMode: "decimal" },
  sitReach: { label: "坐位体前屈", unit: "厘米", inputMode: "decimal" },
  longJump: { label: "立定跳远", unit: "厘米", inputMode: "numeric" },
  strength: { label: "力量项目", unit: "次", inputMode: "numeric" },
  endurance: { label: "耐力项目", unit: "秒", inputMode: "numeric" },
};

/**
 * This is an intentionally generic demonstration standard. It is not an
 * official national or local examination table. Replace it in the Settings
 * tab with the standard used by the school, region, and year.
 */
export const DEFAULT_STANDARD = {
  version: 1,
  title: "初中体测演示评分表（需替换）",
  note: "演示数据仅用于验证流程，不代表任何地区的正式评分标准。",
  totalMax: 100,
  weights: {
    bmi: 15,
    vitalCapacity: 15,
    sprint50: 20,
    sitReach: 10,
    longJump: 10,
    strength: 10,
    endurance: 20,
  },
  gradeBands: [
    { min: 90, label: "优秀", tone: "excellent" },
    { min: 80, label: "良好", tone: "good" },
    { min: 60, label: "及格", tone: "pass" },
    { min: 0, label: "不及格", tone: "fail" },
  ],
  events: {
    bmi: {
      ...EVENT_META.bmi,
      direction: "range",
      male: [
        { min: 17, max: 23.9, score: 100 },
        { min: 16, max: 24.9, score: 90 },
        { min: 15, max: 27.9, score: 80 },
        { min: 0, max: 40, score: 60 },
      ],
      female: [
        { min: 17, max: 23.9, score: 100 },
        { min: 16, max: 24.9, score: 90 },
        { min: 15, max: 27.9, score: 80 },
        { min: 0, max: 40, score: 60 },
      ],
    },
    vitalCapacity: {
      ...EVENT_META.vitalCapacity,
      direction: "higher",
      male: [
        { min: 5000, score: 100 },
        { min: 4500, score: 90 },
        { min: 4000, score: 80 },
        { min: 3500, score: 70 },
        { min: 3000, score: 60 },
        { min: 0, score: 40 },
      ],
      female: [
        { min: 4000, score: 100 },
        { min: 3500, score: 90 },
        { min: 3000, score: 80 },
        { min: 2600, score: 70 },
        { min: 2200, score: 60 },
        { min: 0, score: 40 },
      ],
    },
    sprint50: {
      ...EVENT_META.sprint50,
      direction: "lower",
      male: [
        { max: 7.2, score: 100 },
        { max: 7.8, score: 90 },
        { max: 8.4, score: 80 },
        { max: 9.0, score: 70 },
        { max: 9.6, score: 60 },
        { max: 99, score: 40 },
      ],
      female: [
        { max: 8.0, score: 100 },
        { max: 8.6, score: 90 },
        { max: 9.2, score: 80 },
        { max: 9.8, score: 70 },
        { max: 10.4, score: 60 },
        { max: 99, score: 40 },
      ],
    },
    sitReach: {
      ...EVENT_META.sitReach,
      direction: "higher",
      male: [
        { min: 20, score: 100 },
        { min: 16, score: 90 },
        { min: 12, score: 80 },
        { min: 8, score: 70 },
        { min: 4, score: 60 },
        { min: -99, score: 40 },
      ],
      female: [
        { min: 22, score: 100 },
        { min: 18, score: 90 },
        { min: 14, score: 80 },
        { min: 10, score: 70 },
        { min: 6, score: 60 },
        { min: -99, score: 40 },
      ],
    },
    longJump: {
      ...EVENT_META.longJump,
      direction: "higher",
      male: [
        { min: 250, score: 100 },
        { min: 230, score: 90 },
        { min: 210, score: 80 },
        { min: 190, score: 70 },
        { min: 170, score: 60 },
        { min: 0, score: 40 },
      ],
      female: [
        { min: 200, score: 100 },
        { min: 180, score: 90 },
        { min: 160, score: 80 },
        { min: 140, score: 70 },
        { min: 120, score: 60 },
        { min: 0, score: 40 },
      ],
    },
    strength: {
      ...EVENT_META.strength,
      direction: "higher",
      maleLabel: "引体向上",
      femaleLabel: "仰卧起坐",
      male: [
        { min: 15, score: 100 },
        { min: 12, score: 90 },
        { min: 9, score: 80 },
        { min: 6, score: 70 },
        { min: 3, score: 60 },
        { min: 0, score: 40 },
      ],
      female: [
        { min: 50, score: 100 },
        { min: 45, score: 90 },
        { min: 40, score: 80 },
        { min: 35, score: 70 },
        { min: 30, score: 60 },
        { min: 0, score: 40 },
      ],
    },
    endurance: {
      ...EVENT_META.endurance,
      direction: "lower",
      maleLabel: "1000米跑",
      femaleLabel: "800米跑",
      male: [
        { max: 210, score: 100 },
        { max: 225, score: 90 },
        { max: 240, score: 80 },
        { max: 255, score: 70 },
        { max: 270, score: 60 },
        { max: 9999, score: 40 },
      ],
      female: [
        { max: 195, score: 100 },
        { max: 210, score: 90 },
        { max: 225, score: 80 },
        { max: 240, score: 70 },
        { max: 255, score: 60 },
        { max: 9999, score: 40 },
      ],
    },
  },
};

export function cloneStandard(standard = DEFAULT_STANDARD) {
  return JSON.parse(JSON.stringify(standard));
}

export function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function scoreEvent(value, rule) {
  const numericValue = toNumber(value);
  if (numericValue === null || !rule) return null;
  const thresholds = Array.isArray(rule.thresholds) ? rule.thresholds : rule;
  if (!Array.isArray(thresholds) || thresholds.length === 0) return null;

  if (rule.direction === "range") {
    const range = thresholds.find((item) => {
      const min = item.min ?? -Infinity;
      const max = item.max ?? Infinity;
      return numericValue >= min && numericValue <= max;
    });
    return range ? toNumber(range.score) : null;
  }

  if (rule.direction === "lower") {
    const sorted = [...thresholds].sort((a, b) => (a.max ?? Infinity) - (b.max ?? Infinity));
    const match = sorted.find((item) => numericValue <= item.max);
    return match ? toNumber(match.score) : null;
  }

  const sorted = [...thresholds].sort((a, b) => (b.min ?? -Infinity) - (a.min ?? -Infinity));
  const match = sorted.find((item) => numericValue >= item.min);
  return match ? toNumber(match.score) : null;
}

export function gradeForTotal(total, gradeBands = DEFAULT_STANDARD.gradeBands) {
  if (total === null || total === undefined || !Array.isArray(gradeBands)) return null;
  const sorted = [...gradeBands].sort((a, b) => b.min - a.min);
  return sorted.find((band) => total >= band.min) || null;
}

export function eventRule(standard, eventId, gender) {
  const definition = standard?.events?.[eventId];
  if (!definition) return null;
  const thresholds = definition[gender] || definition.male || definition.female;
  if (!Array.isArray(thresholds)) return null;
  return { ...definition, thresholds };
}

export function calculateStudent({ scores = {}, standard = DEFAULT_STANDARD, gender = "male", status = "active", bonus = 0 }) {
  const itemResults = EVENT_ORDER.map((eventId) => {
    const definition = standard.events?.[eventId] || {};
    const raw = toNumber(scores[eventId]);
    const points = eventRule(standard, eventId, gender)
      ? scoreEvent(raw, eventRule(standard, eventId, gender))
      : null;
    const weight = toNumber(standard.weights?.[eventId]) || 0;
    return {
      eventId,
      raw,
      points,
      weight,
      weighted: points === null ? null : (points * weight) / 100,
      label: gender === "female" && definition.femaleLabel
        ? definition.femaleLabel
        : gender === "male" && definition.maleLabel
          ? definition.maleLabel
          : definition.label || EVENT_META[eventId].label,
      unit: definition.unit || EVENT_META[eventId].unit,
    };
  });

  const present = status === "active";
  const complete = itemResults.every((item) => item.points !== null);
  const weightedTotal = complete
    ? itemResults.reduce((sum, item) => sum + (item.weighted || 0), 0)
    : null;
  const bonusValue = Math.max(0, toNumber(bonus) || 0);
  const total = present && complete
    ? Math.min(toNumber(standard.totalMax) || 100, weightedTotal + bonusValue)
    : null;
  const grade = total === null ? null : gradeForTotal(total, standard.gradeBands);

  return {
    itemResults,
    complete,
    total,
    baseTotal: weightedTotal,
    bonus: bonusValue,
    grade: grade?.label || null,
    gradeTone: grade?.tone || null,
  };
}

export function summarizeStudents(students = []) {
  const valid = students.filter((student) => student.status === "active" && Number.isFinite(student.total));
  const count = valid.length;
  const average = count ? valid.reduce((sum, student) => sum + student.total, 0) / count : null;
  const excellent = valid.filter((student) => student.total >= 90).length;
  const good = valid.filter((student) => student.total >= 80 && student.total < 90).length;
  const pass = valid.filter((student) => student.total >= 60).length;
  return {
    totalRecords: students.length,
    validCount: count,
    excludedCount: students.length - count,
    excellent,
    good,
    pass,
    fail: count - pass,
    average,
    excellentRate: count ? excellent / count : 0,
    goodRate: count ? good / count : 0,
    excellentGoodRate: count ? (excellent + good) / count : 0,
    passRate: count ? pass / count : 0,
  };
}

export function formatRate(rate) {
  return `${(rate * 100).toFixed(1)}%`;
}

export function formatNumber(value, digits = 2) {
  return value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : Number(value).toFixed(digits).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

