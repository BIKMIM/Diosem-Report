import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { todayStr, splitTaskName } from '../utils/timeCalc';
import { isSpecialWork } from '../utils/holidays';
import { loadEquipmentNames, extractEquipModel, DEFAULT_EQUIPMENT_NAMES } from '../utils/equipmentNames';
import { loadLines, getDisplayLine, DEFAULT_LINES } from '../utils/lineNames';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function getMonthInfo(offsetMonths = 0) {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offsetMonths, 1);
  const y = d.getFullYear();
  const m = d.getMonth();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  return {
    year: y,
    month: m + 1,
    firstDow: d.getDay(),
    dates: Array.from({ length: daysInMonth }, (_, i) =>
      `${y}-${String(m + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
    ),
  };
}

function formatTimestamp(ts) {
  if (!ts) return null;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function isUnassignedJob(job) {
  if (!job.assignedWorkers) return true;
  return job.assignedWorkers.filter(w => w && w.trim()).length === 0;
}

const UNASSIGNED_COLOR = '#f97316';

const cellBg = (job, isDone) => {
  if (job._unassigned) return UNASSIGNED_COLOR;
  if (isDone) return 'var(--secondary)';
  if (job.isSpecial || isSpecialWork(job.date)) return 'var(--special)';
  if (job.isNight) return 'var(--night)';
  return 'var(--primary)';
};

export default function WeeklySchedule() {
  const { workerProfile, currentUser } = useAuth();
  const [monthOffset, setMonthOffset] = useState(0);
  const [jobs, setJobs] = useState([]);
  const [unassignedJobs, setUnassignedJobs] = useState([]);
  const [reports, setReports] = useState({});
  const [lastUpdated, setLastUpdated] = useState(null);
  const [loading, setLoading] = useState(true);
  const [equipNames, setEquipNames] = useState(DEFAULT_EQUIPMENT_NAMES);
  const [linesList, setLinesList] = useState(DEFAULT_LINES);
  const navigate = useNavigate();
  const today = todayStr();

  const { year, month, firstDow, dates } = getMonthInfo(monthOffset);

  useEffect(() => {
    loadEquipmentNames().then(setEquipNames).catch(() => {});
    loadLines().then(setLinesList).catch(() => {});
  }, []);

  useEffect(() => {
    if (!workerProfile) return;
    loadMonth();
  }, [workerProfile, monthOffset]);

  const loadMonth = async () => {
    setLoading(true);
    try {
      const startDate = dates[0];
      const endDate = dates[dates.length - 1];

      // 내 작업 로드
      const jobsSnap = await getDocs(
        query(collection(db, 'jobs'), where('assignedWorkers', 'array-contains', workerProfile.name))
      );
      const allJobs = jobsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const myJobs = allJobs
        .filter(j => j.date >= startDate && j.date <= endDate)
        .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
      setJobs(myJobs);

      // 최신 업데이트 타임스탬프
      let maxTs = null;
      for (const j of myJobs) {
        if (j.createdAt) {
          const jd = j.createdAt.toDate ? j.createdAt.toDate() : new Date(j.createdAt);
          if (!maxTs || jd > maxTs) maxTs = jd;
        }
      }
      setLastUpdated(maxTs ? { toDate: () => maxTs } : null);

      // 보고서 제출 여부
      if (myJobs.length > 0) {
        const allIds = myJobs.map(j => j.id);
        const rmap = {};
        for (let i = 0; i < allIds.length; i += 10) {
          const chunk = allIds.slice(i, i + 10);
          const rSnap = await getDocs(
            query(collection(db, 'reports'), where('workerId', '==', currentUser.uid), where('jobId', 'in', chunk))
          );
          rSnap.docs.forEach(d => { rmap[d.data().jobId] = d.id; });
        }
        setReports(rmap);
      } else {
        setReports({});
      }

      // 미배정 작업 로드 (이번 달 전체에서)
      const allMonthSnap = await getDocs(
        query(collection(db, 'jobs'),
          where('date', '>=', startDate),
          where('date', '<=', endDate))
      );
      const unassigned = allMonthSnap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(j => isUnassignedJob(j))
        .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
      setUnassignedJobs(unassigned);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // 날짜별 작업 맵 (내 작업 + 미배정 작업 통합)
  const jobsByDate = {};
  dates.forEach(d => { jobsByDate[d] = []; });
  jobs.forEach(j => {
    if (jobsByDate[j.date]) jobsByDate[j.date].push({ ...j, _unassigned: false });
  });
  unassignedJobs.forEach(j => {
    if (jobsByDate[j.date]) jobsByDate[j.date].push({ ...j, _unassigned: true });
  });

  const totalJobs = jobs.length;
  const doneJobs = jobs.filter(j => reports[j.id]).length;
  const unassignedCount = unassignedJobs.length;

  const SLOT_HALF = 20;
  const SLOT_GAP = 2;
  const SLOT_FULL = SLOT_HALF * 2 + SLOT_GAP;

  const JobSlot = ({ job, height = SLOT_HALF }) => {
    if (!job) {
      return <div style={{ height, borderRadius: 3, background: 'var(--gray-100)', border: '1px dashed var(--gray-200)' }} />;
    }
    const isDone = !!reports[job.id];
    const isUnassigned = job._unassigned;
    const line = getDisplayLine(job, linesList);
    const equipFull = extractEquipModel(job, equipNames);
    const equip = equipFull ? equipFull.split(/\s+/)[0] : '';
    const fallback = !line && !equip
      ? ((job.taskName || '').split(/\s+/).find(w => /^[A-Z]/.test(w) && w.length >= 2) || '작업')
      : '';

    return (
      <div
        onClick={() => navigate(`/report/${job.id}`)}
        style={{
          height, borderRadius: 3, cursor: 'pointer',
          background: cellBg(job, isDone),
          padding: '1px 2px', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 1,
          border: isUnassigned ? '1.5px dashed rgba(255,255,255,0.6)' : 'none',
        }}
      >
        {isUnassigned ? (
          <div style={{ fontSize: 7, fontWeight: 800, color: 'white', lineHeight: 1.1, textAlign: 'center' }}>
            미배정
          </div>
        ) : (
          <>
            {line && (
              <div style={{ fontSize: 8, fontWeight: 800, color: 'white', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {line}
              </div>
            )}
            {equip && (
              <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.88)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {equip}
              </div>
            )}
            {fallback && (
              <div style={{ fontSize: 8, fontWeight: 600, color: 'rgba(255,255,255,0.85)', lineHeight: 1.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fallback}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  return (
    <Layout title="월간 일정">
      {/* Month switcher */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button className="btn btn-sm btn-gray" style={{ width: 36 }} onClick={() => setMonthOffset(o => o - 1)}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{year}년 {month}월</div>
        <button className="btn btn-sm btn-gray" style={{ width: 36 }} onClick={() => setMonthOffset(o => o + 1)}>›</button>
      </div>

      {/* 미배정 경고 배너 */}
      {!loading && unassignedCount > 0 && (
        <div style={{
          background: '#fff7ed', border: '1.5px solid #fb923c',
          borderRadius: 10, padding: '10px 14px', marginBottom: 10,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#c2410c' }}>
              작업자 미배정 {unassignedCount}건
            </div>
            <div style={{ fontSize: 11, color: '#9a3412', marginTop: 1 }}>
              아래 주황색 일정을 확인하세요
            </div>
          </div>
        </div>
      )}

      {/* Summary bar */}
      <div style={{
        background: 'white', borderRadius: 10, padding: '10px 14px',
        marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
          {lastUpdated ? `일정 업데이트 ${formatTimestamp(lastUpdated)}` : '배정된 작업 없음'}
        </div>
        {!loading && totalJobs > 0 && (
          <div style={{ fontSize: 13, fontWeight: 700, color: doneJobs === totalJobs ? 'var(--secondary)' : 'var(--primary)' }}>
            {doneJobs}/{totalJobs} 제출
          </div>
        )}
      </div>

      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : (
        <>
          {/* ── Calendar Grid ── */}
          <div style={{
            background: 'white', borderRadius: 12,
            padding: '10px 8px 12px', marginBottom: 10,
            boxShadow: '0 1px 3px rgba(0,0,0,0.07)',
          }}>
            {/* Day-of-week header */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3, marginBottom: 4 }}>
              {DAY_LABELS.map((label, i) => (
                <div key={label} style={{
                  textAlign: 'center', fontSize: 10, fontWeight: 700,
                  color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : 'var(--gray-500)',
                }}>
                  {label}
                </div>
              ))}
            </div>

            {/* Date cells */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
              {Array.from({ length: firstDow }).map((_, i) => (
                <div key={`e${i}`} />
              ))}

              {dates.map(dateStr => {
                const dt = new Date(dateStr + 'T00:00:00');
                const dow = dt.getDay();
                const isToday = dateStr === today;
                const dayJobs = jobsByDate[dateStr] || [];
                const hasJob = dayJobs.length > 0;
                const hasUnassigned = dayJobs.some(j => j._unassigned);

                return (
                  <div
                    key={dateStr}
                    style={{
                      display: 'flex', flexDirection: 'column', gap: SLOT_GAP,
                      borderRadius: 5, padding: '2px 2px 3px',
                      background: isToday ? 'var(--primary-light)' : hasJob ? 'var(--gray-50)' : 'transparent',
                      border: `1.5px solid ${isToday ? 'var(--primary)' : hasUnassigned && !isToday ? '#fb923c' : 'var(--gray-200)'}`,
                    }}
                  >
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: 11, fontWeight: 800, lineHeight: 1.2,
                        color: isToday ? 'var(--primary)' : dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : 'var(--gray-900)',
                      }}>
                        {dt.getDate()}
                      </div>
                    </div>

                    {dayJobs.length >= 2 ? (
                      <>
                        <JobSlot job={dayJobs[0]} height={SLOT_HALF} />
                        <JobSlot job={dayJobs[1]} height={SLOT_HALF} />
                        {dayJobs.length > 2 && (
                          <div style={{ fontSize: 7, textAlign: 'center', color: 'var(--gray-400)', lineHeight: 1 }}>
                            +{dayJobs.length - 2}
                          </div>
                        )}
                      </>
                    ) : (
                      <JobSlot job={dayJobs[0] || null} height={SLOT_FULL} />
                    )}
                  </div>
                );
              })}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
              {[
                { color: 'var(--primary)', label: '일반' },
                { color: 'var(--night)', label: '야간' },
                { color: 'var(--special)', label: '특근' },
                { color: 'var(--secondary)', label: '제출완료' },
                { color: UNASSIGNED_COLOR, label: '미배정', dashed: true },
              ].map(({ color, label, dashed }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-500)' }}>
                  <div style={{
                    width: 10, height: 10, borderRadius: 2, background: color, flexShrink: 0,
                    border: dashed ? '1.5px dashed rgba(255,255,255,0.6)' : 'none',
                    outline: dashed ? `1px solid ${color}` : 'none',
                  }} />
                  {label}
                </div>
              ))}
            </div>
          </div>

          {/* ── Detail List ── */}
          {totalJobs === 0 && unassignedCount === 0 ? (
            <div className="empty-state" style={{ paddingTop: 24 }}>
              <div className="emoji">📅</div>
              <p>이번 달 배정된 작업이 없습니다</p>
            </div>
          ) : (
            dates.map(dateStr => {
              const dayJobs = jobsByDate[dateStr];
              if (dayJobs.length === 0) return null;
              const dt = new Date(dateStr + 'T00:00:00');
              const dow = dt.getDay();
              const isToday = dateStr === today;

              return (
                <div key={dateStr}>
                  <div style={{
                    fontSize: 12, fontWeight: 700, padding: '8px 2px 4px',
                    color: isToday ? 'var(--primary)' : 'var(--gray-500)',
                    display: 'flex', alignItems: 'center', gap: 6,
                  }}>
                    {DAY_LABELS[dow]}요일 {dt.getMonth() + 1}/{dt.getDate()}
                    {isToday && (
                      <span style={{ background: 'var(--primary)', color: 'white', borderRadius: 10, fontSize: 10, padding: '1px 7px' }}>오늘</span>
                    )}
                  </div>

                  {dayJobs.map(job => {
                    const isUnassigned = job._unassigned;
                    const isDone = !isUnassigned && !!reports[job.id];
                    const isNight = job.isNight;
                    const isSpecial = job.isSpecial || isSpecialWork(job.date);
                    const borderColor = isUnassigned
                      ? UNASSIGNED_COLOR
                      : isDone ? 'var(--secondary)'
                      : isNight ? 'var(--night)'
                      : isSpecial ? 'var(--special)'
                      : 'var(--gray-200)';
                    const { mainPart, requesterPart } = splitTaskName(job.taskName || job.rawDescription || '');

                    return (
                      <div
                        key={job.id}
                        onClick={() => navigate(`/report/${job.id}`)}
                        style={{
                          background: isUnassigned ? '#fff7ed' : 'white',
                          borderRadius: 10,
                          padding: '10px 12px', marginBottom: 6,
                          borderLeft: `3px solid ${borderColor}`,
                          cursor: 'pointer', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-900)', flexShrink: 0 }}>
                            {job.startTime && job.endTime ? `${job.startTime} ~ ${job.endTime}` : job.timeInfo || '시간 미정'}
                          </div>
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {isUnassigned && (
                              <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 700, background: '#fff7ed', color: '#c2410c', border: '1px solid #fb923c' }}>
                                ⚠ 미배정
                              </span>
                            )}
                            {!isUnassigned && isNight && <span className="badge badge-night">야간</span>}
                            {!isUnassigned && isSpecial && <span className="badge badge-special">특근</span>}
                            {!isUnassigned && (isDone
                              ? <span className="badge badge-done">제출</span>
                              : <span className="badge badge-pending">미제출</span>)}
                          </div>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--gray-700)', marginTop: 4, lineHeight: 1.4 }}>
                          {mainPart || job.taskName}
                        </div>
                        {requesterPart && (
                          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 2 }}>
                            {requesterPart}
                          </div>
                        )}
                        {isUnassigned && (
                          <div style={{
                            marginTop: 6, padding: '6px 10px',
                            background: '#fef2f2', borderRadius: 6,
                            fontSize: 12, color: '#dc2626', fontWeight: 700,
                          }}>
                            ⚠ 작업자 배정 필요 — 업데이트 예정
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </>
      )}
    </Layout>
  );
}
