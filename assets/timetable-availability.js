export const DAYS = ['A', 'B', 'C', 'D', 'E', 'F'];
export const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SIXTH_FORM = /^6[KPTW]$/i;

export function teacherName(teacher) {
  const code = String(teacher.code || '');
  const escapedCode = code.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const suffix = new RegExp('\\s*[（(]\\s*' + escapedCode + '\\s*[)）]\\s*$', 'i');
  let name = String(teacher.name || teacher.displayName || code).trim();
  while (suffix.test(name)) name = name.replace(suffix, '').trim();
  return name || code;
}

export function compareTeachers(a, b) {
  return a.code.localeCompare(b.code, 'en', { sensitivity: 'base' }) ||
    teacherName(a).localeCompare(teacherName(b), 'en', { sensitivity: 'base' });
}

export function slotKey(day, period) {
  return day + '|' + period;
}

export function isLessonPeriod(day, period) {
  return DAYS.includes(day) && PERIODS.includes(period) && (period !== 1 || day === 'F');
}

export function lessonActivities(lesson) {
  const specials = (lesson.specials || []).map(value => String(value).toLowerCase());
  const subject = String(lesson.subject || '');
  const assembly = lesson.day === 'F' && (lesson.period === 7 || lesson.period === 9) &&
    (specials.includes('assemblyhall') || /\bAssembly\s+Hall\b/i.test(subject));
  return {
    clp: specials.includes('clp') || /\bCLP\b/i.test(subject),
    assembly,
    unknown: specials.some(value => value !== 'clp' && (value !== 'assemblyhall' || !assembly))
  };
}

export function analyzeLesson(lesson, options = {}) {
  const classes = lesson.classes || [];
  const activity = lessonActivities(lesson);
  const onlySixth = classes.length > 0 && classes.every(value => SIXTH_FORM.test(value));
  const ignoredReasons = [];
  if (onlySixth && options.ignoreSixth) ignoredReasons.push('中六');
  if (activity.clp && options.ignoreCLP) ignoredReasons.push('CLP');
  if (activity.assembly && options.ignoreAssembly) ignoredReasons.push('周會');
  const teachingBlocks = classes.length > 0 && !(onlySixth && options.ignoreSixth);
  const clpBlocks = activity.clp && !options.ignoreCLP;
  const assemblyBlocks = activity.assembly && !options.ignoreAssembly;
  const unclassified = !classes.length && !activity.clp && !activity.assembly;
  const excluded = !teachingBlocks && !clpBlocks && !assemblyBlocks &&
    !activity.unknown && !unclassified;
  return { lesson, excluded, ignoredReasons, activity };
}

export function createTimetableModel(data) {
  if (!data || !Array.isArray(data.teachers) || !data.teachers.length ||
      !Array.isArray(data.days) || !Array.isArray(data.periods) ||
      !DAYS.every(day => (data.days || []).includes(day)) ||
      !PERIODS.every(period => (data.periods || []).map(Number).includes(period))) {
    throw new Error('年度課表資料不完整，請由維護者檢查資料檔。');
  }
  const byCode = new Map();
  const index = new Map();
  const teachers = data.teachers.map(rawTeacher => {
    if (!rawTeacher || typeof rawTeacher !== 'object') {
      throw new Error('老師資料不完整，請由維護者檢查資料檔。');
    }
    const code = String(rawTeacher.code || '').trim();
    if (!code || byCode.has(code) || !Array.isArray(rawTeacher.lessons)) {
      throw new Error('老師資料不完整或代號重複，請由維護者檢查資料檔。');
    }
    const teacher = { ...rawTeacher, code };
    const schedule = new Map();
    teacher.lessons.forEach(rawLesson => {
      if (!rawLesson || typeof rawLesson !== 'object') {
        throw new Error('課節資料不完整，請由維護者檢查年度課表。');
      }
      const lesson = {
        ...rawLesson,
        day: String(rawLesson.day || '').toUpperCase(),
        period: Number(rawLesson.period),
        classes: Array.isArray(rawLesson.classes) ? rawLesson.classes.map(String) : [],
        specials: Array.isArray(rawLesson.specials) ? rawLesson.specials.map(String) : []
      };
      if (!DAYS.includes(lesson.day) || !PERIODS.includes(lesson.period)) {
        throw new Error('課節的 Day 或節數不正確，請由維護者檢查年度課表。');
      }
      const key = slotKey(lesson.day, lesson.period);
      if (!schedule.has(key)) schedule.set(key, []);
      schedule.get(key).push(lesson);
    });
    byCode.set(code, teacher);
    index.set(code, schedule);
    return teacher;
  }).sort(compareTeachers);
  return { academicYear: String(data.academicYear || ''), teachers, byCode, index };
}

export function evaluateTimetable(model, selectedCodes, options = {}) {
  const teachers = Array.from(new Set(selectedCodes))
    .map(code => model.byCode.get(code)).filter(Boolean).sort(compareTeachers);
  const counts = Object.fromEntries(DAYS.map(day => [day, 0]));
  const slots = new Map();
  PERIODS.forEach(period => {
    DAYS.forEach(day => {
      const key = slotKey(day, period);
      const entries = [];
      const freeTeachers = [];
      teachers.forEach(teacher => {
        const lessons = (model.index.get(teacher.code).get(key) || [])
          .map(lesson => analyzeLesson(lesson, options));
        lessons.forEach(entry => entries.push({ ...entry, teacher }));
        if (lessons.every(entry => entry.excluded)) freeTeachers.push(teacher);
      });
      const commonFree = teachers.length > 0 && isLessonPeriod(day, period) &&
        freeTeachers.length === teachers.length;
      if (commonFree) counts[day] += 1;
      slots.set(key, { day, period, entries, freeTeachers, commonFree });
    });
  });
  return { teachers, slots, counts, commonCount: Object.values(counts).reduce((a, b) => a + b, 0) };
}
