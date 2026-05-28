// Parse "HH:MM" → minutes since midnight
const toMinutes = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + (m || 0);
};

// Minutes to "H:MM" display string
export const formatMinutes = (mins) => {
  const h = Math.floor(Math.abs(mins) / 60);
  const m = Math.abs(mins) % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
};

// Calculate total actual work hours from time entries
export const calcTotalHours = (entry1, exit1, entry2, exit2, travelMinutes = 10) => {
  let total = 0;
  if (entry1 && exit1) {
    total += toMinutes(exit1) - toMinutes(entry1);
  }
  if (entry2 && exit2) {
    total += toMinutes(exit2) - toMinutes(entry2);
  }
  total -= travelMinutes;
  return Math.max(0, total / 60);
};

// Night shift: exit time is after 18:00 on a weekday
export const isNightShift = (exitTime1, exitTime2) => {
  const exitMins = exitTime2
    ? toMinutes(exitTime2)
    : toMinutes(exitTime1);
  return exitMins > 18 * 60;
};

// Format date string to Korean display
export const formatDateKo = (dateStr) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${days[d.getDay()]})`;
};

// Get YYYY-MM for a date string
export const getYearMonth = (dateStr) => {
  if (!dateStr) return '';
  return dateStr.substring(0, 7);
};

// Today as YYYY-MM-DD
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Format hours decimal to display string
export const formatHours = (h) => {
  if (!h && h !== 0) return '-';
  const hours = Math.floor(h);
  const mins = Math.round((h - hours) * 60);
  if (mins === 0) return `${hours}시간`;
  return `${hours}시간 ${mins}분`;
};
