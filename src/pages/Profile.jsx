import { useState, useEffect } from 'react';
import { updatePassword, reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { auth, db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { WORKERS, nameToEmail } from '../utils/workers';

function getWeekDates(offsetWeeks = 0) {
  const d = new Date();
  const dow = d.getDay();
  const toMonday = dow === 0 ? -6 : 1 - dow;
  const mon = new Date(d);
  mon.setDate(d.getDate() + toMonday + offsetWeeks * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const dt = new Date(mon);
    dt.setDate(mon.getDate() + i);
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  });
}

function weekLabel(dates) {
  const a = new Date(dates[0] + 'T00:00:00');
  const b = new Date(dates[6] + 'T00:00:00');
  const fmt = d => `${d.getMonth() + 1}/${String(d.getDate()).padStart(2, '0')}`;
  return `${fmt(a)} ~ ${fmt(b)}`;
}

const fmtH = h => {
  if (!h) return '0h';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return mm > 0 ? `${hh}h ${mm}m` : `${hh}h`;
};

const fmtPayroll = h => {
  if (!h) return '0:00';
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${hh}:${String(mm).padStart(2, '0')}`;
};

const MAX_HOURS = 52;
const BASE_HOURS = 40;

// ── 내 정보 탭 ──────────────────────────────────────────
function MyInfoTab({ workerProfile, currentUser, logout }) {
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [msg, setMsg] = useState({ text: '', ok: false });
  const [saving, setSaving] = useState(false);

  const changePassword = async () => {
    setMsg({ text: '', ok: false });
    if (!curPw || !newPw || !confirmPw) { setMsg({ text: '모든 항목을 입력해주세요', ok: false }); return; }
    if (newPw.length < 6) { setMsg({ text: '새 비밀번호는 6자 이상이어야 합니다', ok: false }); return; }
    if (newPw !== confirmPw) { setMsg({ text: '새 비밀번호가 일치하지 않습니다', ok: false }); return; }
    setSaving(true);
    try {
      const credential = EmailAuthProvider.credential(nameToEmail(workerProfile.name), curPw);
      await reauthenticateWithCredential(currentUser, credential);
      await updatePassword(currentUser, newPw);
      setMsg({ text: '비밀번호가 변경되었습니다', ok: true });
      setCurPw(''); setNewPw(''); setConfirmPw('');
    } catch (e) {
      const code = e.code || '';
      if (code.includes('wrong-password') || code.includes('invalid-credential')) {
        setMsg({ text: '현재 비밀번호가 올바르지 않습니다', ok: false });
      } else {
        setMsg({ text: '오류가 발생했습니다. 다시 시도해주세요', ok: false });
      }
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div className="card">
        <div className="card-title">계정 정보</div>
        <div className="info-row">
          <span className="info-label">이름</span>
          <span className="info-value" style={{ fontWeight: 700 }}>{workerProfile?.name}</span>
        </div>
        <div className="info-row">
          <span className="info-label">권한</span>
          <span className="info-value">{workerProfile?.isAdmin ? '관리자' : '일반'}</span>
        </div>
      </div>

      <div className="card">
        <div className="card-title">비밀번호 변경</div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label">현재 비밀번호</label>
          <input
            type="password"
            className="form-input"
            value={curPw}
            onChange={e => setCurPw(e.target.value)}
            placeholder="현재 비밀번호"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label">새 비밀번호</label>
          <input
            type="password"
            className="form-input"
            value={newPw}
            onChange={e => setNewPw(e.target.value)}
            placeholder="6자 이상"
          />
        </div>
        <div className="form-group" style={{ marginBottom: 12 }}>
          <label className="form-label">새 비밀번호 확인</label>
          <input
            type="password"
            className="form-input"
            value={confirmPw}
            onChange={e => setConfirmPw(e.target.value)}
            placeholder="새 비밀번호 재입력"
          />
        </div>
        {msg.text && (
          <div style={{
            padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 600,
            background: msg.ok ? '#dcfce7' : '#fef2f2',
            color: msg.ok ? '#166534' : '#dc2626',
            border: `1px solid ${msg.ok ? '#86efac' : '#fca5a5'}`,
          }}>
            {msg.text}
          </div>
        )}
        <button
          className="btn btn-primary btn-full"
          onClick={changePassword}
          disabled={saving}
        >
          {saving ? '변경 중...' : '비밀번호 변경'}
        </button>
      </div>

      <button className="btn btn-gray btn-full" onClick={logout} style={{ marginTop: 8 }}>
        로그아웃
      </button>
    </div>
  );
}

// ── 작업현황 탭 ──────────────────────────────────────────
function PayrollTab() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [year, month]);

  const load = async () => {
    setLoading(true);
    const monthStr = `${year}-${String(month).padStart(2, '0')}`;
    try {
      const snap = await getDocs(
        query(collection(db, 'reports'),
          where('date', '>=', monthStr + '-01'),
          where('date', '<=', monthStr + '-31'),
          orderBy('date'))
      );
      const stats = {};
      WORKERS.forEach(w => { stats[w] = { hours: 0, nightCount: 0, specialCount: 0, count: 0 }; });
      snap.docs.forEach(d => {
        const r = d.data();
        const w = r.workerName;
        if (!stats[w]) stats[w] = { hours: 0, nightCount: 0, specialCount: 0, count: 0 };
        stats[w].hours += r.totalHours || 0;
        if (r.isNight) stats[w].nightCount++;
        if (r.isSpecial) stats[w].specialCount++;
        stats[w].count++;
      });
      setData(stats);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const prevMonth = () => { if (month === 1) { setYear(y => y-1); setMonth(12); } else setMonth(m => m-1); };
  const nextMonth = () => { if (month === 12) { setYear(y => y+1); setMonth(1); } else setMonth(m => m+1); };

  const workers = WORKERS.filter(w => data[w]?.count > 0);
  const totalHours = workers.reduce((s, w) => s + (data[w]?.hours || 0), 0);

  return (
    <div>
      <div className="month-selector" style={{ marginBottom: 12 }}>
        <button className="month-btn" onClick={prevMonth}>‹</button>
        <span className="month-display">{year}년 {month}월</span>
        <button className="month-btn" onClick={nextMonth}>›</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: '총 보고서', value: workers.reduce((s, w) => s + data[w].count, 0) + '건' },
          { label: '총 근무시간', value: fmtPayroll(totalHours) },
          { label: '참여 인원', value: workers.length + '명' },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '12px 8px', margin: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? <div className="loading">불러오는 중...</div> : workers.length === 0 ? (
        <div className="empty-state"><div className="emoji">📊</div><p>이 달의 보고서가 없습니다</p></div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                <th style={{ padding: '10px 14px', textAlign: 'left', borderBottom: '1px solid var(--gray-200)' }}>작업자</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--gray-200)' }}>건수</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--gray-200)' }}>시간</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--gray-200)', color: 'var(--night)' }}>야간</th>
                <th style={{ padding: '10px 8px', borderBottom: '1px solid var(--gray-200)', color: 'var(--special)' }}>특근</th>
              </tr>
            </thead>
            <tbody>
              {WORKERS.filter(w => data[w]?.count > 0).map((w, i) => (
                <tr key={w} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                  <td style={{ padding: '10px 14px', fontWeight: 600 }}>{w}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>{data[w].count}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>{fmtPayroll(data[w].hours)}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--night)', fontWeight: 600 }}>{data[w].nightCount || '-'}</td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', color: 'var(--special)', fontWeight: 600 }}>{data[w].specialCount || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── 주52시간 탭 ──────────────────────────────────────────
function WeekHoursTab() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [workerHours, setWorkerHours] = useState({});
  const [loading, setLoading] = useState(true);

  const weekDates = getWeekDates(weekOffset);

  useEffect(() => { loadWeek(); }, [weekOffset]);

  const loadWeek = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'reports'),
          where('date', '>=', weekDates[0]),
          where('date', '<=', weekDates[6]))
      );
      const hours = {};
      WORKERS.forEach(w => { hours[w] = 0; });
      snap.docs.forEach(d => {
        const r = d.data();
        if (r.workerName) hours[r.workerName] = (hours[r.workerName] || 0) + (r.totalHours || 0);
      });
      setWorkerHours(hours);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const allWorkers = WORKERS.map(w => ({ name: w, hours: workerHours[w] || 0 }))
    .sort((a, b) => b.hours - a.hours);

  const activeWorkers = allWorkers.filter(w => w.hours > 0);
  const freeWorkers = allWorkers.filter(w => w.hours === 0);

  const statusColor = (h) => {
    if (h > MAX_HOURS) return '#dc2626';
    if (h > BASE_HOURS) return '#d97706';
    return 'var(--secondary)';
  };
  const statusLabel = (h) => {
    if (h > MAX_HOURS) return '초과';
    if (h > BASE_HOURS) return '연장';
    return '정상';
  };
  const statusBg = (h) => {
    if (h > MAX_HOURS) return '#fef2f2';
    if (h > BASE_HOURS) return '#fffbeb';
    return '#f0fdf4';
  };

  return (
    <div>
      {/* Week switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <button className="btn btn-sm btn-gray" style={{ width: 36 }} onClick={() => setWeekOffset(o => o - 1)}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{weekLabel(weekDates)}</div>
          <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>주 최대 {MAX_HOURS}시간</div>
        </div>
        <button className="btn btn-sm btn-gray" style={{ width: 36 }} onClick={() => setWeekOffset(o => o + 1)}>›</button>
      </div>

      {loading ? <div className="loading">불러오는 중...</div> : (
        <>
          {/* 근무 중인 작업자 */}
          {activeWorkers.length > 0 && (
            <div className="card" style={{ padding: '12px 14px', marginBottom: 10 }}>
              <div className="card-title" style={{ marginBottom: 10 }}>이번 주 근무</div>
              {activeWorkers.map(({ name, hours }) => {
                const pct = Math.min((hours / MAX_HOURS) * 100, 100);
                const remaining = Math.max(MAX_HOURS - hours, 0);
                return (
                  <div key={name} style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{name}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{
                          fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                          background: statusBg(hours), color: statusColor(hours),
                        }}>
                          {statusLabel(hours)}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: statusColor(hours) }}>
                          {fmtH(hours)}
                        </span>
                      </div>
                    </div>
                    {/* Progress bar */}
                    <div style={{ height: 7, background: 'var(--gray-100)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: `${pct}%`,
                        background: statusColor(hours),
                        transition: 'width 0.3s',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                      <span style={{ fontSize: 10, color: 'var(--gray-400)' }}>기본 {BASE_HOURS}h</span>
                      <span style={{ fontSize: 10, color: hours > MAX_HOURS ? '#dc2626' : 'var(--gray-400)' }}>
                        {hours > MAX_HOURS ? `${fmtH(hours - MAX_HOURS)} 초과` : `여유 ${fmtH(remaining)}`}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 여유 작업자 */}
          <div className="card" style={{ padding: '12px 14px' }}>
            <div className="card-title" style={{ marginBottom: 8 }}>
              여유 작업자 ({freeWorkers.length}명)
            </div>
            {freeWorkers.length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--gray-400)' }}>모든 작업자가 근무 중입니다</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {freeWorkers.map(({ name }) => (
                  <span key={name} style={{
                    padding: '6px 12px', background: 'var(--gray-100)',
                    border: '1px solid var(--gray-200)', borderRadius: 20,
                    fontSize: 13, fontWeight: 600, color: 'var(--gray-700)',
                  }}>
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ── 메인 Profile 컴포넌트 ────────────────────────────────
export default function Profile() {
  const { workerProfile, currentUser, logout } = useAuth();
  const [tab, setTab] = useState('info');

  return (
    <Layout title="프로필">
      <MyInfoTab workerProfile={workerProfile} currentUser={currentUser} logout={logout} />
    </Layout>
  );
}
