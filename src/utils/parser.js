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

// 8대 공정명
const PROCESS_RE = /\b(ETCH|CVD|PVD|PHOTO|DIFF|IMP|ALD|METAL|CMP|CLN)\b/i;

// 등록된 장비 모델명 (정규화 후 Set)
const _normE = (s) => s.toLowerCase().replace(/[\s\-_+\/]/g, '');
const KNOWN_EQUIP = new Set([
  'qxp8300','qxp','centra','dps2','mesa','emax','endura','opus',
  'producer','singen','sym3','tetra','ultima300','ultima200','ultimawd',
  'ultimadome','viista','leo','pursar','qcm','sequel','altus','rpc',
  'altusrpc','coronus','excel','inova','lam','lam2300','speed','speed200',
  'speed300','strata','vector','supra','tera','michelan','michelanc3',
  'michelanc4','professional','indy','rk7','rlsa','trias','vigus',
  'challenger','ulvac','stellar','akra','bluetain','frosel',
]);
const isKnownEquip = (tok) => {
  const n = _normE(tok);
  if (n.length < 3) return false;
  if (KNOWN_EQUIP.has(n)) return true;
  for (const m of KNOWN_EQUIP)
    if (m.length >= 4 && n.length >= 4 &&
        (n.startsWith(m.slice(0,4)) || m.startsWith(n.slice(0,4)))) return true;
  return false;
};

// 역순 파싱 헬퍼
const isChamberDetail = (t) =>
  /^PM\d/i.test(t) || /^ch\d/i.test(t) || /챔버$/i.test(t) ||
  /^(T\/M|TM|L\/L|LL|Wall|LID|Dome)$/i.test(t);
const isUnitNumber = (t) => /^\d+$/.test(t) || /^\d+호기/.test(t);

// Extract structured fields from taskName string (역순 파싱)
export const parseJobDetails = (taskName) => {
  const requesterMatch = taskName.match(/^([가-힣]{2,4}(?:프로|TL|기정|차장|팀장|부장)?)/);
  const requester = requesterMatch ? removeTitle(requesterMatch[1]) : '';

  const floorMatch = taskName.match(/(\d+)\s*층/);
  const floor = floorMatch ? floorMatch[1] + '층' : '';

  const bayMatch = taskName.match(/([A-Z0-9]+)\s*베이/i);
  const bay = bayMatch ? bayMatch[1].toUpperCase() + '베이' : '';

  const lineMatch = taskName.match(
    /(?:프로|TL|기정|차장|팀장|부장)\s*(?:\([^)]*\))?\s+([A-Z0-9][A-Za-z0-9\-]*)\s/
  );
  const line = lineMatch ? lineMatch[1] : '';

  const clientMatch = taskName.match(/\b(SEC|HYNIX|삼성|하이닉스)\b/i);
  const client = clientMatch ? clientMatch[1].toUpperCase() : '';

  // 장비 섹션: 공정명이 있으면 공정명부터, 없으면 라인명 이후부터
  const procMatch = taskName.match(PROCESS_RE);
  let equipSection = '';
  if (procMatch) {
    equipSection = taskName.slice(procMatch.index);
  } else if (lineMatch) {
    equipSection = taskName.slice(lineMatch.index + lineMatch[0].length);
  } else {
    equipSection = taskName;
  }

  // 괄호/층/베이/기둥 제거, PM2,3 같은 콤마 구분 챔버번호는 "PM2 PM3"으로 전개
  const cleanSection = equipSection
    .replace(/\([^)]*\)/g, '')
    .replace(/\d+층/g, '')
    .replace(/[A-Z0-9]+베이/gi, '')
    .replace(/[A-Za-z]\d*기둥/gi, '')
    .replace(/\b(PM\d+(?:,\s*\d+)+)/gi, (m) => {
      // "PM2, 3, 4" → "PM2 PM3 PM4"
      const nums = m.replace(/PM/gi, '').split(/,\s*/);
      return nums.map(n => 'PM' + n.trim()).join(' ');
    })
    .replace(/,/g, ' ')
    .trim();
  const tokens = cleanSection.split(/\s+/).filter(Boolean);

  // ── 역순 파싱 ──
  let right = tokens.length - 1;

  // Phase 1: 챔버 세부명칭 (PM1, ch1, A챔버, T/M 등) - 오른쪽에서
  const chamberParts = [];
  while (right >= 0 && isChamberDetail(tokens[right])) {
    chamberParts.unshift(tokens[right]);
    right--;
  }
  const chamber = chamberParts.join(', ');

  // Phase 2: 호기 번호 (숫자 또는 숫자호기)
  if (right >= 0 && isUnitNumber(tokens[right])) {
    right--;
  }

  // Phase 3: 호기 영문명칭 (순수 알파벳)
  // - 호기번호가 있었으면 → 무조건 호기명
  // - 호기번호가 없어도 → 등록 장비명이 아니면 호기명 (영업팀 미기재 케이스)
  if (right >= 0) {
    const tok = tokens[right];
    const hadUnitNum = tokens[right + 1] !== undefined && isUnitNumber(tokens[right + 1]);
    const isPureAlpha = /^[A-Za-z]+$/.test(tok);
    // 호기번호가 있었으면 무조건 호기명.
    // 호기번호가 없어도 등록 장비명이 아니면 호기명 (영업팀 미기재 케이스).
    // 단, 등록 장비명(ULTIMA 등)은 장비명으로 유지.
    if (isPureAlpha && (hadUnitNum || !isKnownEquip(tok))) {
      right--;
    }
  }

  // Phase 4: 나머지 왼쪽 = 공정명 + 장비명 [+ 장비세부명칭]
  const remaining = tokens.slice(0, right + 1);
  let process = '';
  const equipParts = [];
  for (const tok of remaining) {
    if (!process && PROCESS_RE.test(tok)) {
      process = tok.toUpperCase();
    } else if (/^[A-Za-z]/.test(tok)) {
      equipParts.push(tok.toUpperCase());
    }
  }
  const equipmentId = equipParts.join(' ');

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
