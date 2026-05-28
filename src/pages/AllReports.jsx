import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import { formatDateKo, formatHours } from '../utils/timeCalc';
import { WORKERS } from '../utils/workers';

export default function AllReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const navigate = useNavigate();

  useEffect(() => { loadReports(); }, [filterWorker, filterMonth]);

  const loadReports = async () => {
    setLoading(true);
    try {
      let q = query(collection(db, 'reports'), orderBy('date', 'desc'), limit(200));
      if (filterWorker) {
        q = query(collection(db, 'reports'),
          where('workerName', '==', filterWorker),
          orderBy('date', 'desc'), limit(200));
      }
      const snap = await getDocs(q);
      let list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      if (filterMonth) list = list.filter(r => r.date?.startsWith(filterMonth));
      setReports(list);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const filtered = reports.filter(r => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      r.workerName?.includes(search) ||
      r.taskName?.toLowerCase().includes(s) ||
      r.notes?.toLowerCase().includes(s) ||
      r.equipmentId?.toLowerCase().includes(s) ||
      r.chamber?.toLowerCase().includes(s) ||
      r.requester?.includes(search)
    );
  });

  return (
    <Layout title="보고서 조회">
      {/* Search */}
      <div className="search-bar">
        <svg className="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input
          type="text"
          placeholder="이름, 설비, 특이사항 검색..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <select
          className="form-select"
          style={{ flex: 1 }}
          value={filterWorker}
          onChange={e => setFilterWorker(e.target.value)}
        >
          <option value="">전체 작업자</option>
          {WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <input
          type="month"
          className="form-input"
          style={{ flex: 1 }}
          value={filterMonth}
          onChange={e => setFilterMonth(e.target.value)}
        />
      </div>

      {/* Results */}
      <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 8 }}>
        총 {filtered.length}건
      </div>

      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🔍</div>
          <p>검색 결과가 없습니다</p>
        </div>
      ) : (
        filtered.map(r => (
          <div
            key={r.id}
            className="card"
            style={{ cursor: 'pointer' }}
            onClick={() => navigate(`/report-view/${r.id}`)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{r.workerName}</div>
              <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>{formatDateKo(r.date)}</div>
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-700)', marginBottom: 6, lineHeight: 1.4 }}>
              {r.taskName}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
                {formatHours(r.totalHours)}
              </span>
              {r.isNight && <span className="badge badge-night">야간</span>}
              {r.isSpecial && <span className="badge badge-special">특근</span>}
              {r.notes && (
                <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  특이사항 있음
                </span>
              )}
            </div>
          </div>
        ))
      )}
    </Layout>
  );
}
