const FIXED_HOLIDAYS = [
  { month: 1,  day: 1,  name: '신정' },
  { month: 3,  day: 1,  name: '삼일절' },
  { month: 5,  day: 5,  name: '어린이날' },
  { month: 6,  day: 6,  name: '현충일' },
  { month: 8,  day: 15, name: '광복절' },
  { month: 10, day: 3,  name: '개천절' },
  { month: 10, day: 9,  name: '한글날' },
  { month: 12, day: 25, name: '크리스마스' },
];

const VARIABLE_HOLIDAYS = {
  2025: [
    { month: 1,  day: 28, name: '설날 연휴' },
    { month: 1,  day: 29, name: '설날' },
    { month: 1,  day: 30, name: '설날 연휴' },
    { month: 3,  day: 3,  name: '삼일절 대체공휴일' },
    { month: 5,  day: 5,  name: '석가탄신일' },
    { month: 10, day: 5,  name: '추석 연휴' },
    { month: 10, day: 6,  name: '추석' },
    { month: 10, day: 7,  name: '추석 연휴' },
    { month: 10, day: 8,  name: '추석 대체공휴일' },
  ],
  2026: [
    { month: 1,  day: 28, name: '설날 연휴' },
    { month: 1,  day: 29, name: '설날' },
    { month: 1,  day: 30, name: '설날 연휴' },
    { month: 3,  day: 2,  name: '삼일절 대체공휴일' },
    { month: 5,  day: 24, name: '석가탄신일' },
    { month: 5,  day: 25, name: '석가탄신일 대체공휴일' },
    { month: 8,  day: 17, name: '광복절 대체공휴일' },
    { month: 9,  day: 24, name: '추석 연휴' },
    { month: 9,  day: 25, name: '추석' },
    { month: 9,  day: 26, name: '추석 연휴' },
    { month: 9,  day: 28, name: '추석 대체공휴일' },
    { month: 10, day: 5,  name: '개천절 대체공휴일' },
  ],
  2027: [
    { month: 2,  day: 16, name: '설날 연휴' },
    { month: 2,  day: 17, name: '설날' },
    { month: 2,  day: 18, name: '설날 연휴' },
    { month: 5,  day: 13, name: '석가탄신일' },
    { month: 6,  day: 7,  name: '현충일 대체공휴일' },
    { month: 8,  day: 16, name: '광복절 대체공휴일' },
    { month: 10, day: 3,  name: '추석 연휴' },
    { month: 10, day: 4,  name: '추석' },
    { month: 10, day: 5,  name: '추석 연휴' },
    { month: 10, day: 6,  name: '개천절·추석 대체공휴일' },
    { month: 10, day: 11, name: '한글날 대체공휴일' },
  ],
};

const DAY_OF_WEEK_MAP = {
  '일요일': 0, '월요일': 1, '화요일': 2, '수요일': 3,
  '목요일': 4, '금요일': 5, '토요일': 6,
};

const inferYear = (month, day, dayOfWeekStr) => {
  const targetDow = DAY_OF_WEEK_MAP[dayOfWeekStr];
  if (targetDow === undefined) return new Date().getFullYear();
  const currentYear = new Date().getFullYear();
  for (const year of [currentYear, currentYear + 1, currentYear - 1]) {
    if (new Date(year, month - 1, day).getDay() === targetDow) return year;
  }
  return currentYear;
};

export const getHolidayName = (month, day, dayOfWeekStr) => {
  const year = inferYear(month, day, dayOfWeekStr);
  const fixed = FIXED_HOLIDAYS.find(h => h.month === month && h.day === day);
  if (fixed) return fixed.name;
  const variable = (VARIABLE_HOLIDAYS[year] || []).find(h => h.month === month && h.day === day);
  return variable ? variable.name : null;
};

export const isKoreanHoliday = (dateStr) => {
  const d = new Date(dateStr);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  const fixed = FIXED_HOLIDAYS.find(h => h.month === month && h.day === day);
  if (fixed) return true;
  const variable = (VARIABLE_HOLIDAYS[year] || []).find(h => h.month === month && h.day === day);
  return !!variable;
};

export const isSpecialWork = (dateStr) => {
  const d = new Date(dateStr);
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return true;
  return isKoreanHoliday(dateStr);
};
