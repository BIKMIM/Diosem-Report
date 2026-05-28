import { useState } from 'react';
import { collection, addDoc, serverTimestamp, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { parseScheduleText, inferDateString, parseJobDetails } from '../utils/parser';
import { isSpecialWork } from '../utils/holidays';

export default function ScheduleInput() {
  const { currentUser, workerProfile } = useAuth();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const handleParse = () => {
    if (!text.trim()) return setError('일정 텍스트를 붙여넣어 주세요.');
    setError('');
    setSaved(false);
    try {
      const data = parseScheduleText(text);
      setParsed(data);
    } catch (e) {
      setError('파싱 중 오류가 발생했습니다. 텍스트 형식을 확인해주세요.');
    }
  };

  const totalTasks = parsed?.reduce((acc, d) => acc + d.tasks.length, 0) || 0;

  const handleSave = async () => {
    if (!parsed) return;
    setSaving(true);
    setError('');
    try {
      const batch = writeBatch(db);
      for (const day of parsed) {
        const dateStr = inferDateString(day.month, day.day, day.dayOfWeek);
        const isSpecial = isSpecialWork(dateStr) || day.isHoliday;

        for (const task of day.tasks) {
          const details = parseJobDetails(task.taskName);
          const isNight = task.endTime
            ? parseInt(task.endTime) >= 18
            : false;

          const ref = doc(collection(db, 'jobs'));
          batch.set(ref, {
            date: dateStr,
            month: day.month,
            day: day.day,
            dayOfWeek: day.dayOfWeek,
            startTime: task.startTime || '',
            endTime: task.endTime || '',
            timeInfo: task.timeInfo || '',
            workHours: task.workHours || 0,
            taskName: task.taskName,
            rawLine: task.rawLine || '',
            assignedWorkers: task.workers,
            isNight,
            isSpecial,
            requester: details.requester,
            line: details.line,
            floor: details.floor,
            bay: details.bay,
            process: details.process,
            chamber: details.chamber,
            equipmentId: details.equipmentId,
            client: details.client,
            pmReason: '',
            createdAt: serverTimestamp(),
            createdBy: currentUser.uid,
            createdByName: workerProfile?.name || ''
          });
        }
      }
      await batch.commit();
      setSaved(true);
      setParsed(null);
      setText('');
    } catch (e) {
      console.error(e);
      setError('저장 중 오류가 발생했습니다: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout title="일정 입력">
      {error && <div className="alert alert-error">{error}</div>}
      {saved && <div className="alert alert-success">✅ {totalTasks > 0 ? `${totalTasks}건의 작업이 저장되었습니다.` : '저장 완료'}</div>}

      {!parsed ? (
        <>
          <div className="card">
            <div className="card-title">카카오톡 일정 붙여넣기</div>
            <p style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 12 }}>
              단톡방에 공유된 주간 일정 텍스트를 아래에 그대로 붙여넣으세요.
            </p>
            <div className="form-group">
              <textarea
                className="form-textarea"
                style={{ minHeight: 200, fontSize: 13 }}
                placeholder={'▣ 2026년 5월 4주 (5.25~5.29)\n\n<5월 26일 화요일>\n■10시-15시(5시간 기준) 서진수프로 ... / 강범일, 임영곤'}
                value={text}
                onChange={e => setText(e.target.value)}
              />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleParse}>
              파싱 미리보기
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="card" style={{ background: 'var(--primary-light)', borderColor: 'var(--primary)' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>
              파싱 결과: {parsed.length}일, 총 {totalTasks}건 작업
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-700)', marginTop: 4 }}>
              아래 내용을 확인하고 저장하세요.
            </div>
          </div>

          {parsed.map((day, di) => (
            <div key={di} className="card">
              <div className="card-title">
                {day.month}월 {day.day}일 ({day.dayOfWeek})
                {day.isHoliday && <span className="badge badge-special" style={{ marginLeft: 8 }}>{day.holidayName}</span>}
              </div>

              {(day.yearLeave.length > 0 || day.halfLeave.length > 0 || day.education.length > 0) && (
                <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>
                  {day.yearLeave.length > 0 && `연차: ${day.yearLeave.join(', ')} `}
                  {day.halfLeave.length > 0 && `반차: ${day.halfLeave.join(', ')} `}
                  {day.education.length > 0 && `교육: ${day.education.join(', ')}`}
                </div>
              )}

              {day.tasks.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>작업 없음</div>
              ) : (
                day.tasks.map((task, ti) => (
                  <div key={ti} style={{
                    padding: '10px 0',
                    borderBottom: ti < day.tasks.length - 1 ? '1px solid var(--gray-100)' : 'none'
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-900)' }}>
                      {task.timeInfo}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray-700)', marginTop: 2 }}>
                      {task.taskName}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 4 }}>
                      작업자: {task.workers.join(', ')}
                    </div>
                  </div>
                ))
              )}
            </div>
          ))}

          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button className="btn btn-gray" style={{ flex: 1 }} onClick={() => setParsed(null)}>
              다시 입력
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 2 }}
              onClick={handleSave}
              disabled={saving || totalTasks === 0}
            >
              {saving ? '저장 중...' : `${totalTasks}건 저장하기`}
            </button>
          </div>
        </>
      )}
    </Layout>
  );
}
