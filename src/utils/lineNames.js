import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

// { name: 표시명, aliases: 동일 취급 별칭, sublines: 세부라인 (P2 안의 S5/V2 등) }
export const DEFAULT_LINES = [
  // Samsung
  { name: '5L',   aliases: ['5'] },
  { name: '6L',   aliases: ['6'] },
  { name: '7L',   aliases: ['7'] },
  { name: '8L',   aliases: ['8'] },
  { name: '9L',   aliases: ['9'] },
  { name: '8-1L', aliases: ['8-1', '81L', '81'] },
  { name: '8-2L', aliases: ['8-2', '82L', '82'] },
  { name: '8-3L', aliases: ['8-3', '83L', '83'] },
  { name: 'S1L',  aliases: ['S1'] },
  { name: '10L',  aliases: ['10', 'M1'],      sublines: ['M1'] },
  { name: '11L',  aliases: ['11', 'U1', 'S4'], sublines: ['U1', 'S4'] },
  { name: '12L',  aliases: ['12'] },
  { name: '13L',  aliases: ['13'] },
  { name: '15L',  aliases: ['15', 'U2'],       sublines: ['U2'] },
  { name: '16L',  aliases: ['16', 'U3'],       sublines: ['U3'] },
  { name: '17L',  aliases: ['17', 'U4', 'S3'], sublines: ['U4', 'S3'] },
  { name: '18L',  aliases: ['18', 'EUV', 'V1'], sublines: ['EUV', 'V1'] },
  { name: 'NRD',  aliases: [] },
  { name: 'P1',   aliases: ['P1L'] },
  { name: 'P2',   aliases: ['P2L'], sublines: ['S5', 'V2'] },
  { name: 'P3',   aliases: ['P3L'], sublines: ['S5'] },
  { name: 'P4',   aliases: ['P4L'] },
  // SK Hynix
  { name: 'M11',  aliases: [] },
  { name: 'M12',  aliases: [] },
  { name: 'M14',  aliases: [] },
  { name: 'M15',  aliases: [] },
  { name: 'M16',  aliases: [] },
  { name: 'M10A', aliases: [] },
  { name: 'M10C', aliases: [] },
  // DB Hitek
  { name: 'DB',   aliases: ['DB-Hitek', 'DBHitek', 'DB하이텍'] },
  // External
  { name: '이지솔루션', aliases: [] },
  { name: '원익IPS',   aliases: ['원익'] },
  { name: '주성',      aliases: [] },
  { name: 'VTE코리아', aliases: ['VTE'] },
];

const SETTINGS_DOC = doc(db, 'settings', 'config');

export const loadLines = async () => {
  try {
    const snap = await getDoc(SETTINGS_DOC);
    if (snap.exists() && snap.data().lines?.length > 0) {
      return snap.data().lines;
    }
  } catch (e) { console.error(e); }
  return DEFAULT_LINES;
};

export const saveLines = async (lines) => {
  await setDoc(SETTINGS_DOC, { lines }, { merge: true });
};

// Normalize for comparison: lowercase, strip trailing L, strip spaces/dashes/underscores
const normStr = (s) => (s || '').toLowerCase().replace(/l$/i, '').replace(/[\s\-_]/g, '');

// Escape special regex chars
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Search taskName directly for any known line name (fallback when job.line is empty)
const findLineInText = (text, linesList) => {
  const sorted = [...linesList].sort((a, b) => b.name.length - a.name.length);
  for (const line of sorted) {
    const re = new RegExp('(?:^|[\\s])' + escRe(line.name) + 'L?(?:[\\s]|$)', 'i');
    if (re.test(text)) {
      for (const sub of (line.sublines || [])) {
        const subRe = new RegExp('(?:^|[\\s,\\(])' + escRe(sub) + '(?:[\\s,\\)]|$)', 'i');
        if (subRe.test(text)) return `${line.name}(${sub})`;
      }
      return line.name;
    }
  }
  return '';
};

// Resolve display name for a job, e.g. "P2L" → "P2", "S5" → "P2(S5)"
export const getDisplayLine = (job, linesList) => {
  const lineStr = (job.line || '').trim();
  const taskText = job.taskName || '';
  if (!lineStr) return findLineInText(taskText, linesList);

  const nl = normStr(lineStr);

  // ── Step 1: lineStr is a direct line name or alias ──
  for (const line of linesList) {
    const allNames = [line.name, ...(line.aliases || [])];
    if (allNames.some(n => normStr(n) === nl)) {
      // Check if any sub-line appears in the task text
      for (const sub of (line.sublines || [])) {
        const re = new RegExp('(?:^|[\\s,\\(])' + escRe(sub) + '(?:[\\s,\\)]|$)', 'i');
        if (re.test(taskText)) return `${line.name}(${sub})`;
      }
      return line.name;
    }
  }

  // ── Step 2: lineStr is itself a sub-line ──
  const parents = linesList.filter(line =>
    (line.sublines || []).some(s => normStr(s) === nl)
  );

  if (parents.length === 1) {
    // Unambiguous
    return `${parents[0].name}(${lineStr})`;
  }
  if (parents.length > 1) {
    // Check task text for parent name clue
    for (const parent of parents) {
      const pNames = [parent.name, ...(parent.aliases || [])];
      const found = pNames.some(n => new RegExp('(?:^|[\\s])' + escRe(n) + 'L?(?:[\\s]|$)', 'i').test(taskText));
      if (found) return `${parent.name}(${lineStr})`;
    }
    // Ambiguous — just show sub-line as-is
    return lineStr;
  }

  // ── Step 3: Fallback — strip trailing L ──
  return lineStr.replace(/L$/i, '') || lineStr;
};
