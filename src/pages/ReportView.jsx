import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { formatDateKo, formatHours } from '../utils/timeCalc';

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

export default function ReportView() {
  const { reportId } = useParams();
  const { currentUser } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    getDoc(doc(db, 'reports', reportId)).then(snap => {
      if (snap.exists()) setReport({ id: snap.id, ...snap.data() });
      setLoading(false);
    });
  }, [reportId]);

  if (loading) return <Layout title="보고서 상세"><div className="loading">불러오는 중...</div></Layout>;
  if (!report) return <Layout title="보고서 상세"><div className="alert alert-error">보고서를 찾을 수 없습니다.</div></Layout>;

  const Row = ({ label, value }) => value ? (
    <div className="info-row">
      <span className="info-label">{label}</span>
      <span className="info-value">{value}</span>
    </div>
  ) : null;

  const scope = [
    report.wall && 'Wall', report.lidDome && 'LID/Dome', report.tm && 'T/M',
    report.ll && 'L/L', report.parts && `Parts(${report.partsCount || ''})`
  ].filter(Boolean);

  const saved = report.chamberStatus || [];
  // Options that are saved but not in any group (legacy values)
  const knownOptions = CHAMBER_STATUS_GROUPS.flatMap(g => g.options);
  const extraChips = saved.filter(s => !knownOptions.includes(s));

  const chipStyle = (selected) => ({
    padding: '6px 12px',
    border: `2px solid ${selected ? 'var(--primary)' : 'var(--gray-200)'}`,
    borderRadius: 20,
    background: selected ? 'var(--primary-light)' : 'var(--gray-50)',
    color: selected ? 'var(--primary)' : 'var(--gray-400)',
    fontWeight: selected ? 700 : 400,
    fontSize: 13,
  });

  return (
    <Layout title="보고서 상세">
      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 18, fontWeight: 700 }}>{report.workerName}</div>
          <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>{formatDateKo(report.date)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          {report.isNight && <span className="badge badge-night">야간</span>}
          {report.isSpecial && <span className="badge badge-special">특근</span>}
        </div>
        <div style={{ marginTop: 10, fontSize: 13, color: 'var(--gray-700)', lineHeight: 1.5 }}>
          {report.taskName}
        </div>
      </div>

      {/* 시간 */}
      <div className="card">
        <div className="card-title">시간</div>
        <Row label="입실 1" value={report.entryTime1} />
        <Row label="퇴실 1" value={report.exitTime1} />
        {report.entryTime2 && <Row label="입실 2" value={report.entryTime2} />}
        {report.exitTime2 && <Row label="퇴실 2" value={report.exitTime2} />}
        <div style={{ textAlign: 'center', padding: 12, background: 'var(--primary-light)', borderRadius: 8, marginTop: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--primary)' }}>총 실 근무시간</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>
            {formatHours(report.totalHours)}
          </div>
        </div>
      </div>

      {/* 작업 범위 */}
      {scope.length > 0 && (
        <div className="card">
          <div className="card-title">작업 범위</div>
          <div style={{ fontSize: 14 }}>{scope.join(', ')}</div>
          {report.otherScope && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--gray-500)' }}>기타: {report.otherScope}</div>}
        </div>
      )}

      {/* 장비 상태 — 폼과 동일한 그룹 칩 스타일 */}
      {(saved.length > 0 || report.difficulty) && (
        <div className="card">
          <div className="card-title">장비 상태</div>
          {CHAMBER_STATUS_GROUPS.map(group => {
            const hasSelected = group.options.some(o => saved.includes(o));
            return (
              <div key={group.label} style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: 1, marginBottom: 6 }}>
                  {group.label}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {group.options.map(opt => (
                    <span key={opt} style={chipStyle(saved.includes(opt))}>{opt}</span>
                  ))}
                </div>
              </div>
            );
          })}

          {/* 기존 데이터에만 있는 레거시 칩 */}
          {extraChips.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {extraChips.map(c => (
                <span key={c} style={chipStyle(true)}>{c}</span>
              ))}
            </div>
          )}

          {/* 난이도 */}
          {report.difficulty && (
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--gray-400)', letterSpacing: 1, marginBottom: 6 }}>
                난이도
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {DIFFICULTY_OPTIONS.map(({ value, label, sub }) => {
                  const selected = report.difficulty === value;
                  return (
                    <span
                      key={value}
                      style={{
                        flex: 1, textAlign: 'center', padding: '10px 6px',
                        border: `2px solid ${selected ? 'var(--primary)' : 'var(--gray-200)'}`,
                        borderRadius: 8,
                        background: selected ? 'var(--primary-light)' : 'var(--gray-50)',
                        color: selected ? 'var(--primary)' : 'var(--gray-400)',
                      }}
                    >
                      <div style={{ fontSize: 14, fontWeight: selected ? 700 : 400, lineHeight: 1.3 }}>{label}</div>
                      <div style={{ fontSize: 10, marginTop: 3, lineHeight: 1.3 }}>{sub}</div>
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 기타 */}
      {report.confirmer && (
        <div className="card">
          <div className="card-title">기타</div>
          <Row label="확인자" value={report.confirmer} />
        </div>
      )}

      {report.notes && (
        <div className="card">
          <div className="card-title">기타 특이사항</div>
          <div style={{ fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', color: 'var(--gray-800)' }}>
            {report.notes}
          </div>
        </div>
      )}

      {currentUser?.uid === report.workerId && (
        <button
          className="btn btn-outline btn-full"
          onClick={() => navigate(`/report/${report.jobId}`)}
        >
          보고서 수정
        </button>
      )}
    </Layout>
  );
}
