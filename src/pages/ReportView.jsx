import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { formatDateKo, formatHours } from '../utils/timeCalc';

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

  return (
    <Layout title="보고서 상세">
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

      <div className="card">
        <div className="card-title">시간</div>
        <Row label="입실 1" value={report.entryTime1} />
        <Row label="퇴실 1" value={report.exitTime1} />
        {report.entryTime2 && <Row label="입실 2" value={report.entryTime2} />}
        {report.exitTime2 && <Row label="퇴실 2" value={report.exitTime2} />}
        <Row label="이동시간" value={`${report.travelMinutes}분`} />
        <div style={{ textAlign: 'center', padding: 12, background: 'var(--primary-light)', borderRadius: 8, marginTop: 8 }}>
          <div style={{ fontSize: 13, color: 'var(--primary)' }}>총 실 근무시간</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>
            {formatHours(report.totalHours)}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">작업 범위</div>
        <div style={{ fontSize: 14 }}>{scope.length > 0 ? scope.join(', ') : '-'}</div>
        {report.otherScope && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--gray-500)' }}>기타: {report.otherScope}</div>}
      </div>

      <div className="card">
        <div className="card-title">장비 상태</div>
        <Row label="패드 방수" value={`${report.padFrom || '-'} ~ ${report.padTo || '-'}`} />
        <Row label="챔버 표면" value={report.chamberSurface} />
        <Row label="D.I 볼림" value={report.diBoiling} />
        <Row label="오염 제거" value={report.contamination} />
        <Row label="작업 공간" value={report.workSpace} />
        <Row label="작업 자세" value={report.workPosture} />
        <Row label="난이도" value={report.difficulty} />
      </div>

      <div className="card">
        <div className="card-title">기타</div>
        <Row label="RCS 위치" value={report.rcsPosition} />
        <Row label="D.I 수취" value={report.diPosition} />
        <Row label="확인자" value={report.confirmer} />
      </div>

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
