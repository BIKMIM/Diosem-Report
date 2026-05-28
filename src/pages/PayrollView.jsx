import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import { WORKERS } from '../utils/workers';

export default function PayrollView() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [data, setData] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadData(); }, [year, month]);

  const loadData = async () => {
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

  const prevMonth = () => {
    if (month === 1) { setYear(y => y - 1); setMonth(12); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) { setYear(y => y + 1); setMonth(1); }
    else setMonth(m => m + 1);
  };

  const workers = WORKERS.filter(w => data[w]?.count > 0);
  const totalHours = workers.reduce((s, w) => s + (data[w]?.hours || 0), 0);

  const fmt = (h) => {
    if (!h) return '0:00';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${hh}:${String(mm).padStart(2, '0')}`;
  };

  return (
    <Layout title="급여 현황">
      <div className="month-selector">
        <button className="month-btn" onClick={prevMonth}>‹</button>
        <span className="month-display">{year}년 {month}월</span>
        <button className="month-btn" onClick={nextMonth}>›</button>
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
        {[
          { label: '총 보고서', value: workers.reduce((s, w) => s + data[w].count, 0) + '건' },
          { label: '총 근무시간', value: fmt(totalHours) },
          { label: '참여 인원', value: workers.length + '명' },
        ].map(({ label, value }) => (
          <div key={label} className="card" style={{ textAlign: 'center', padding: '12px 8px', margin: 0 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--primary)' }}>{value}</div>
            <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{label}</div>
          </div>
        ))}
      </div>

      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : workers.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">📊</div>
          <p>이 달의 보고서가 없습니다</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: 'var(--gray-50)' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', borderBottom: '1px solid var(--gray-200)' }}>작업자</th>
                <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--gray-200)' }}>건수</th>
                <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--gray-200)' }}>근무시간</th>
                <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--gray-200)', color: 'var(--night)' }}>야간</th>
                <th style={{ padding: '12px 8px', borderBottom: '1px solid var(--gray-200)', color: 'var(--special)' }}>특근</th>
              </tr>
            </thead>
            <tbody>
              {WORKERS.filter(w => data[w]?.count > 0).map((w, i) => (
                <tr key={w} style={{ background: i % 2 === 0 ? 'white' : 'var(--gray-50)' }}>
                  <td style={{ padding: '12px 16px', fontWeight: 600 }}>{w}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center' }}>{data[w].count}</td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', fontWeight: 700, color: 'var(--primary)' }}>
                    {fmt(data[w].hours)}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--night)', fontWeight: 600 }}>
                    {data[w].nightCount || '-'}
                  </td>
                  <td style={{ padding: '12px 8px', textAlign: 'center', color: 'var(--special)', fontWeight: 600 }}>
                    {data[w].specialCount || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
