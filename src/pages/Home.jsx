import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { todayStr, formatDateKo, splitTaskName } from '../utils/timeCalc';
import { isSpecialWork } from '../utils/holidays';


export default function Home() {
  const { workerProfile, currentUser } = useAuth();
  const [todayJobs, setTodayJobs] = useState([]);
  const [reports, setReports] = useState({});
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const today = todayStr();

  useEffect(() => {
    if (!workerProfile) return;
    loadData();
  }, [workerProfile]);

  const loadData = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'jobs'),
          where('assignedWorkers', 'array-contains', workerProfile.name))
      );
      const todayList = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => j.date === today)
        .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
      setTodayJobs(todayList);

      if (todayList.length > 0) {
        const ids = todayList.map(j => j.id);
        const rmap = {};
        for (let i = 0; i < ids.length; i += 10) {
          const rSnap = await getDocs(
            query(collection(db, 'reports'),
              where('workerId', '==', currentUser?.uid || ''),
              where('jobId', 'in', ids.slice(i, i + 10)))
          );
          rSnap.docs.forEach(d => { rmap[d.data().jobId] = d.id; });
        }
        setReports(rmap);
      }
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const doneCount = todayJobs.filter(j => reports[j.id]).length;
  const hasTodayJobs = todayJobs.length > 0;

  return (
    <Layout title="디오셈 보고서">
      {/* 인사 */}
      <div style={{ textAlign: 'center', padding: '24px 0 28px' }}>
        <div style={{ fontSize: 13, color: 'var(--gray-400)', marginBottom: 6 }}>
          {formatDateKo(today)}
        </div>
        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--gray-900)', lineHeight: 1.3 }}>
          {workerProfile?.name}님, 안녕하세요
        </div>
      </div>

      {/* 메인 버튼 2개 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => {
            if (todayJobs.length === 1) navigate(`/report/${todayJobs[0].id}`);
            else setShowModal(true);
          }}
          style={{
            flex: 1, height: 110,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
            background: 'var(--primary)', color: 'white',
            borderRadius: 20, border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(29,78,216,0.25)',
            position: 'relative',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          <div style={{ fontSize: 16, fontWeight: 800 }}>오늘 작업</div>
          <div style={{ fontSize: 13, opacity: 0.85 }}>기록하기</div>
          {/* 미제출 뱃지 */}
          {!loading && todayJobs.length > 0 && doneCount < todayJobs.length && (
            <div style={{
              position: 'absolute', top: 10, right: 12,
              background: '#ef4444', color: 'white',
              borderRadius: 20, fontSize: 11, fontWeight: 800,
              padding: '2px 7px', minWidth: 20, textAlign: 'center',
            }}>
              {todayJobs.length - doneCount}
            </div>
          )}
        </button>

        <button
          onClick={() => navigate('/reports')}
          style={{
            flex: 1, height: 110,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', gap: 6,
            background: 'white', color: 'var(--primary)',
            borderRadius: 20, border: '2px solid var(--primary)', cursor: 'pointer',
            boxShadow: '0 2px 8px rgba(0,0,0,0.07)',
          }}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
            <polyline points="14 2 14 8 20 8"/>
            <line x1="16" y1="13" x2="8" y2="13"/>
            <line x1="16" y1="17" x2="8" y2="17"/>
          </svg>
          <div style={{ fontSize: 16, fontWeight: 800 }}>이전 작업</div>
          <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>검색하기</div>
        </button>
      </div>

      {/* 오늘 작업 현황 (홈 하단 미리보기) */}
      {!loading && todayJobs.length > 0 && (
        <div style={{
          background: 'white', borderRadius: 16, padding: '14px 16px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-500)' }}>오늘 예정 작업</div>
            <div style={{ fontSize: 12, fontWeight: 700, color: doneCount === todayJobs.length ? 'var(--secondary)' : 'var(--primary)' }}>
              {doneCount}/{todayJobs.length} 제출
            </div>
          </div>
          {todayJobs.map((job, i) => {
            const isDone = !!reports[job.id];
            const isNight = job.isNight;
            const isSpecial = job.isSpecial || isSpecialWork(job.date);
            const { mainPart } = splitTaskName(job.taskName || '');
            return (
              <div
                key={job.id}
                onClick={() => navigate(`/report/${job.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 0',
                  borderTop: i > 0 ? '1px solid var(--gray-100)' : 'none',
                  cursor: 'pointer',
                }}
              >
                <div style={{
                  width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
                  background: isDone ? 'var(--secondary)' : 'var(--gray-300)',
                }} />
                <div style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--gray-900)', lineHeight: 1.3 }}>
                  {mainPart || job.taskName}
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  {isNight && <span className="badge badge-night">야간</span>}
                  {isSpecial && <span className="badge badge-special">특근</span>}
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700,
                    background: isDone ? 'var(--secondary-light)' : 'var(--gray-100)',
                    color: isDone ? 'var(--secondary)' : 'var(--gray-500)',
                  }}>
                    {isDone ? '완료' : '미제출'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && todayJobs.length === 0 && (
        <div style={{ textAlign: 'center', padding: '28px 0', color: 'var(--gray-400)', fontSize: 13 }}>
          오늘 예정된 작업이 없습니다
        </div>
      )}

      {/* ── 작업 선택 바텀시트 모달 ── */}
      {showModal && (
        <div
          onClick={() => setShowModal(false)}
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 900,
            display: 'flex', alignItems: 'flex-end',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: 'white',
              borderRadius: '20px 20px 0 0',
              width: '100%',
              maxHeight: '75vh',
              overflow: 'auto',
              paddingBottom: 'calc(var(--nav-height) + 8px)',
            }}
          >
            {/* 핸들 */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--gray-200)' }} />
            </div>

            {/* 헤더 */}
            <div style={{ padding: '8px 20px 16px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 4 }}>
                {hasTodayJobs ? '오늘 작업 선택' : '오늘 작업 없음'}
              </div>
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                {hasTodayJobs ? `오늘 ${todayJobs.length}건의 작업이 있습니다` : formatDateKo(today)}
              </div>
            </div>

            {/* 작업 목록 또는 빈 상태 */}
            <div style={{ padding: '0 16px' }}>
              {!hasTodayJobs ? (
                <div style={{ textAlign: 'center', padding: '20px 0 28px', color: 'var(--gray-400)' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--gray-700)', marginBottom: 6 }}>
                    오늘은 작업이 없습니다
                  </div>
                  <div style={{ fontSize: 13 }}>수고하셨습니다!</div>
                </div>
              ) : (
                todayJobs.map(job => {
                  const isDone = !!reports[job.id];
                  const isNight = job.isNight;
                  const isSpecial = job.isSpecial || isSpecialWork(job.date);
                  const { mainPart, requesterPart } = splitTaskName(job.taskName || '');

                  return (
                    <div
                      key={job.id}
                      onClick={() => { setShowModal(false); navigate(`/report/${job.id}`); }}
                      style={{
                        padding: '14px 16px', marginBottom: 10,
                        background: isDone ? 'var(--gray-50)' : 'white',
                        borderRadius: 14,
                        border: `1.5px solid ${isDone ? 'var(--gray-200)' : 'var(--primary)'}`,
                        cursor: 'pointer',
                        boxShadow: isDone ? 'none' : '0 2px 8px rgba(29,78,216,0.1)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--gray-900)', lineHeight: 1.35 }}>
                            {mainPart || job.taskName}
                          </div>
                          {requesterPart && (
                            <div style={{ fontSize: 12, color: 'var(--gray-400)', marginTop: 2 }}>{requesterPart}</div>
                          )}
                          <div style={{ display: 'flex', gap: 4, marginTop: 6, flexWrap: 'wrap' }}>
                            {job.startTime && job.endTime && (
                              <span style={{ fontSize: 11, color: 'var(--gray-500)' }}>
                                {job.startTime}~{job.endTime}
                              </span>
                            )}
                            {isNight && <span className="badge badge-night">야간</span>}
                            {isSpecial && <span className="badge badge-special">특근</span>}
                          </div>
                        </div>
                        <span style={{
                          fontSize: 12, padding: '4px 12px', borderRadius: 20, fontWeight: 800,
                          flexShrink: 0, marginTop: 2,
                          background: isDone ? 'var(--secondary-light)' : 'var(--primary)',
                          color: isDone ? 'var(--secondary)' : 'white',
                        }}>
                          {isDone ? '수정' : '작성'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 닫기 */}
            <div style={{ padding: '4px 16px 8px' }}>
              <button
                className="btn btn-gray btn-full"
                onClick={() => setShowModal(false)}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
