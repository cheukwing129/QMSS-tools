const DAY_CODES = ['A', 'B', 'C', 'D', 'E', 'F'];
export const WEEK_RANGES = [2, 4, 6, 8];
const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

function dateStamp(isoDate) {
  if (typeof isoDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    throw new Error('校曆日期格式不正確，請由維護者檢查年度資料。');
  }
  const stamp = Date.parse(isoDate + 'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== isoDate) {
    throw new Error('校曆日期不正確，請由維護者檢查年度資料。');
  }
  return stamp;
}

export function hongKongToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

export function dateLabel(isoDate) {
  dateStamp(isoDate);
  const [year, month, day] = isoDate.split('-');
  return year + '/' + Number(month) + '/' + Number(day);
}

export function weekdayLabel(isoDate) {
  return '星期' + WEEKDAYS[new Date(dateStamp(isoDate)).getUTCDay()];
}

export function createSchoolCalendarModel(data) {
  if (!data || !data.days || typeof data.days !== 'object' || Array.isArray(data.days)) {
    throw new Error('校曆日期資料不完整，請由維護者檢查年度資料。');
  }
  const dates = Object.entries(data.days).map(([date, rawDay]) => {
    dateStamp(date);
    const day = String(rawDay).trim().toUpperCase();
    if (!DAY_CODES.includes(day)) {
      throw new Error('校曆的 Day 資料不正確，請由維護者檢查年度資料。');
    }
    return { date, day };
  }).sort((a, b) => a.date.localeCompare(b.date));
  if (!dates.length) throw new Error('校曆尚未提供日期，請由維護者更新年度資料。');
  const lastSynced = /^\d{4}-\d{2}-\d{2}$/.test(data.lastSynced || '') ? data.lastSynced : '';
  if (lastSynced) dateStamp(lastSynced);
  return {
    calendarName: String(data.calendarName || 'QMSS Calendar'),
    academicYear: String(data.academicYear || ''),
    lastSynced,
    dates,
    lastDate: dates[dates.length - 1].date
  };
}

export function upcomingDayDates(calendar, day, { today = hongKongToday(), weeks = 4 } = {}) {
  if (!DAY_CODES.includes(day) || !WEEK_RANGES.includes(weeks)) {
    throw new Error('請選擇有效的 Day 及查詢週數。');
  }
  const start = dateStamp(today);
  const end = start + weeks * 7 * DAY_MS;
  return {
    startDate: today,
    endDate: new Date(end - DAY_MS).toISOString().slice(0, 10),
    dates: calendar.dates.filter(entry => entry.day === day &&
      entry.date >= today && dateStamp(entry.date) < end).map(entry => ({
      date: entry.date,
      label: dateLabel(entry.date),
      weekday: weekdayLabel(entry.date)
    }))
  };
}
