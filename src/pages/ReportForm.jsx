import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc, addDoc, updateDoc, collection, query, where, getDocs, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { calcTotalHours, isNightShift, formatHours, formatDateKo } from '../utils/timeCalc';
import { isSpecialWork } from '../utils/holidays';

const CHAMBER_SURFACE = ['아노다이징', '도금', '미처리', '기타'];
const DI_BOILING = ['불필요', '필요'];
const CONTAMINATION = ['없음', '보통', '심함'];
const WORK_SPACE = ['1인 작업 가능', '2인 이상 필요', '협소'];
const WORK_POSTURE = ['편함', '보통', '불편함'];
const DIFFICULTY = ['낮음', '보통(일반적인수준)', '높음'];
const TRAVEL_OPTS = [0, 10, 20, 30];

const defaultForm = {
  entryTime1: '', exitTime1: '', entryTime2: '', exitTime2: '',
  travelMinutes: 10,
  wall: false, lidDome: false, tm: false, ll: false, parts: false,
  partsCount: '', otherScope: '',
  padFrom: '', padTo: '',
  chamberSurface: '아노다이징',
  diBoiling: '불필요',
  contamination: '보통',
  workSpace: '1인 작업 가능',
  workPosture: '편함',
  difficulty: '보통(일반적인수준)',
  rcsPosition: '',
  diPosition: '-',
  confirmer: '',
  notes: ''
};

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

  useEffect(() => { loadData(); }, [jobId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const jobSnap = await getDoc(doc(db, 'jobs', jobId));
      if (!jobSnap.exists()) { setError('작업을 찾을 수 없습니다.'); return; }
      setJob({ id: jobSnap.id, ...jobSnap.data() });

      const rSnap = await getDocs(
        query(collection(db, 'reports'),
          where('jobId', '==', jobId),
          where('workerId', '==', currentUser.uid))
      );
      if (!rSnap.empty) {
        const r = { id: rSnap.docs[0].id, ...rSnap.docs[0].data() };
        setExistingReport(r);
        setForm({ ...defaultForm, ...r });
      }
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
  const toggle = (key) => setForm(f => ({ ...f, [key]: !f[key] }));

  const totalHours = calcTotalHours(form.entryTime1, form.exitTime1, form.entryTime2, form.exitTime2, form.travelMinutes);
  const nightShift = isNightShift(form.exitTime1, form.exitTime2);
  const specialWork = job ? isSpecialWork(job.date) : false;

  const handleSubmit = async () => {
    if (!form.entryTime1 || !form.exitTime1)
      return setError('입실/퇴실 시간을 입력해주세요.');
    setError('');
    setSaving(true);
    try {
      const data = {
        ...form,
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
      if (existingReport) {
        await updateDoc(doc(db, 'reports', existingReport.id), data);
      } else {
        await addDoc(collection(db, 'reports'), {
          ...data,
          submittedAt: serverTimestamp()
        });
      }
      setSuccess(true);
      setTimeout(() => navigate('/'), 1500);
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Layout title="보고서 작성"><div className="loading">불러오는 중...</div></Layout>;
  if (!job) return <Layout title="보고서 작성"><div className="alert alert-error">{error || '작업 없음'}</div></Layout>;

  const CheckBtn = ({ label, field }) => (
    <div
      className={`checkbox-item ${form[field] ? 'checked' : ''}`}
      onClick={() => toggle(field)}
    >
      {form[field] ? '✓' : ''} {label}
    </div>
  );

  const Select = ({ field, options }) => (
    <select className="form-select" value={form[field]} onChange={e => set(field, e.target.value)}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  return (
    <Layout title="보고서 작성">
      {success && <div className="alert alert-success">✅ 보고서가 제출되었습니다!</div>}
      {error && <div className="alert alert-error">{error}</div>}

      {/* Job info */}
      <div className="card">
        <div className="card-title">작업 정보</div>
        <div className="info-row"><span className="info-label">날짜</span><span className="info-value">{formatDateKo(job.date)}</span></div>
        <div className="info-row"><span className="info-label">시간</span><span className="info-value">{job.timeInfo}</span></div>
        <div className="info-row"><span className="info-label">작업자</span><span className="info-value">{job.assignedWorkers?.join(', ')}</span></div>
        <div style={{ marginTop: 8, fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5 }}>
          {job.taskName}
        </div>
        <div className="job-meta" style={{ marginTop: 8 }}>
          {nightShift && <span className="badge badge-night">야간</span>}
          {specialWork && <span className="badge badge-special">특근</span>}
        </div>
      </div>

      {/* Times */}
      <div className="card">
        <div className="card-title">입퇴실 시간</div>
        <div className="time-row" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">입실 1</label>
            <input type="time" className="form-input" value={form.entryTime1} onChange={e => set('entryTime1', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">퇴실 1</label>
            <input type="time" className="form-input" value={form.exitTime1} onChange={e => set('exitTime1', e.target.value)} />
          </div>
        </div>
        <div className="time-row" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">입실 2 (선택)</label>
            <input type="time" className="form-input" value={form.entryTime2} onChange={e => set('entryTime2', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">퇴실 2 (선택)</label>
            <input type="time" className="form-input" value={form.exitTime2} onChange={e => set('exitTime2', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">이동시간</label>
          <select className="form-select" value={form.travelMinutes} onChange={e => set('travelMinutes', Number(e.target.value))}>
            {TRAVEL_OPTS.map(m => <option key={m} value={m}>{m}분</option>)}
          </select>
        </div>
        {form.entryTime1 && form.exitTime1 && (
          <div style={{ textAlign: 'center', padding: '12px 0', background: 'var(--primary-light)', borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--primary)' }}>총 실 근무시간</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>{formatHours(totalHours)}</div>
          </div>
        )}
      </div>

      {/* Work scope */}
      <div className="card">
        <div className="card-title">작업 범위</div>
        <div className="checkbox-grid">
          <CheckBtn label="Wall" field="wall" />
          <CheckBtn label="LID/Dome" field="lidDome" />
          <CheckBtn label="T/M" field="tm" />
          <CheckBtn label="L/L" field="ll" />
          <CheckBtn label="Parts" field="parts" />
        </div>
        {form.parts && (
          <div className="form-group" style={{ marginTop: 10 }}>
            <label className="form-label">Parts 수량</label>
            <input type="number" className="form-input" placeholder="수량" value={form.partsCount} onChange={e => set('partsCount', e.target.value)} />
          </div>
        )}
        <div className="form-group" style={{ marginTop: 10 }}>
          <label className="form-label">기타</label>
          <input type="text" className="form-input" placeholder="기타 작업 범위" value={form.otherScope} onChange={e => set('otherScope', e.target.value)} />
        </div>
      </div>

      {/* Equipment status */}
      <div className="card">
        <div className="card-title">장비 상태</div>
        <div className="time-row" style={{ marginBottom: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">패드 사용 ~에서</label>
            <input type="text" className="form-input" placeholder="#140" value={form.padFrom} onChange={e => set('padFrom', e.target.value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">패드 사용 ~까지</label>
            <input type="text" className="form-input" placeholder="#1350" value={form.padTo} onChange={e => set('padTo', e.target.value)} />
          </div>
        </div>
        <div className="form-group">
          <label className="form-label">챔버 표면</label>
          <Select field="chamberSurface" options={CHAMBER_SURFACE} />
        </div>
        <div className="form-group">
          <label className="form-label">D.I 볼림</label>
          <Select field="diBoiling" options={DI_BOILING} />
        </div>
        <div className="form-group">
          <label className="form-label">오염 제거</label>
          <Select field="contamination" options={CONTAMINATION} />
        </div>
        <div className="form-group">
          <label className="form-label">작업 공간</label>
          <Select field="workSpace" options={WORK_SPACE} />
        </div>
        <div className="form-group">
          <label className="form-label">작업 자세</label>
          <Select field="workPosture" options={WORK_POSTURE} />
        </div>
        <div className="form-group">
          <label className="form-label">난이도</label>
          <Select field="difficulty" options={DIFFICULTY} />
        </div>
      </div>

      {/* Other */}
      <div className="card">
        <div className="card-title">기타 정보</div>
        <div className="form-group">
          <label className="form-label">RCS 위치</label>
          <input type="text" className="form-input" value={form.rcsPosition} onChange={e => set('rcsPosition', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">D.I 수취 위치</label>
          <input type="text" className="form-input" value={form.diPosition} onChange={e => set('diPosition', e.target.value)} />
        </div>
        <div className="form-group">
          <label className="form-label">확인자</label>
          <input type="text" className="form-input" placeholder="현업 확인자명" value={form.confirmer} onChange={e => set('confirmer', e.target.value)} />
        </div>
      </div>

      {/* Notes */}
      <div className="card">
        <div className="card-title">기타 특이사항</div>
        <textarea
          className="form-textarea"
          style={{ minHeight: 150 }}
          placeholder="작업 중 특이사항, 문제점, 참고사항 등을 자세히 기록해주세요."
          value={form.notes}
          onChange={e => set('notes', e.target.value)}
        />
        <div className="char-count">{form.notes.length}자</div>
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
