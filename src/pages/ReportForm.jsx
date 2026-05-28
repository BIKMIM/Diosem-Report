import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  doc, getDoc, addDoc, updateDoc, collection,
  query, where, getDocs, serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { calcTotalHours, isNightShift, formatHours, formatDateKo, roundEntryTime, roundExitTime } from '../utils/timeCalc';
import { isSpecialWork } from '../utils/holidays';

const CHAMBER_STATUS_GROUPS = [
  { label: '표면 종류', options: ['일반 알루미늄', '아노다이징', 'SUS', '나이트라이드', '세라믹'] },
  { label: '점착 / 오염', options: ['아주깨끗함', '보통', '끈적임', '잘 안지워짐', '번짐'] },
  { label: '물질 상태', options: ['가루날림', '딱딱함', '달고나'] },
  { label: '색깔', options: ['흰색', '회색', '갈색', '검은색', '노란색', '무지갯빛', '투명색'] },
  { label: '기타', options: ['무광', '아킹', '스크래치', '얼룩', '아노다이징 손상심함', 'D.I불림필요'] },
];
const DIFFICULTY_OPTIONS = [
  { value: '쉬움',   label: '쉬움',   sub: '인원 줄여도 가능' },
  { value: '보통',   label: '보통',   sub: '일반적인 작업' },
  { value: '어려움', label: '어려움', sub: '연속해서 가기 힘듦' },
];

const defaultForm = {
  entryTime1: '', exitTime1: '', entryTime2: '', exitTime2: '',
  chamberStatus: [],
  difficulty: '',
  notes: ''
};

const chipBtn = (selected) => ({
  padding: '7px 12px',
  border: `2px solid ${selected ? 'var(--primary)' : 'var(--gray-200)'}`,
  borderRadius: 20,
  background: selected ? 'var(--primary-light)' : 'white',
  color: selected ? 'var(--primary)' : 'var(--gray-700)',
  fontWeight: selected ? 700 : 400,
  fontSize: 13,
  cursor: 'pointer',
  transition: 'all 0.15s'
});

// 그룹 구분 다중 선택 버튼 그룹
const MultiSelectGroup = ({ groups, value = [], onChange }) => (
  <div>
    {groups.map(group => (
      <div key={group.label} style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: 1, marginBottom: 6 }}>
          {group.label}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {group.options.map(opt => {
            const selected = value.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(selected ? value.filter(v => v !== opt) : [...value, opt])}
                style={chipBtn(selected)}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    ))}
  </div>
);

// 버튼 그룹 컴포넌트 (value가 ''이면 미선택 상태)
const ButtonGroup = ({ options, value, onChange }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    {options.map(opt => {
      const selected = value === opt;
      return (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            flex: 1,
            padding: '11px 8px',
            border: `2px solid ${selected ? 'var(--primary)' : 'var(--gray-200)'}`,
            borderRadius: 8,
            background: selected ? 'var(--primary-light)' : 'white',
            color: selected ? 'var(--primary)' : 'var(--gray-700)',
            fontWeight: selected ? 700 : 400,
            fontSize: 14,
            cursor: 'pointer',
            transition: 'all 0.15s'
          }}
        >
          {opt}
        </button>
      );
    })}
  </div>
);


const ReportHistoryRow = ({ r, i, total, showChamber }) => (
  <div style={{
    paddingTop: i > 0 ? 10 : 0, paddingBottom: 10,
    borderBottom: i < total - 1 ? '1px solid var(--gray-100)' : 'none'
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
      <span style={{ fontWeight: 700, fontSize: 13 }}>{r.workerName}</span>
      {showChamber && r.chamber && (
        <span style={{ fontSize: 12, color: 'var(--gray-500)', background: 'var(--gray-100)', padding: '1px 7px', borderRadius: 8 }}>{r.chamber}</span>
      )}
      {r.totalHours > 0 && (
        <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>{Math.floor(r.totalHours)}시간{Math.round((r.totalHours % 1) * 60) > 0 ? ` ${Math.round((r.totalHours % 1) * 60)}분` : ''}</span>
      )}
    </div>
    {r.chamberStatus?.length > 0 && (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: r.notes ? 6 : 0 }}>
        {r.chamberStatus.map(s => (
          <span key={s} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 10, fontWeight: 600 }}>{s}</span>
        ))}
      </div>
    )}
    {r.notes && (
      <div style={{ fontSize: 12, color: 'var(--gray-700)', background: 'var(--gray-100)', padding: '6px 10px', borderRadius: 6, borderLeft: '3px solid var(--primary)' }}>
        {r.notes}
      </div>
    )}
  </div>
);

// 크로스플랫폼 시간 입력 (iOS 휠 / Android 시계 대신 숫자 키패드)
const TimeInput = ({ value, onChange, hasError }) => {
  const handleChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
    if (digits.length >= 3) onChange(digits.slice(0, 2) + ':' + digits.slice(2));
    else onChange(digits);
  };
  const handleKey = (e) => {
    if (e.key === 'Backspace' && value && value[value.length - 1] === ':') {
      e.preventDefault();
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div style={{ position: 'relative' }}>
      <input
        type="text"
        inputMode="numeric"
        className="form-input"
        value={value}
        onChange={handleChange}
        onKeyDown={handleKey}
        placeholder="HH:MM"
        maxLength={5}
        style={{
          paddingRight: value ? 36 : undefined,
          borderColor: hasError ? '#dc2626' : undefined,
          background: hasError ? '#fef2f2' : undefined,
        }}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            background: 'none', border: 'none', color: 'var(--gray-400)',
            fontSize: 20, lineHeight: 1, cursor: 'pointer', padding: '4px',
          }}
        >×</button>
      )}
    </div>
  );
};

const stampBtnStyle = (filled, secondary) => ({
  width: '100%', padding: '13px 8px', borderRadius: 8, border: 'none', cursor: 'pointer',
  fontWeight: 700, fontSize: 14, marginBottom: 6,
  background: filled
    ? 'var(--gray-100)'
    : secondary ? 'var(--gray-200)' : 'var(--primary)',
  color: filled
    ? 'var(--gray-600)'
    : secondary ? 'var(--gray-600)' : 'white',
});

const TimeStampRow = ({
  entryVal, exitVal, onEntry, onExit,
  onEntryChange, onExitChange,
  roundedEntry, roundedExit, suggestedExit, countdown,
  rawEntry, rawExit, secondary, entryError
}) => (
  <div className="time-row" style={{ alignItems: 'flex-start' }}>
    <div style={{ flex: 1 }}>
      <button type="button" style={stampBtnStyle(!!entryVal, secondary)} onClick={onEntry}>
        {entryVal ? '입실 수정' : '입실 기록'}
      </button>
      <TimeInput value={entryVal} onChange={onEntryChange} hasError={!!entryError} />
      {roundedEntry && !entryError && (
        <div style={{ marginTop: 5, textAlign: 'center' }}>
          {rawEntry && (
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 2 }}>태그 {rawEntry}</div>
          )}
          <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>기록: {roundedEntry}</div>
        </div>
      )}
      {entryError && (
        <div style={{
          marginTop: 6, padding: '6px 8px', background: '#fef2f2',
          border: '1px solid #fca5a5', borderRadius: 6,
          fontSize: 12, color: '#dc2626', fontWeight: 600, textAlign: 'center', lineHeight: 1.4
        }}>
          ⚠ {entryError}
        </div>
      )}
    </div>
    <div style={{ flex: 1 }}>
      <button type="button" style={stampBtnStyle(!!exitVal, secondary)} onClick={onExit}>
        {exitVal ? '퇴실 수정' : '퇴실 기록'}
      </button>
      <TimeInput value={exitVal} onChange={onExitChange} />
      {roundedExit && (
        <div style={{ marginTop: 5, textAlign: 'center' }}>
          {rawExit && (
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 2 }}>태그 {rawExit}</div>
          )}
          <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600 }}>기록: {roundedExit}</div>
        </div>
      )}
      {suggestedExit && !exitVal && (
        <div style={{
          fontSize: 13, fontWeight: 700, color: '#b45309',
          marginTop: 6, textAlign: 'center',
          background: '#fef3c7', borderRadius: 6, padding: '5px 8px',
          lineHeight: 1.5
        }}>
          권장 퇴실 {suggestedExit}
          {countdown && (
            <div style={{ fontSize: 12, fontWeight: 400, color: countdown === '지남' ? '#dc2626' : '#92400e', marginTop: 1 }}>
              {countdown}
            </div>
          )}
        </div>
      )}
    </div>
  </div>
);

export default function ReportForm() {
  const { jobId } = useParams();
  const { currentUser, workerProfile } = useAuth();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [existingReport, setExistingReport] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [sameChamberReports, setSameChamberReports] = useState([]);
  const [sameEquipReports, setSameEquipReports] = useState([]);
  const [historyPopupDismissed, setHistoryPopupDismissed] = useState(
    () => !!sessionStorage.getItem(`histD_${jobId}`)
  );
  const [jobInfoOpen, setJobInfoOpen] = useState(false);
  const [targetMins, setTargetMins] = useState(300);
  const [lunchBreak, setLunchBreak] = useState(false);
  const [lunchMins, setLunchMins] = useState(30);
  const [now, setNow] = useState(new Date());
  const [rawTimes, setRawTimes] = useState({ entry1: '', exit1: '', entry2: '', exit2: '' });
  const [autoSaveStatus, setAutoSaveStatus] = useState('');
  const reportIdRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const userTouched = useRef(false);

  useEffect(() => { loadData(); }, [jobId]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // 작업 정보
      const jobSnap = await getDoc(doc(db, 'jobs', jobId));
      if (!jobSnap.exists()) { setError('작업을 찾을 수 없습니다.'); return; }
      const jobData = jobSnap.data();
      setJob({ id: jobSnap.id, ...jobData });
      setTargetMins((jobData.workHours || 5) * 60);

      // 기존 보고서
      const rSnap = await getDocs(
        query(collection(db, 'reports'),
          where('jobId', '==', jobId),
          where('workerId', '==', currentUser.uid))
      );
      if (!rSnap.empty) {
        const r = { id: rSnap.docs[0].id, ...rSnap.docs[0].data() };
        reportIdRef.current = r.id;
        setExistingReport(r);
        setForm({ ...defaultForm, ...r });
      }

      // 동일 장비/챔버 이력 (equipmentId + line 둘 다 조회 후 합산)
      // equipmentId는 대문자 정규화 + 원본 둘 다 조회 (기존 데이터 호환)
      const normEqId = (s) => (s || '').toUpperCase().trim();
      const eqIdRaw = jobData.equipmentId || '';
      const eqIdNorm = normEqId(eqIdRaw);
      const eqIdSet = [...new Set([eqIdRaw, eqIdNorm].filter(Boolean))];
      const eqLine = jobData.line;
      if (eqIdSet.length || eqLine) {
        const seen = new Map();
        for (const qId of eqIdSet) {
          const snap = await getDocs(query(collection(db, 'reports'), where('equipmentId', '==', qId)));
          snap.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() }));
        }
        if (eqLine) {
          const snap = await getDocs(query(collection(db, 'reports'), where('line', '==', eqLine)));
          snap.docs.forEach(d => seen.set(d.id, { id: d.id, ...d.data() }));
        }
        // 라인 조회 결과에서 장비명 유사 여부로 추가 필터 (대소문자·오타 허용)
        if (eqIdNorm) {
          seen.forEach((r, key) => {
            const rEqNorm = normEqId(r.equipmentId);
            // 저장된 equipmentId가 있고 완전히 다른 장비면 line만으로 매칭된 건 제외
            if (r.equipmentId && rEqNorm !== eqIdNorm) {
              // 앞 4글자(장비 모델명)가 겹치면 유사 장비로 간주, 아니면 제거
              const prefix = eqIdNorm.slice(0, 4);
              if (prefix.length >= 4 && !rEqNorm.startsWith(prefix)) {
                seen.delete(key);
              }
            }
          });
        }

        // 챔버 정규화: "B챔버" → "B"
        const normChamber = (c) => (c || '').replace(/챔버$/i, '').trim().toUpperCase();
        const jobChamber = normChamber(jobData.chamber);

        const all = [...seen.values()]
          .filter(r => r.jobId !== jobId)
          .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

        // 같은 챔버: 가장 최근 날짜 전체
        const sameCh = all.filter(r => jobChamber && normChamber(r.chamber) === jobChamber);
        const latestSameCh = sameCh[0]?.date;
        setSameChamberReports(latestSameCh ? sameCh.filter(r => r.date === latestSameCh) : []);

        // 같은 장비 다른 챔버: 가장 최근 날짜 전체
        const diffCh = all.filter(r => !jobChamber || normChamber(r.chamber) !== jobChamber);
        const latestDiffCh = diffCh[0]?.date;
        setSameEquipReports(latestDiffCh ? diffCh.filter(r => r.date === latestDiffCh) : []);
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const set = (key, val) => {
    userTouched.current = true;
    setForm(f => ({ ...f, [key]: val }));
  };

  const rawKeyMap = { entryTime1: 'entry1', exitTime1: 'exit1', entryTime2: 'entry2', exitTime2: 'exit2' };
  const stampNow = (field) => {
    const t = new Date();
    const hh = String(t.getHours()).padStart(2, '0');
    const mm = String(t.getMinutes()).padStart(2, '0');
    const ss = String(t.getSeconds()).padStart(2, '0');
    set(field, `${hh}:${mm}`);
    const rk = rawKeyMap[field];
    if (rk) setRawTimes(r => ({ ...r, [rk]: `${hh}:${mm}:${ss}` }));
  };
  const clearRaw = (field) => {
    const rk = rawKeyMap[field];
    if (rk) setRawTimes(r => ({ ...r, [rk]: '' }));
  };

  const toMins = (t) => {
    if (!t) return null;
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const minsToTime = (mins) => {
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  };
  const fmtTargetHours = (mins) => {
    const hrs = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${hrs}시간` : `${hrs}시간 ${m}분`;
  };

  const performAutoSave = async (formData) => {
    if (!job || !currentUser || !workerProfile) return;
    try {
      const r = {
        entry1: roundEntryTime(formData.entryTime1),
        exit1: roundExitTime(formData.exitTime1),
        entry2: roundEntryTime(formData.entryTime2),
        exit2: roundExitTime(formData.exitTime2),
      };
      const data = {
        ...formData,
        entryTime1: r.entry1, exitTime1: r.exit1, entryTime2: r.entry2, exitTime2: r.exit2,
        jobId, workerId: currentUser.uid, workerName: workerProfile.name,
        date: job.date, taskName: job.taskName, requester: job.requester,
        line: job.line, equipmentId: job.equipmentId, chamber: job.chamber,
        isNight: isNightShift(r.exit1, r.exit2),
        isSpecial: isSpecialWork(job.date),
        totalHours: calcTotalHours(r.entry1, r.exit1, r.entry2, r.exit2),
        updatedAt: serverTimestamp()
      };
      if (reportIdRef.current) {
        await updateDoc(doc(db, 'reports', reportIdRef.current), data);
      } else {
        const docRef = await addDoc(collection(db, 'reports'), { ...data, submittedAt: serverTimestamp() });
        reportIdRef.current = docRef.id;
        setExistingReport({ id: docRef.id, ...formData });
      }
      setAutoSaveStatus('saved');
      setTimeout(() => setAutoSaveStatus(s => s === 'saved' ? '' : s), 2000);
    } catch {
      setAutoSaveStatus('');
    }
  };

  useEffect(() => {
    if (!userTouched.current || loading || !job) return;
    setAutoSaveStatus('saving');
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => performAutoSave(form), 800);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [form]);

  const rounded = {
    entry1: roundEntryTime(form.entryTime1),
    exit1: roundExitTime(form.exitTime1),
    entry2: roundEntryTime(form.entryTime2),
    exit2: roundExitTime(form.exitTime2),
  };
  const totalHours = calcTotalHours(rounded.entry1, rounded.exit1, rounded.entry2, rounded.exit2);
  const nightShift = isNightShift(rounded.exit1, rounded.exit2);
  const specialWork = job ? isSpecialWork(job.date) : false;

  const LUNCH_START_MINS = 12 * 60 + 50;
  // If exit1 already recorded, use that as lunch start instead of fixed 12:50
  const lunchStartMins = lunchBreak && rounded.exit1 ? toMins(rounded.exit1) : LUNCH_START_MINS;
  const lunchStartStr = lunchBreak && rounded.exit1 ? rounded.exit1 : '12:50';

  const session1Mins = (toMins(rounded.exit1) !== null && toMins(rounded.entry1) !== null)
    ? Math.max(0, toMins(rounded.exit1) - toMins(rounded.entry1))
    : 0;

  // When lunch on and exit1 not yet recorded, estimate session 1 as entry1 → lunchStart
  const session1ForCalc = lunchBreak && !rounded.exit1 && rounded.entry1
    ? Math.max(0, lunchStartMins - toMins(rounded.entry1))
    : session1Mins;

  const suggestedExit1 = lunchBreak && rounded.entry1
    ? lunchStartStr
    : rounded.entry1 ? minsToTime(toMins(rounded.entry1) + targetMins) : null;

  const lunchEndMins = lunchStartMins + lunchMins;
  const lunchEndStr = minsToTime(lunchEndMins);

  const suggestedExit2 = rounded.entry2
    ? minsToTime(toMins(rounded.entry2) + Math.max(0, targetMins - session1ForCalc))
    : null;

  // When lunch on but 2차 not yet started — show overall predicted exit
  const predictedFinalExit = lunchBreak && rounded.entry1 && !rounded.entry2
    ? minsToTime(lunchEndMins + Math.max(0, targetMins - session1ForCalc))
    : null;

  // 2차 입실이 1차 퇴실보다 이전이면 입력 오류
  const entry2Error = rounded.entry2 && rounded.exit1 && toMins(rounded.entry2) < toMins(rounded.exit1)
    ? `1차 퇴실(${rounded.exit1}) 이전 시간입니다`
    : null;

  const nowSecs = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const countdown = (timeStr) => {
    if (!timeStr) return null;
    const [h, m] = timeStr.split(':').map(Number);
    const diff = h * 3600 + m * 60 - nowSecs;
    if (diff <= 0) return '지남';
    const hrs = Math.floor(diff / 3600);
    const mins = Math.floor((diff % 3600) / 60);
    const secs = diff % 60;
    if (hrs > 0) return `${hrs}시간 ${mins}분 후`;
    if (mins > 0) return `${mins}분 ${secs}초 후`;
    return `${secs}초 후`;
  };

  const handleSubmit = async () => {
    if (!form.entryTime1 || !form.exitTime1)
      return setError('입실/퇴실 시간을 입력해주세요.');
    if (entry2Error)
      return setError(`2차 입실 시간 오류: ${entry2Error}. 올바른 시간을 입력해주세요.`);
    if (!form.difficulty)
      return setError('작업 난이도를 선택해주세요.');
    setError('');
    setSaving(true);
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    try {
      const data = {
        ...form,
        entryTime1: rounded.entry1,
        exitTime1: rounded.exit1,
        entryTime2: rounded.entry2,
        exitTime2: rounded.exit2,
        jobId,
        workerId: currentUser.uid,
        workerName: workerProfile.name,
        date: job.date,
        taskName: job.taskName,
        requester: job.requester,
        line: job.line,
        equipmentId: job.equipmentId,
        chamber: job.chamber,
        isNight: nightShift,
        isSpecial: specialWork,
        totalHours,
        updatedAt: serverTimestamp()
      };

      if (reportIdRef.current) {
        await updateDoc(doc(db, 'reports', reportIdRef.current), data);
      } else {
        const docRef = await addDoc(collection(db, 'reports'), { ...data, submittedAt: serverTimestamp() });
        reportIdRef.current = docRef.id;
      }
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Layout title="보고서 작성"><div className="loading">불러오는 중...</div></Layout>;
  if (!job) return <Layout title="보고서 작성"><div className="alert alert-error">{error || '작업 없음'}</div></Layout>;

  return (
    <Layout title="보고서 작성">
      {success && <div className="alert alert-success">✅ 보고서가 제출되었습니다!</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <div style={{ textAlign: 'right', fontSize: 12, minHeight: 18, marginBottom: 2 }}>
        {autoSaveStatus === 'saving' && <span style={{ color: 'var(--gray-400)' }}>저장 중...</span>}
        {autoSaveStatus === 'saved' && <span style={{ color: 'var(--primary)' }}>✓ 자동 저장됨</span>}
      </div>

      {/* 작업 정보 — 기본 접힘 */}
      <div className="card" style={{ cursor: 'pointer' }} onClick={() => setJobInfoOpen(o => !o)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginBottom: 3 }}>
              {formatDateKo(job.date)}
              {nightShift && <span className="badge badge-night" style={{ marginLeft: 6 }}>야간</span>}
              {specialWork && <span className="badge badge-special" style={{ marginLeft: 6 }}>특근</span>}
            </div>
            <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)', lineHeight: 1.3 }}>
              {[job.line, job.equipmentId || job.chamber].filter(Boolean).join(' · ') || job.taskName?.slice(0, 30)}
            </div>
          </div>
          <div style={{ fontSize: 18, color: 'var(--gray-400)', transition: 'transform 0.2s', transform: jobInfoOpen ? 'rotate(180deg)' : 'none', flexShrink: 0, marginLeft: 8 }}>
            ▾
          </div>
        </div>

        {jobInfoOpen && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--gray-100)', paddingTop: 12 }} onClick={e => e.stopPropagation()}>
            <div className="info-row">
              <span className="info-label">날짜</span>
              <span className="info-value">{formatDateKo(job.date)}</span>
            </div>
            <div className="info-row">
              <span className="info-label">시간</span>
              <span className="info-value">{job.timeInfo}</span>
            </div>
            <div className="info-row">
              <span className="info-label">작업자</span>
              <span className="info-value">{job.assignedWorkers?.join(', ')}</span>
            </div>
            <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5 }}>
              {job.taskName}
            </div>
          </div>
        )}
      </div>

      {/* 이전 특이사항 바텀시트 팝업 */}
      {!historyPopupDismissed && (() => {
        const allHistory = [
          ...sameChamberReports.map(r => ({ ...r, _group: 'chamber' })),
          ...sameEquipReports.map(r => ({ ...r, _group: 'equip' })),
        ];
        const withNotes = allHistory.filter(r => r.notes);

        const lineName = job?.line || '';
        const equipName = job?.equipmentId || job?.chamber || '';
        const locationLabel = [lineName, equipName].filter(Boolean).join(' ');

        const dismiss = () => {
          setHistoryPopupDismissed(true);
          sessionStorage.setItem(`histD_${jobId}`, '1');
        };

        return (
          <div onClick={dismiss} style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 999,
            display: 'flex', alignItems: 'flex-end',
          }}>
            <div onClick={e => e.stopPropagation()} style={{
              background: 'white', borderRadius: '20px 20px 0 0',
              width: '100%', maxHeight: '75vh', overflow: 'auto',
              paddingBottom: 'calc(var(--nav-height) + 8px)',
            }}>
              {/* 핸들 */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--gray-200)' }} />
              </div>

              {/* 헤더 */}
              <div style={{ padding: '8px 20px 16px' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
                  {withNotes.length > 0 ? '최근 작업 특이사항' : '최근 작업이력 없음'}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.5 }}>
                  {withNotes.length > 0
                    ? `${locationLabel ? locationLabel + ' · ' : ''}총 ${withNotes.length}건`
                    : locationLabel
                      ? `${locationLabel}은 최근 작업이력이 없습니다`
                      : '이전 작업이력이 없습니다'
                  }
                </div>
              </div>

              {/* 내역 */}
              <div style={{ padding: '0 16px' }}>
                {withNotes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '16px 0 24px', color: 'var(--gray-400)' }}>
                    <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                    <div style={{ fontSize: 14, color: 'var(--gray-600)', fontWeight: 600 }}>
                      {locationLabel ? `${locationLabel}은` : '이 장비는'} 최근 작업이력이 없습니다
                    </div>
                  </div>
                ) : (
                  withNotes.map((r, i) => (
                    <div key={r.id || i} style={{
                      padding: '14px 16px', marginBottom: 10,
                      background: 'var(--gray-50)', borderRadius: 14,
                      borderLeft: '3px solid var(--primary)',
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', marginBottom: 6 }}>
                        {r.date} · {r.workerName}
                      </div>
                      <div style={{ fontSize: 14, color: '#1c1917', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
                        {r.notes}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div style={{ padding: '4px 16px 8px' }}>
                <button className="btn btn-primary btn-full" onClick={dismiss}>확인</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 입퇴실 시간 */}
      <div className="card">
        <div className="card-title">입퇴실 시간</div>

        {/* 목표 작업시간 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16, padding: '10px 12px', background: 'var(--gray-100)', borderRadius: 8 }}>
          <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>목표 작업시간</span>
          <button type="button"
            onClick={() => setTargetMins(m => Math.max(10, m - 10))}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--gray-300)', background: 'white', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>−</button>
          <span style={{ fontSize: 15, fontWeight: 700, minWidth: 80, textAlign: 'center' }}>{fmtTargetHours(targetMins)}</span>
          <button type="button"
            onClick={() => setTargetMins(m => Math.min(720, m + 10))}
            style={{ width: 32, height: 32, borderRadius: 8, border: '1.5px solid var(--gray-300)', background: 'white', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>+</button>
        </div>

        {/* 1차 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: 1, marginBottom: 8 }}>1차</div>
        <TimeStampRow
          entryVal={form.entryTime1} exitVal={form.exitTime1}
          onEntry={() => stampNow('entryTime1')} onExit={() => stampNow('exitTime1')}
          onEntryChange={v => { set('entryTime1', v); clearRaw('entryTime1'); }}
          onExitChange={v => { set('exitTime1', v); clearRaw('exitTime1'); }}
          roundedEntry={rounded.entry1} roundedExit={rounded.exit1}
          suggestedExit={suggestedExit1} countdown={countdown(suggestedExit1)}
          rawEntry={rawTimes.entry1} rawExit={rawTimes.exit1}
        />

        {/* 점심 */}
        <div style={{
          marginTop: 14, padding: '12px 14px',
          background: lunchBreak ? '#f0fdf4' : 'var(--gray-100)',
          borderRadius: 8,
          border: `1.5px solid ${lunchBreak ? '#86efac' : 'var(--gray-200)'}`
        }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
            <input type="checkbox"
              style={{ width: 18, height: 18, cursor: 'pointer', accentColor: '#16a34a' }}
              checked={lunchBreak}
              onChange={e => setLunchBreak(e.target.checked)}
            />
            <span style={{ fontSize: 14, fontWeight: 600 }}>점심 먹음</span>
            {!lunchBreak && <span style={{ fontSize: 12, color: 'var(--gray-400)' }}>체크 시 점심 시간 반영</span>}
          </label>
          {lunchBreak && (
            <div style={{ marginTop: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 13, color: '#166534', flex: 1 }}>
                  퇴실 {lunchStartStr} · 복귀 {lunchEndStr}
                </span>
                <button type="button"
                  onClick={() => setLunchMins(m => Math.max(5, m - 5))}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #86efac', background: 'white', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>−</button>
                <span style={{ fontSize: 14, fontWeight: 700, minWidth: 36, textAlign: 'center', color: '#166534' }}>{lunchMins}분</span>
                <button type="button"
                  onClick={() => setLunchMins(m => Math.min(120, m + 5))}
                  style={{ width: 28, height: 28, borderRadius: 6, border: '1.5px solid #86efac', background: 'white', fontSize: 18, cursor: 'pointer', lineHeight: 1 }}>+</button>
              </div>
              {predictedFinalExit && (
                <div style={{ marginTop: 8, textAlign: 'center', padding: '8px', background: 'white', borderRadius: 6, border: '1px solid #86efac' }}>
                  <div style={{ fontSize: 12, color: '#166534' }}>점심 {lunchMins}분 포함 예상 퇴실</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: '#15803d' }}>{predictedFinalExit}</div>
                  {countdown(predictedFinalExit) && (
                    <div style={{ fontSize: 12, color: countdown(predictedFinalExit) === '지남' ? '#dc2626' : '#166534' }}>
                      {countdown(predictedFinalExit)}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 2차 */}
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: 1, marginBottom: 8, marginTop: 14 }}>
          2차 (선택){lunchBreak ? ` · 복귀 후 ${lunchEndStr}부터` : ''}
        </div>
        <TimeStampRow
          secondary
          entryVal={form.entryTime2} exitVal={form.exitTime2}
          onEntry={() => stampNow('entryTime2')} onExit={() => stampNow('exitTime2')}
          onEntryChange={v => { set('entryTime2', v); clearRaw('entryTime2'); }}
          onExitChange={v => { set('exitTime2', v); clearRaw('exitTime2'); }}
          roundedEntry={rounded.entry2} roundedExit={rounded.exit2}
          suggestedExit={suggestedExit2} countdown={countdown(suggestedExit2)}
          rawEntry={rawTimes.entry2} rawExit={rawTimes.exit2}
          entryError={entry2Error}
        />

        {/* 총 근무시간 */}
        {rounded.entry1 && rounded.exit1 && (
          <div style={{ textAlign: 'center', padding: '14px 0', background: 'var(--primary-light)', borderRadius: 8, marginTop: 14 }}>
            <div style={{ fontSize: 13, color: 'var(--primary)' }}>현재 실제 근무시간</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>
              {formatHours(totalHours)}
            </div>
          </div>
        )}
      </div>

      {/* 장비 상태 */}
      <div className="card">
        <div className="card-title">장비 상태</div>
        <div className="form-group">
          <label className="form-label">챔버 상태 <span style={{ fontWeight: 400, color: 'var(--gray-500)', fontSize: 12 }}>(복수 선택 가능)</span></label>
          <MultiSelectGroup
            groups={CHAMBER_STATUS_GROUPS}
            value={form.chamberStatus}
            onChange={v => set('chamberStatus', v)}
          />
        </div>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">작업 난이도</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {DIFFICULTY_OPTIONS.map(({ value, label, sub }) => {
              const selected = form.difficulty === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('difficulty', value)}
                  style={{
                    flex: 1, padding: '10px 6px', borderRadius: 8, cursor: 'pointer',
                    border: `2px solid ${selected ? 'var(--primary)' : 'var(--gray-200)'}`,
                    background: selected ? 'var(--primary-light)' : 'white',
                    color: selected ? 'var(--primary)' : 'var(--gray-700)',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: selected ? 700 : 500, lineHeight: 1.3 }}>{label}</div>
                  <div style={{ fontSize: 10, marginTop: 3, color: selected ? 'var(--primary)' : 'var(--gray-400)', lineHeight: 1.3 }}>{sub}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>


      {/* 같은 챔버 이력 */}
      {sameChamberReports.length > 0 && (() => {
        const repDate = sameChamberReports[0].date;
        const jobDateStr = job.date;
        const days = Math.abs(Math.floor((new Date(jobDateStr) - new Date(repDate)) / 86400000));
        const months = Math.round(days / 30);
        const isRecent = days < 180;
        const isVeryRecent = days < 60;
        return (
          <div className="card" style={{ border: `2px solid ${isVeryRecent ? '#dc2626' : isRecent ? '#f59e0b' : 'var(--gray-200)'}` }}>
            {isRecent && (
              <div style={{
                padding: '8px 12px', marginBottom: 12, borderRadius: 6,
                background: isVeryRecent ? '#fef2f2' : '#fef3c7',
                color: isVeryRecent ? '#dc2626' : '#92400e',
                fontSize: 13, fontWeight: 700
              }}>
                {isVeryRecent ? '🚨' : '⚠️'} {months > 0 ? `${months}개월` : `${days}일`} 전 같은 챔버 작업 이력 — 반복 작업 원인 확인 필요
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>
                같은 챔버 이력 {!isRecent && <span style={{ fontSize: 12, color: 'var(--gray-400)', fontWeight: 400 }}>({months > 0 ? `약 ${months}개월 전` : `${days}일 전`})</span>}
              </div>
              <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{formatDateKo(repDate)}</span>
            </div>
            {sameChamberReports.map((r, i) => (
              <ReportHistoryRow key={r.id} r={r} i={i} total={sameChamberReports.length} />
            ))}
          </div>
        );
      })()}

      {/* 같은 장비 다른 챔버 이력 */}
      {sameEquipReports.length > 0 && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--gray-600)' }}>같은 장비 참고 이력</div>
            <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>{formatDateKo(sameEquipReports[0].date)}</span>
          </div>
          {sameEquipReports.map((r, i) => (
            <ReportHistoryRow key={r.id} r={r} i={i} total={sameEquipReports.length} showChamber />
          ))}
        </div>
      )}

      {/* 특이사항 */}
      <div className="card">
        <div className="card-title">한마디 특이사항</div>
        <textarea
          className="form-textarea"
          style={{ minHeight: 80 }}
          placeholder="다음 작업자에게 전달할 내용 (장비 상태, 주의사항 등)"
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
        />
      </div>

      <button
        className="btn btn-primary btn-full"
        onClick={handleSubmit}
        disabled={saving}
        style={{ marginBottom: 8 }}
      >
        {saving ? '저장 중...' : existingReport ? '보고서 수정' : '보고서 제출'}
      </button>
      <button className="btn btn-gray btn-full" onClick={() => navigate(-1)}>
        취소
      </button>
    </Layout>
  );
}
