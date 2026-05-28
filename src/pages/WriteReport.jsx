import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { todayStr, formatDateKo, splitTaskName } from '../utils/timeCalc';
import { isSpecialWork } from '../utils/holidays';

function dateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export default function WriteReport() {
  const { workerProfile, currentUser } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const today = todayStr();

  useEffect(() => {
    if (!workerProfile) return;
    load();
  }, [workerProfile]);

  const load = async () => {
    setLoading(true);
    try {
      const startDate = dateOffset(-30);
      const endDate = dateOffset(14);

      const snap = await getDocs(
        query(collection(db, 'jobs'),
          where('assignedWorkers', 'array-contains', workerProfile.name))
      );
      const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      const filtered = all
        .filter(j => j.date >= startDate && j.date <= endDate)
        .sort((a, b) => b.date.localeCompare(a.date) || (a.startTime || '').localeCompare(b.startTime || ''));
      setJobs(filtered);

      if (filtered.length > 0) {
        const allIds = filtered.map(j => j.id);
        const rmap = {};
        for (let i = 0; i < allIds.length; i += 10) {
          const chunk = allIds.slice(i, i + 10);
          const rSnap = await getDocs(
            query(collection(db, 'reports'),
              where('workerId', '==', currentUser?.uid || ''),
              where('jobId', 'in', chunk))
          );
          rSnap.docs.forEach(d => { rmap[d.data().jobId] = d.id; });
        }
        setReports(rmap);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const pending = jobs.filter(j => !reports[j.id]);
  const done = jobs.filter(j => reports[j.id]);

  const JobRow = ({ job }) => {
    const isDone = !!reports[job.id];
    const isNight = job.isNight;
    const isSpecial = job.isSpecial || isSpecialWork(job.date);
    const isToday = job.date === today;
    const isPast = job.date < today;
    const { mainPart, requesterPart } = splitTaskName(job.taskName || '');

    const accentColor = isDone ? 'var(--secondary)'
      : isNight ? 'var(--night)'
      : isSpecial ? 'var(--special)'
      : isPast ? '#f87171'
      : 'var(--primary)';

    return (
      <div
        onClick={() => navigate(`/report/${job.id}`)}
        style={{
          background: 'white', borderRadius: 12, padding: '14px 16px',
          marginBottom: 8, cursor: 'pointer',
          borderLeft: `4px solid ${accentColor}`,
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          opacity: isDone ? 0.7 : 1,
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={{
              fontSize: 11, fontWeight: 700, marginBottom: 3,
              color: isToday ? 'var(--primary)' : isPast && !isDone ? '#dc2626' : 'var(--gray-400)',
            }}>
              {formatDateKo(job.date)}{isToday && ' · 오늘'}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.35 }}>
              {mainPart || job.taskName}
            </div>
            {requesterPart && (
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>{requesterPart}</div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
            {isNight && <span className="badge badge-night">야간</span>}
            {isSpecial && <span className="badge badge-special">특근</span>}
            {isDone
              ? <span className="badge badge-done">제출완료</span>
              : isPast
                ? <span className="badge" style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5' }}>미제출</span>
                : <span className="badge badge-pending">작성하기</span>
            }
          </div>
        </div>
      </div>
    );
  };

  return (
    <Layout title="보고서 작성">
      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : jobs.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📋</div>
          <p>배정된 작업이 없습니다</p>
        </div>
      ) : (
        <>
          {pending.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', marginBottom: 8, paddingLeft: 2 }}>
                미제출 {pending.length}건
              </div>
              {pending.map(job => <JobRow key={job.id} job={job} />)}
            </>
          )}

          {done.length > 0 && (
            <>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-400)', marginTop: pending.length > 0 ? 16 : 0, marginBottom: 8, paddingLeft: 2 }}>
                제출완료 {done.length}건
              </div>
              {done.map(job => <JobRow key={job.id} job={job} />)}
            </>
          )}
        </>
      )}
    </Layout>
  );
}
