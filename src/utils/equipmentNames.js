import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';

export const DEFAULT_EQUIPMENT_NAMES = [
  'QXP8300', 'QXP', 'Centra', 'DPS2', 'MESA', 'E-MAX', 'Endura', 'Opus',
  'Producer', 'Singen', 'SYM3', 'Tetra', 'Ultima300', 'Ultima200', 'Ultima WD',
  'Ultima W+D', 'Ultima Dome', 'VIISTA', 'Leo', 'Pursar', 'QCM', 'Sequel',
  'Altus', 'RPC', 'Altus RPC', 'Coronus', 'Excel', 'INOVA', 'Lam', 'Lam2300',
  'Speed', 'Speed200', 'Speed300', 'Strata', 'Vector', 'Supra', 'Tera',
  'Michelan', 'Michelan C3', 'Michelan C4', 'Professional', 'Indy', 'RK7',
  'RLSA', 'Trias', 'Vigus', 'Challenger', 'ULVAC', 'Stellar', 'AKRA',
  'Bluetain', 'Frosel',
];

const SETTINGS_DOC = doc(db, 'settings', 'config');

export const loadEquipmentNames = async () => {
  try {
    const snap = await getDoc(SETTINGS_DOC);
    if (snap.exists() && snap.data().equipmentNames?.length > 0) {
      return snap.data().equipmentNames;
    }
  } catch (e) { console.error(e); }
  return DEFAULT_EQUIPMENT_NAMES;
};

export const saveEquipmentNames = async (names) => {
  await setDoc(SETTINGS_DOC, { equipmentNames: names }, { merge: true });
};

// Normalize: lowercase, strip spaces/dashes/underscores/+
const norm = (s) => s.toLowerCase().replace(/[\s\-_+]/g, '');

// Character bigram Dice coefficient
const dice = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bg = (s) => {
    const set = new Set();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bg(a), bb = bg(b);
  if (ba.size === 0 || bb.size === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const x of ba) if (bb.has(x)) inter++;
  return (2 * inter) / (ba.size + bb.size);
};

// Find best matching equipment name for a given word/phrase
const findBestMatch = (word, equipmentNames) => {
  const nw = norm(word);
  if (nw.length < 2) return null;

  let best = null, bestScore = 0;
  for (const equip of equipmentNames) {
    const ne = norm(equip);
    if (nw === ne) return equip;

    // Prefix / substring
    if (ne.startsWith(nw) || nw.startsWith(ne)) {
      const score = Math.min(nw.length, ne.length) / Math.max(nw.length, ne.length);
      if (score >= 0.7 && score > bestScore) { best = equip; bestScore = score; }
      continue;
    }
    // Dice
    const s = dice(nw, ne);
    if (s >= 0.8 && s > bestScore) { best = equip; bestScore = s; }
  }
  return best;
};

// Extract equipment model name from a job record
export const extractEquipModel = (job, equipmentNames) => {
  let text = job.taskName || '';

  // Strip requester prefix
  text = text.replace(/^[가-힣]{2,4}(?:프로|TL|기정|차장|팀장|부장님|부장)?\s*(?:\([^)]*\))?\s*/, '');
  // Strip line identifier
  if (job.line) text = text.replace(new RegExp('^' + job.line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*', 'i'), '');
  // Strip structural tokens
  text = text
    .replace(/\d+층\s*/g, '')
    .replace(/[A-Z0-9]+베이\s*/gi, '')
    .replace(/[A-Z]\s*챔버\s*/gi, '')
    .replace(/\d+호기\s*/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\b(Wall|PM|Kit|현장수급)\b/gi, '');

  const tokens = text.trim().split(/[\s\-_,]+/).filter(t => t.length >= 2);
  // Also check adjacent pairs for multi-word names (e.g. "Michelan C3")
  const candidates = [...tokens];
  for (let i = 0; i < tokens.length - 1; i++) {
    candidates.push(tokens[i] + ' ' + tokens[i + 1]);
  }

  for (const cand of candidates) {
    const match = findBestMatch(cand, equipmentNames);
    if (match) return match;
  }

  // Fallback: first meaningful uppercase-starting token
  return tokens.find(t => t.length >= 3 && /^[A-Z]/i.test(t)) || '';
};
