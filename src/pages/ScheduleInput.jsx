import { useState, useEffect } from 'react';
import { collection, serverTimestamp, writeBatch, doc, query, where, getDocs, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { parseScheduleText, inferDateString, parseJobDetails } from '../utils/parser';
import { isSpecialWork } from '../utils/holidays';
import { todayStr } from '../utils/timeCalc';

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function getMonthInfo(year, month) {
  const firstDow = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const dates = Array.from({ length: daysInMonth }, (_, i) =>
    `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`
  );
  return { firstDow, dates };
}

function ExistingCalendar({ onRefreshRef }) {
  const today = todayStr();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [jobsByDate, setJobsByDate] = useState({});
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);

  const { firstDow, dates } = getMonthInfo(year, month);

  const load = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(
        query(collection(db, 'jobs'),
          where('date', '>=', dates[0]),
          where('date', '<=', dates[dates.length - 1]))
      );
      const map = {};
      snap.docs.forEach(d => {
        const date = d.data().date;
        if (!map[date]) map[date] = [];
        map[date].push(d.data());
      });
      setJobsByDate(map);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year, month]);

  // 외부에서 새로고침 트리거 가능하도록
  if (onRefreshRef) onRefreshRef.current = load;

  const prev = () => { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); };
  const next = () => { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); };

  const totalDays = dates.filter(d => jobsByDate[d]?.length > 0).length;
  const totalJobs = Object.values(jobsByDate).reduce((s, j) => s + j.length, 0);

  const selectedJobs = selectedDate ? (jobsByDate[selectedDate] || []) : [];

  return (
    <div className="card" style={{ padding: '12px 10px' }}>
      {/* 월 네비게이션 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <button className="btn btn-sm btn-gray" style={{ width: 32, padding: 0 }} onClick={prev}>‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>{year}년 {month}월</div>
          {!loading && <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>{totalDays}일 · 총 {totalJobs}건 입력됨</div>}
        </div>
        <button className="btn btn-sm btn-gray" style={{ width: 32, padding: 0 }} onClick={next}>›</button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: 16, color: 'var(--gray-400)', fontSize: 13 }}>불러오는 중...</div>
      ) : (
        <>
          {/* 요일 헤더 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
            {DAY_LABELS.map((l, i) => (
              <div key={l} style={{
                textAlign: 'center', fontSize: 10, fontWeight: 700,
                color: i === 0 ? '#ef4444' : i === 6 ? '#3b82f6' : 'var(--gray-400)',
                paddingBottom: 2,
              }}>{l}</div>
            ))}
          </div>

          {/* 날짜 셀 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
            {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
            {dates.map(dateStr => {
              const dt = new Date(dateStr + 'T00:00:00');
              const dow = dt.getDay();
              const jobs = jobsByDate[dateStr] || [];
              const hasJob = jobs.length > 0;
              const isToday = dateStr === today;
              const isSelected = dateStr === selectedDate;
              const nightCount = jobs.filter(j => j.isNight).length;
              const specialCount = jobs.filter(j => j.isSpecial).length;
              const unassignedCount = jobs.filter(j => isUnassignedJob(j)).length;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(isSelected ? null : dateStr)}
                  style={{
                    borderRadius: 6, padding: '4px 2px',
                    cursor: hasJob ? 'pointer' : 'default',
                    border: `1.5px solid ${isSelected ? 'var(--primary)' : unassignedCount > 0 ? '#ef4444' : isToday ? 'var(--primary)' : hasJob ? 'var(--gray-200)' : 'var(--gray-100)'}`,
                    background: isSelected ? 'var(--primary)' : unassignedCount > 0 ? '#fef2f2' : hasJob ? 'var(--gray-50)' : 'transparent',
                    transition: 'all 0.1s',
                  }}
                >
                  <div style={{
                    textAlign: 'center', fontSize: 11, fontWeight: 800, lineHeight: 1.3,
                    color: isSelected ? 'white' : unassignedCount > 0 ? '#dc2626' : isToday ? 'var(--primary)' : dow === 0 ? '#ef4444' : dow === 6 ? '#3b82f6' : 'var(--gray-900)',
                  }}>
                    {dt.getDate()}
                  </div>
                  {hasJob && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        fontSize: 10, fontWeight: 700, lineHeight: 1.2,
                        color: isSelected ? 'rgba(255,255,255,0.9)' : unassignedCount > 0 ? '#dc2626' : 'var(--primary)',
                      }}>
                        {jobs.length}건
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'center', gap: 2, marginTop: 1 }}>
                        {unassignedCount > 0 && (
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSelected ? 'white' : '#ef4444' }} />
                        )}
                        {nightCount > 0 && (
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSelected ? 'white' : 'var(--night)' }} />
                        )}
                        {specialCount > 0 && (
                          <div style={{ width: 5, height: 5, borderRadius: '50%', background: isSelected ? 'white' : 'var(--special)' }} />
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* 선택된 날 상세 */}
          {selectedDate && (() => {
            const unassigned = selectedJobs.filter(j => isUnassignedJob(j)).length;
            return (
              <div style={{ marginTop: 10, borderTop: '1px solid var(--gray-100)', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)' }}>
                    {new Date(selectedDate + 'T00:00:00').getMonth() + 1}/{new Date(selectedDate + 'T00:00:00').getDate()} 작업 {selectedJobs.length}건
                  </div>
                  {unassigned > 0 && (
                    <div style={{ fontSize: 11, fontWeight: 800, color: '#dc2626' }}>
                      ⚠ 미배정 {unassigned}건
                    </div>
                  )}
                </div>
                {selectedJobs.map((job, i) => {
                  const noWorker = isUnassignedJob(job);
                  return (
                    <div key={i} style={{
                      padding: '8px 10px', borderRadius: 8, marginBottom: 6,
                      background: noWorker ? '#fef2f2' : 'white',
                      border: `1px solid ${noWorker ? '#fca5a5' : 'var(--gray-200)'}`,
                      borderLeft: `3px solid ${noWorker ? '#ef4444' : job.isNight ? 'var(--night)' : job.isSpecial ? 'var(--special)' : 'var(--primary)'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 2 }}>
                            {job.timeInfo || job.startTime}
                            {job.isNight && <span style={{ color: 'var(--night)', fontWeight: 700, marginLeft: 4 }}>야간</span>}
                            {job.isSpecial && <span style={{ color: 'var(--special)', fontWeight: 700, marginLeft: 4 }}>특근</span>}
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-900)', lineHeight: 1.35, marginBottom: 3 }}>
                            {(job.taskName || '').slice(0, 60)}{job.taskName?.length > 60 ? '…' : ''}
                          </div>
                          {noWorker ? (
                            <div style={{ fontSize: 11, fontWeight: 800, color: '#dc2626' }}>
                              작업자 배정 필요
                            </div>
                          ) : (
                            <div style={{ fontSize: 11, color: 'var(--primary)', fontWeight: 600 }}>
                              {(job.assignedWorkers || []).join(', ')}
                            </div>
                          )}
                        </div>
                        {noWorker && (
                          <span style={{
                            fontSize: 10, padding: '2px 7px', borderRadius: 10, fontWeight: 800,
                            background: '#dc2626', color: 'white', flexShrink: 0,
                          }}>미배정</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}

          {/* 범례 */}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
            {[
              { color: '#ef4444', label: '미배정' },
              { color: 'var(--night)', label: '야간' },
              { color: 'var(--special)', label: '특근' },
            ].map(({ color, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--gray-400)' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
                {label}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function isUnassignedJob(job) {
  if (!job.assignedWorkers) return true;
  return job.assignedWorkers.filter(w => w && w.trim()).length === 0;
}

export default function ScheduleInput() {
  const { currentUser, workerProfile } = useAuth();
  const [text, setText] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedModal, setSavedModal] = useState(null);
  const [error, setError] = useState('');
  const refreshCalendarRef = { current: null };

  const handlePasteAndSave = async (pastedText) => {
    if (!pastedText.trim()) return;
    setError('');
    setSaving(true);
    try {
      const data = parseScheduleText(pastedText);
      const tasks = data.reduce((acc, d) => acc + d.tasks.length, 0);
      if (tasks === 0) { setSaving(false); return; }

      const dates = data.map(day => inferDateString(day.month, day.day, day.dayOfWeek));
      for (const dateStr of dates) {
        const existing = await getDocs(query(collection(db, 'jobs'), where('date', '==', dateStr)));
        for (const d of existing.docs) await deleteDoc(doc(db, 'jobs', d.id));
      }

      const batch = writeBatch(db);
      let unassignedCount = 0;
      for (const day of data) {
        const dateStr = inferDateString(day.month, day.day, day.dayOfWeek);
        const isSpecial = isSpecialWork(dateStr) || day.isHoliday;
        for (const task of day.tasks) {
          const details = parseJobDetails(task.taskName);
          const isNight = task.endTime ? parseInt(task.endTime) >= 18 : false;
          if (!task.workers.length) unassignedCount++;
          const ref = doc(collection(db, 'jobs'));
          batch.set(ref, {
            date: dateStr, month: day.month, day: day.day, dayOfWeek: day.dayOfWeek,
            startTime: task.startTime || '', endTime: task.endTime || '',
            timeInfo: task.timeInfo || '', workHours: task.workHours || 0,
            taskName: task.taskName, rawLine: task.rawLine || '',
            assignedWorkers: task.workers, isNight, isSpecial,
            requester: details.requester, line: details.line, floor: details.floor,
            bay: details.bay, process: details.process, chamber: details.chamber,
            equipmentId: details.equipmentId, client: details.client,
            pmReason: '', createdAt: serverTimestamp(),
            createdBy: currentUser.uid, createdByName: workerProfile?.name || ''
          });
        }
      }
      await batch.commit();
      setSavedModal({ count: tasks, unassigned: unassignedCount });
      setText('');
      if (refreshCalendarRef.current) refreshCalendarRef.current();
    } catch (e) {
      console.error(e);
      setError('자동 저장 중 오류: ' + e.message);
    } finally {
      setSaving(false);
    }
  };


  return (
    <Layout title="주간일정 입력">
      {error && <div className="alert alert-error">{error}</div>}
      {saving && <div className="alert" style={{ background: 'var(--primary-light)', color: 'var(--primary)', border: '1px solid var(--primary)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, fontWeight: 600 }}>⏳ 저장 중...</div>}

      {/* 저장 완료 팝업 */}
      {savedModal && (
        <div onClick={() => setSavedModal(null)} style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          background: 'rgba(0,0,0,0.45)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '24px 16px',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: 20, width: '100%', maxWidth: 340,
            padding: '32px 24px', textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
          }}>
            <div style={{ fontSize: 44, marginBottom: 14 }}>✅</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--gray-900)', marginBottom: 8 }}>
              일정을 저장했습니다
            </div>
            <div style={{ fontSize: 14, color: 'var(--gray-500)', marginBottom: 4 }}>
              총 {savedModal.count}건 저장
            </div>
            {savedModal.unassigned > 0 && (
              <div style={{ fontSize: 13, color: '#dc2626', fontWeight: 700, marginBottom: 4 }}>
                ⚠ 작업자 미배정 {savedModal.unassigned}건
              </div>
            )}
            <button
              className="btn btn-primary btn-full"
              style={{ marginTop: 20 }}
              onClick={() => setSavedModal(null)}
            >
              확인
            </button>
          </div>
        </div>
      )}

      {/* 기존 입력 현황 달력 — 항상 표시 */}
      <ExistingCalendar onRefreshRef={refreshCalendarRef} />

      <div className="card" style={{ marginTop: 10 }}>
        <div className="card-title">카카오톡 일정 붙여넣기</div>
        <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 10 }}>
          단톡방 주간 일정을 아래에 붙여넣으면 자동으로 저장됩니다.
        </p>
        <textarea
          className="form-textarea"
          style={{ minHeight: 160, fontSize: 13 }}
          placeholder={'▣ 2026년 6월 1주 (6.1~6.5)\n\n<6월 1일 월요일>\n■10시-15시(5시간 기준) 김정규프로 P1F ... / 이상엽, 김진탁'}
          value={text}
          onChange={e => setText(e.target.value)}
          onPaste={e => {
            const pastedText = e.clipboardData.getData('text');
            if (pastedText) {
              e.preventDefault();
              setText('');
              handlePasteAndSave(pastedText);
            }
          }}
        />
      </div>
    </Layout>
  );
}
