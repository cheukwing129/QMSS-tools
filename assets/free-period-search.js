import {
  DAYS, PERIODS, createTimetableModel, evaluateTimetable, slotKey, teacherName
} from './timetable-availability.js';

const ui = Object.fromEntries([
  'teacher-search', 'teacher-list', 'list-status', 'no-results', 'selected-count',
  'selected-section', 'selected-teachers', 'clear-selection', 'selection-summary',
  'highlight-free', 'highlight-label', 'exclusion-options', 'ignore-sixth',
  'ignore-assembly', 'ignore-clp', 'schedule-meta', 'common-count', 'empty-state',
  'load-error', 'error-message', 'retry-load', 'scroll-hint', 'timetable-scroll',
  'timetable-head', 'timetable-body', 'year-pill', 'result-status'
].map(id => [id, document.getElementById(id)]));

const selected = new Set();
const teacherInputs = new Map();
let model = null;
let highlight = false;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function options() {
  return {
    ignoreSixth: ui['ignore-sixth'].checked,
    ignoreAssembly: ui['ignore-assembly'].checked,
    ignoreCLP: ui['ignore-clp'].checked
  };
}

function filterTeachers() {
  const words = ui['teacher-search'].value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  let matches = 0;
  teacherInputs.forEach(({ row, searchText }) => {
    const show = words.every(word => searchText.includes(word));
    row.hidden = !show;
    if (show) matches += 1;
  });
  ui['list-status'].textContent = matches + ' 位老師' + (words.length ? '符合搜尋' : '可供選擇');
  ui['no-results'].hidden = matches > 0;
}

function buildTeacherList() {
  const fragment = document.createDocumentFragment();
  teacherInputs.clear();
  model.teachers.forEach(teacher => {
    const name = teacherName(teacher);
    const row = element('label', 'teacher-choice');
    const input = element('input');
    input.type = 'checkbox';
    input.value = teacher.code;
    input.name = 'teacher';
    input.setAttribute('aria-label', name + '（' + teacher.code + '）');
    const text = element('span', 'teacher-text');
    text.append(element('strong', '', teacher.code), element('span', 'teacher-name', name));
    row.append(input, text);
    input.addEventListener('change', () => {
      if (input.checked) selected.add(teacher.code);
      else selected.delete(teacher.code);
      row.classList.toggle('is-selected', input.checked);
      renderSelection();
    });
    teacherInputs.set(teacher.code, {
      row, input, searchText: (teacher.code + ' ' + name + ' ' + (teacher.displayName || '')).toLocaleLowerCase()
    });
    fragment.append(row);
  });
  ui['teacher-list'].replaceChildren(fragment);
  filterTeachers();
}

function renderSelectedTeachers(teachers) {
  ui['selected-count'].textContent = selected.size;
  ui['selected-section'].hidden = selected.size === 0;
  ui['clear-selection'].disabled = selected.size === 0;
  const fragment = document.createDocumentFragment();
  teachers.forEach(teacher => {
    const chip = element('button', 'teacher-chip');
    chip.type = 'button';
    chip.title = teacherName(teacher);
    chip.setAttribute('aria-label', '移除 ' + teacherName(teacher) + '（' + teacher.code + '）');
    const remove = element('span', 'chip-remove', '×');
    remove.setAttribute('aria-hidden', 'true');
    chip.append(element('span', '', teacher.code), remove);
    chip.addEventListener('click', () => {
      selected.delete(teacher.code);
      const choice = teacherInputs.get(teacher.code);
      choice.input.checked = false;
      choice.row.classList.remove('is-selected');
      renderSelection();
      ui['teacher-search'].focus();
    });
    fragment.append(chip);
  });
  ui['selected-teachers'].replaceChildren(fragment);
}

function lessonRow(entry) {
  const row = element('li', 'lesson-entry' + (entry.excluded ? ' is-excluded' : ''));
  row.dataset.teacher = entry.teacher.code;
  row.dataset.excluded = String(entry.excluded);
  const header = element('div', 'lesson-header');
  const name = element('span', 'teacher-name', teacherName(entry.teacher));
  name.title = teacherName(entry.teacher);
  header.append(element('strong', '', entry.teacher.code), name);
  const content = element('p', 'lesson-content');
  const classes = entry.lesson.classes.join('／');
  if (classes) content.append(element('span', 'class-codes', classes));
  let subject = String(entry.lesson.subject || '').replace(/^[\s,，;；]+|[\s,，;；]+$/g, '').trim();
  if (!subject) subject = entry.activity.clp ? 'CLP' : entry.activity.assembly ? '周會' : '課堂／活動';
  content.append(document.createTextNode(subject));
  row.append(header, content);
  if (entry.excluded) {
    row.append(element('span', 'excluded-label', '已排除 · ' + entry.ignoredReasons.join('／')));
  }
  return row;
}

function slotCell(slot, teacherCount) {
  const reserved = slot.period === 1 && slot.day !== 'F';
  const cell = element('td', 'slot-cell' + (reserved ? ' is-reserved' : '') +
    (highlight && slot.commonFree ? ' is-common-free' : ''));
  cell.dataset.slot = slotKey(slot.day, slot.period);
  cell.dataset.commonFree = String(slot.commonFree);
  if (slot.entries.length) {
    const lessons = element('ul', 'slot-lessons');
    slot.entries.forEach(entry => lessons.append(lessonRow(entry)));
    cell.append(lessons);
  }
  if (reserved) {
    cell.append(element('p', 'reserved-note', '早會／閱讀'));
  } else if (slot.commonFree) {
    const label = highlight ? '✓ 共同空堂' : teacherCount === 1 ? '空堂' : '全部空堂';
    cell.append(element('p', 'slot-free-label' + (slot.entries.length ? ' is-after-lessons' : ''), label));
  } else if (slot.freeTeachers.length) {
    const free = element('details', 'free-detail');
    free.append(element('summary', '', slot.freeTeachers.length + '／' + teacherCount + ' 位空堂'));
    free.append(element('p', '', slot.freeTeachers.map(teacher => teacher.code).join('、')));
    cell.append(free);
  }
  return cell;
}

function renderTimetable(result) {
  const heading = element('tr');
  const periodTitle = element('th', '', '節數');
  periodTitle.scope = 'col';
  heading.append(periodTitle);
  DAYS.forEach(day => {
    const th = element('th', '', 'Day ' + day);
    th.scope = 'col';
    th.append(element('span', 'day-free-count', result.counts[day] + ' 節共同空堂'));
    heading.append(th);
  });
  ui['timetable-head'].replaceChildren(heading);
  const body = document.createDocumentFragment();
  PERIODS.forEach(period => {
    const tr = element('tr');
    const number = element('th');
    number.scope = 'row';
    number.append(element('span', 'period-number', period), document.createTextNode('節'));
    tr.append(number);
    DAYS.forEach(day => tr.append(slotCell(result.slots.get(slotKey(day, period)), result.teachers.length)));
    body.append(tr);
    if (period === 3 || period === 6) {
      const rest = element('tr', 'break-row' + (period === 6 ? ' lunch' : ''));
      const text = element('td', '', period === 3 ? '小息' : '午息');
      text.colSpan = DAYS.length + 1;
      rest.append(text);
      body.append(rest);
    }
  });
  ui['timetable-body'].replaceChildren(body);
}

function renderSelection() {
  if (!model) return;
  const result = evaluateTimetable(model, selected, options());
  const hasSelection = result.teachers.length > 0;
  if (!hasSelection) highlight = false;
  renderSelectedTeachers(result.teachers);
  ui['empty-state'].hidden = hasSelection;
  ui['timetable-scroll'].hidden = !hasSelection;
  ui['scroll-hint'].hidden = !hasSelection;
  ui['schedule-meta'].hidden = !hasSelection;
  ui['highlight-free'].disabled = !hasSelection;
  ui['highlight-free'].setAttribute('aria-pressed', String(highlight));
  ui['highlight-label'].textContent = highlight ? '取消高亮' : '高亮共同空堂';
  ui['common-count'].textContent = result.commonCount;
  ui['selection-summary'].textContent = hasSelection ?
    '已選 ' + result.teachers.length + ' 位老師 · 所有課節自動合併顯示' : '選取老師後，課表會自動顯示。';
  if (hasSelection) renderTimetable(result);
  else {
    ui['timetable-head'].replaceChildren();
    ui['timetable-body'].replaceChildren();
  }
  ui['result-status'].textContent = hasSelection ?
    '已選 ' + result.teachers.length + ' 位老師，共同空堂 ' + result.commonCount + ' 節。' +
    (highlight ? '已高亮共同空堂。' : '') : '已清除所選老師。';
}

async function loadData() {
  ui['load-error'].hidden = true;
  ui['empty-state'].hidden = false;
  ui['teacher-list'].setAttribute('aria-busy', 'true');
  ui['teacher-search'].disabled = true;
  ui['exclusion-options'].disabled = true;
  ui['retry-load'].disabled = true;
  ui['list-status'].textContent = '正在載入老師名單……';
  try {
    const response = await fetch(new URL('../data/timetable.json', import.meta.url), { cache: 'no-cache' });
    if (!response.ok) throw new Error('請確認網絡連線，或稍後重試。');
    model = createTimetableModel(await response.json());
    ui['year-pill'].textContent = model.academicYear ? '課表版本 · ' + model.academicYear : '年度課表';
    buildTeacherList();
    ui['teacher-search'].disabled = false;
    ui['exclusion-options'].disabled = false;
    renderSelection();
  } catch (error) {
    ui['empty-state'].hidden = true;
    ui['load-error'].hidden = false;
    ui['error-message'].textContent = error instanceof SyntaxError ? '資料檔未能讀取，請由維護者檢查年度課表。' :
      error.message === 'Failed to fetch' ? '請確認網絡連線後重試。' : error.message;
    ui['list-status'].textContent = '老師名單未能載入。';
    ui['year-pill'].textContent = '課表未能載入';
  } finally {
    ui['teacher-list'].setAttribute('aria-busy', 'false');
    ui['retry-load'].disabled = false;
  }
}

ui['teacher-search'].addEventListener('input', filterTeachers);
ui['clear-selection'].addEventListener('click', () => {
  selected.clear();
  teacherInputs.forEach(({ row, input }) => {
    input.checked = false;
    row.classList.remove('is-selected');
  });
  renderSelection();
  ui['teacher-search'].focus();
});
ui['highlight-free'].addEventListener('click', () => {
  highlight = !highlight;
  renderSelection();
});
['ignore-sixth', 'ignore-assembly', 'ignore-clp'].forEach(id => ui[id].addEventListener('change', renderSelection));
ui['retry-load'].addEventListener('click', loadData);
loadData();
