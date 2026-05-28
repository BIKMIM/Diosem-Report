import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { todayStr, formatDateKo, formatHours } from '../utils/timeCalc';
import { isSpecialWork } from '../utils/holidays';

export default function Home() {
  const { workerProfile } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const today = todayStr();

  useEffect(() => {
    if (!workerProfile) return;
    loadData();
  }, [workerProfile]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get jobs for next 7 days that include current worker
      const d = new Date();
      const dates = Array.from({ length: 7 }, (_, i) => {
        const dd = new Date(d);
        dd.setDate(d.getDate() + i);
        return `${dd.getFullYear()}-${String(dd.getMonth()+1).padStart(2,'0')}-${String(dd.getDate()).padStart(2,'0')}`;
      });

      const jobsSnap = await getDocs(
        query(
          collection(db, 'jobs'),
          where('assignedWorkers', 'array-contains', workerProfile.name),
          where('date', 'in', dates),
          orderBy('date'), orderBy('startTime')
        )
      );

      const jobsList = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      setJobs(jobsList);

      // Get submitted reports for these jobs
      if (jobsList.length > 0) {
        const jobIds = jobsList.map(j => j.id);
        const reportsSnap = await getDocs(
          query(
            collection(db, 'reports'),
            where('workerId', '==', workerProfile.uid || ''),
            where('jobId', 'in', jobIds.slice(0, 10))
          )
        );
        const rmap = {};
        reportsSnap.docs.forEach(d => { rmap[d.data().jobId] = d.id; });
        setReports(rmap);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const todayJobs = jobs.filter(j => j.date === today);
  const upcomingJobs = jobs.filter(j => j.date > today);

  const JobCard = ({ job }) => {
    const isDone = !!reports[job.id];
    const isNight = job.isNight;
    const isSpecial = job.isSpecial || isSpecialWork(job.date);
    const cardClass = `card job-card ${isNight ? 'night' : ''} ${isSpecial ? 'special' : ''} ${isDone ? 'done' : ''}`;

    return (
      <div className={cardClass} onClick={() => navigate(`/report/${job.id}`)}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div className="job-time">
            {job.startTime && job.endTime ? `${job.startTime} ~ ${job.endTime}` : job.timeInfo}
          </div>
          <div className="job-meta">
            {isNight && <span className="badge badge-night">야간</span>}
            {isSpecial && <span className="badge badge-special">특근</span>}
            {isDone
              ? <span className="badge badge-done">제출완료</span>
              : <span className="badge badge-pending">미제출</span>
            }
          </div>
        </div>
        <div className="job-desc" style={{ marginTop: 6 }}>
          {job.taskName || job.rawDescription}
        </div>
        <div className="job-workers" style={{ marginTop: 4 }}>
          작업자: {job.assignedWorkers?.join(', ')}
        </div>
        <div style={{ marginTop: 10 }}>
          <button
            className={`btn btn-sm ${isDone ? 'btn-gray' : 'btn-primary'}`}
            onClick={e => { e.stopPropagation(); navigate(`/report/${job.id}`); }}
          >
            {isDone ? '보고서 보기' : '보고서 작성'}
          </button>
        </div>
      </div>
    );
  };

  return (
    <Layout title="다이오셈 보고서">
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 22, fontWeight: 800 }}>{formatDateKo(today)}</div>
        <div style={{ fontSize: 14, color: 'var(--gray-500)', marginTop: 2 }}>
          안녕하세요, {workerProfile?.name}님
        </div>
      </div>

      <div className="section-header">오늘의 작업</div>
      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : todayJobs.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📋</div>
          <p>오늘 배정된 작업이 없습니다</p>
        </div>
      ) : (
        todayJobs.map(job => <JobCard key={job.id} job={job} />)
      )}

      {upcomingJobs.length > 0 && (
        <>
          <div className="section-header">이번 주 예정 작업</div>
          {upcomingJobs.map(job => (
            <div key={job.id}>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 4 }}>
                {formatDateKo(job.date)}
              </div>
              <JobCard job={job} />
            </div>
          ))}
        </>
      )}
    </Layout>
  );
}
