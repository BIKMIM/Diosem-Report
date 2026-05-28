import { WORKERS } from './workers';
import { getHolidayName } from './holidays';

const removeTitle = (name) =>
  name.replace(/(프로|기정|차장|TL|부장님|팀장)$/, '').trim();

const parseDate = (line) => {
  const match = line.match(/<(\d+)월\s*(\d+)일\s*(\S+)>/);
  if (match) {
    return { month: parseInt(match[1]), day: parseInt(match[2]), dayOfWeek: match[3] };
  }
  return null;
};

const parseLeave = (line) => {
  const yearLeave = [], halfLeave = [], halfHalfLeave = [], education = [];
  const pattern = /([가-힣]+)\s*:\s*([^\/■◆□★<]+)/g;
  let match;
  while ((match = pattern.exec(line)) !== null) {
    const keyword = match[1].trim();
    const names = match[2].trim()
      .split(/[,\s\/]+/)
      .map(n => removeTitle(n.replace(/\([^)]*\)/g, '').trim()))
      .filter(n => n && n.length >= 2 && WORKERS.includes(n));
    if (!names.length) continue;
    if (keyword.match(/^(연차|민방위|예비군|휴가|여름휴가|겨울휴가)$/)) yearLeave.push(...names);
    else if (keyword.match(/^(반차|오전반차|오후반차)$/)) halfLeave.push(...names);
    else if (keyword === '반반차') halfHalfLeave.push(...names);
    else education.push(...names);
  }
  return {
    yearLeave: [...new Set(yearLeave)],
    halfLeave: [...new Set(halfLeave)],
    halfHalfLeave: [...new Set(halfHalfLeave)],
    education: [...new Set(education)]
  };
};

// " / " 또는 줄 끝의 "/" 모두 허용 (작업자 미배정 라인 처리)
const hasSlash = (s) => {
  const t = s.trim();
  return t.includes(' / ') || t.endsWith(' /') || t.endsWith('/');
};
const normalizeSlash = (s) => {
  if (s.includes(' / ')) return s;
  return s.replace(/\s*\/\s*$/, ' / ');
};

const parseWorkLine = (line) => {
  if (!hasSlash(line)) return null;
  const normalized = normalizeSlash(line);
  const slashIndex = normalized.indexOf(' / ');
  const beforeSlash = normalized.substring(0, slashIndex).trim();
  const workersStr = normalized.substring(slashIndex + 3).trim();

  const cleanedStr = workersStr.replace(/\([^)]*\)/g, '');
  const namePattern = /[가-힣]{2,4}(?:프로|기정|차장|TL|부장님|팀장)?/g;
  const foundNames = [];
  let m;
  while ((m = namePattern.exec(cleanedStr)) !== null) {
    const name = removeTitle(m[0]);
    if (name && name.length >= 2 && !name.match(/^(프로|기정|차장|TL|부장님|팀장)$/))
      foundNames.push(name);
  }
  const workers = [...new Set(foundNames)].filter(w => WORKERS.includes(w));

  let workHours = 0, startTime = '', endTime = '', timeInfo = '';
  const timeRangeMatch = beforeSlash.match(/(\d{1,2})시\s*-\s*(\d{1,2})시\s*\((\d+(?:\.\d+)?)\s*시간/);
  if (timeRangeMatch) {
    startTime = timeRangeMatch[1].padStart(2, '0') + ':00';
    endTime = timeRangeMatch[2].padStart(2, '0') + ':00';
    workHours = parseFloat(timeRangeMatch[3]);
    timeInfo = `${timeRangeMatch[1]}시-${timeRangeMatch[2]}시 (${workHours}시간)`;
  } else {
    const hourMatch = beforeSlash.match(/\((\d+(?:\.\d+)?)\s*시간\s*기준\)/);
    if (hourMatch) {
      workHours = parseFloat(hourMatch[1]);
      timeInfo = `${workHours}시간 기준`;
    } else {
      workHours = 8;
      timeInfo = '8시간 기준';
    }
  }

  const taskName = beforeSlash
    .replace(/^[■□▪▫●○◆★☆]\s*/, '')
    .replace(/\d{1,2}시\s*-\s*\d{1,2}시\s*\([^)]+\)/, '')
    .replace(/\([^)]*시간[^)]*\)/, '')
    .trim();

  return { taskName, timeInfo, startTime, endTime, workHours, workers, rawLine: line };
};

// Parse full schedule text into daily data
export const parseScheduleText = (text) => {
  const lines = text.split('\n');
  const dailyData = [];
  let currentDay = null;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed) continue;

    const dateInfo = parseDate(trimmed);
    if (dateInfo) {
      const holidayName = getHolidayName(dateInfo.month, dateInfo.day, dateInfo.dayOfWeek);
      currentDay = {
        ...dateInfo,
        isHoliday: holidayName !== null,
        holidayName: holidayName || null,
        yearLeave: [], halfLeave: [], halfHalfLeave: [], education: [],
        tasks: []
      };
      dailyData.push(currentDay);
      if (trimmed.includes(':')) {
        const leave = parseLeave(trimmed);
        currentDay.yearLeave.push(...leave.yearLeave);
        currentDay.halfLeave.push(...leave.halfLeave);
        currentDay.halfHalfLeave.push(...leave.halfHalfLeave);
        currentDay.education.push(...leave.education);
      }
      continue;
    }

    if (!currentDay) continue;

    if (trimmed.includes(':') && !trimmed.match(/^[■□▪▫●○◆★☆]/)) {
      const leave = parseLeave(trimmed);
      currentDay.yearLeave.push(...leave.yearLeave);
      currentDay.halfLeave.push(...leave.halfLeave);
      currentDay.halfHalfLeave.push(...leave.halfHalfLeave);
      currentDay.education.push(...leave.education);
      continue;
    }

    if (trimmed.match(/^[■□▪▫●○◆★☆]/)) {
      if (hasSlash(trimmed)) {
        const task = parseWorkLine(trimmed);
        if (task) currentDay.tasks.push(task);
      } else {
        let fullContent = trimmed;
        let nextIdx = i + 1;
        while (nextIdx < lines.length) {
          const nextLine = lines[nextIdx].trim();
          if (nextLine.match(/^[■□▪▫●○◆★☆]/) || nextLine.match(/^<\d{1,2}월/)) break;
          if (nextLine) fullContent += ' ' + nextLine;
          nextIdx++;
          if (nextIdx - i > 5) break;
        }
        if (hasSlash(fullContent)) {
          const task = parseWorkLine(fullContent);
          if (task) { currentDay.tasks.push(task); i = nextIdx - 1; }
        }
      }
    }
  }

  return dailyData;
};

// Extract structured fields from taskName string
export const parseJobDetails = (taskName) => {
  const requesterMatch = taskName.match(/^([가-힣]{2,4}(?:프로|TL|기정|차장|팀장|부장)?)/);
  const requester = requesterMatch ? removeTitle(requesterMatch[1]) : '';

  const floorMatch = taskName.match(/(\d+)\s*층/);
  const floor = floorMatch ? floorMatch[1] + '층' : '';

  const bayMatch = taskName.match(/([A-Z0-9]+)\s*베이/);
  const bay = bayMatch ? bayMatch[1] + '베이' : '';

  const processMatch = taskName.match(/\b(ETCH|CVD|CMP|DIFF|IMP|CLN|PHOTO)\b/);
  const process = processMatch ? processMatch[1] : '';

  const chamberMatch = taskName.match(/\b([A-Z]챔버|PM\d+|[A-Z]\s?Chamber)\b/);
  const chamber = chamberMatch ? chamberMatch[1] : '';

  const equipIdMatch = taskName.match(/([A-Za-z0-9가-힣]+\s*\d+호기)/i);
  const equipmentId = equipIdMatch ? equipIdMatch[1].toUpperCase() : '';

  const lineMatch = taskName.match(
    /(?:프로|TL|기정|차장|팀장|부장)\s*(?:\([^)]*\))?\s+([A-Z0-9][A-Za-z0-9\-]*)\s/
  );
  const line = lineMatch ? lineMatch[1] : '';

  const clientMatch = taskName.match(/\b(SEC|HYNIX|삼성|하이닉스)\b/i);
  const client = clientMatch ? clientMatch[1].toUpperCase() : '';

  return { requester, floor, bay, process, chamber, equipmentId, line, client };
};

// Infer year from month/day/dayOfWeek
const DOW_MAP = { '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3, '목요일': 4, '금요일': 5, '토요일': 6 };

export const inferDateString = (month, day, dayOfWeek) => {
  const targetDow = DOW_MAP[dayOfWeek];
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear, currentYear + 1, currentYear - 1]) {
    if (new Date(year, month - 1, day).getDay() === targetDow) {
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};
