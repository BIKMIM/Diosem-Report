import { useState, useEffect } from 'react';
import { collection, getDocs, updateDoc, doc, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';

export default function AdminPanel() {
  const { workerProfile } = useAuth();
  const [workers, setWorkers] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('workers');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const wSnap = await getDocs(query(collection(db, 'workers'), orderBy('createdAt')));
      setWorkers(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));

      const jSnap = await getDocs(query(collection(db, 'jobs'), orderBy('date', 'desc')));
      setJobs(jSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const toggleActive = async (worker) => {
    await updateDoc(doc(db, 'workers', worker.id), { isActive: !worker.isActive });
    setWorkers(ws => ws.map(w => w.id === worker.id ? { ...w, isActive: !w.isActive } : w));
  };

  const toggleAdmin = async (worker) => {
    await updateDoc(doc(db, 'workers', worker.id), { isAdmin: !worker.isAdmin });
    setWorkers(ws => ws.map(w => w.id === worker.id ? { ...w, isAdmin: !w.isAdmin } : w));
  };

  const deleteJob = async (jobId) => {
    if (!window.confirm('이 작업을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'jobs', jobId));
    setJobs(js => js.filter(j => j.id !== jobId));
  };

  if (!workerProfile?.isAdmin) {
    return (
      <Layout title="관리">
        <div className="empty-state">
          <div className="emoji">🔒</div>
          <p>관리자만 접근할 수 있습니다.</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="관리">
      {/* Tab selector */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {[['workers', '직원 관리'], ['jobs', '작업 관리']].map(([key, label]) => (
          <button
            key={key}
            className={`btn ${tab === key ? 'btn-primary' : 'btn-gray'}`}
            style={{ flex: 1 }}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : tab === 'workers' ? (
        <>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 8 }}>
            등록된 계정: {workers.length}명
          </div>
          {workers.map(w => (
            <div key={w.id} className={`worker-row ${!w.isActive ? 'inactive' : ''}`}>
              <div>
                <div style={{ fontWeight: 700 }}>{w.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  {w.isAdmin ? '관리자' : '일반'} • {w.isActive ? '활성' : '비활성'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  className="btn btn-sm btn-gray"
                  onClick={() => toggleAdmin(w)}
                  style={{ fontSize: 11 }}
                >
                  {w.isAdmin ? '권한해제' : '관리자'}
                </button>
                <label className="toggle">
                  <input type="checkbox" checked={!!w.isActive} onChange={() => toggleActive(w)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          ))}
          {workers.length === 0 && (
            <div className="empty-state">
              <div className="emoji">👤</div>
              <p>아직 등록된 계정이 없습니다.<br />작업자들이 앱에서 계정을 만들면 여기에 표시됩니다.</p>
            </div>
          )}
        </>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 8 }}>
            총 {jobs.length}건
          </div>
          {jobs.slice(0, 50).map(j => (
            <div key={j.id} className="card" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{j.date} ({j.dayOfWeek})</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-700)', marginTop: 2 }}>{j.taskName}</div>
                  <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 2 }}>
                    {j.assignedWorkers?.join(', ')}
                  </div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => deleteJob(j.id)}>
                  삭제
                </button>
              </div>
            </div>
          ))}
          {jobs.length === 0 && (
            <div className="empty-state">
              <div className="emoji">📅</div>
              <p>저장된 작업이 없습니다.<br />일정 탭에서 일정을 붙여넣어 추가하세요.</p>
            </div>
          )}
        </>
      )}
    </Layout>
  );
}
