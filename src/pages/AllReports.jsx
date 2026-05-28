import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, query, orderBy, limit, getDocs, where } from 'firebase/firestore';
import { db } from '../firebase';
import Layout from '../components/Layout';
import { formatDateKo, formatHours } from '../utils/timeCalc';
import { WORKERS } from '../utils/workers';
import { loadEquipmentNames, DEFAULT_EQUIPMENT_NAMES } from '../utils/equipmentNames';
import { loadLines, DEFAULT_LINES } from '../utils/lineNames';

function getPeriodRange(period) {
  const today = new Date();
  if (period === 'week') {
    const dow = today.getDay();
    const toMonday = dow === 0 ? -6 : 1 - dow;
    const mon = new Date(today);
    mon.setDate(today.getDate() + toMonday);
    const sun = new Date(mon);
    sun.setDate(mon.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return { start: fmt(mon), end: fmt(sun) };
  }
  if (period === 'month') {
    return { prefix: `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}` };
  }
  if (period === 'lastMonth') {
    const d = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return { prefix: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` };
  }
  return null;
}

// Equipment multi-select: type → all matches auto-checked → uncheck to narrow down
function EquipMultiSelect({ options, selected, onChange }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  // Deduplicate: if "Ultima" and "Ultima Wall" both match, show both (user needs to see/check them)
  const matches = input.length >= 1
    ? options.filter(o => o.toLowerCase().includes(input.toLowerCase())).slice(0, 10)
    : [];

  const toggle = (name) => {
    onChange(selected.includes(name) ? selected.filter(s => s !== name) : [...selected, name]);
  };

  const selectAll = () => {
    const toAdd = matches.filter(m => !selected.includes(m));
    onChange([...selected, ...toAdd]);
  };

  const allChecked = matches.length > 0 && matches.every(m => selected.includes(m));

  return (
    <div ref={wrapRef} style={{ flex: 1, minWidth: 0 }}>
      {/* Selected chips */}
      {selected.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
          {selected.map(s => (
            <div
              key={s}
              onPointerDown={e => { e.stopPropagation(); toggle(s); }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '4px 8px', background: 'var(--primary-light)',
                border: '1.5px solid var(--primary)', borderRadius: 20,
                fontSize: 12, fontWeight: 700, color: 'var(--primary)', cursor: 'pointer',
              }}
            >
              {s}
              <span style={{ fontSize: 14, lineHeight: 1 }}>×</span>
            </div>
          ))}
          {selected.length > 0 && (
            <div
              onPointerDown={e => { e.stopPropagation(); onChange([]); }}
              style={{ display: 'inline-flex', alignItems: 'center', padding: '4px 8px', background: 'var(--gray-100)', border: '1px solid var(--gray-200)', borderRadius: 20, fontSize: 11, color: 'var(--gray-500)', cursor: 'pointer' }}
            >
              전체해제
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <input
        className="form-input"
        placeholder={selected.length > 0 ? '장비 추가…' : '장비명 (Ultima…)'}
        value={input}
        onChange={e => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => { if (input.length >= 1) setOpen(true); }}
        style={{ fontSize: 13 }}
      />

      {/* Dropdown */}
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', left: 0, right: 0, zIndex: 200,
          background: 'white', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          border: '1px solid var(--gray-200)', overflow: 'hidden', marginTop: 3,
        }}>
          {/* 전체 선택 row */}
          <div
            onPointerDown={e => { e.preventDefault(); allChecked ? onChange(selected.filter(s => !matches.includes(s))) : selectAll(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px', borderBottom: '2px solid var(--gray-200)',
              background: 'var(--gray-50)', cursor: 'pointer',
            }}
          >
            <div style={{
              width: 18, height: 18, borderRadius: 4, flexShrink: 0,
              background: allChecked ? 'var(--primary)' : 'white',
              border: `2px solid ${allChecked ? 'var(--primary)' : 'var(--gray-300)'}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {allChecked && <span style={{ color: 'white', fontSize: 11, lineHeight: 1 }}>✓</span>}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--gray-700)' }}>
              "{input}" 전체 선택 ({matches.length}개)
            </span>
          </div>

          {/* Individual items */}
          {matches.map(opt => {
            const checked = selected.includes(opt);
            return (
              <div
                key={opt}
                onPointerDown={e => { e.preventDefault(); toggle(opt); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 14px', cursor: 'pointer',
                  borderBottom: '1px solid var(--gray-100)',
                  background: checked ? 'var(--primary-light)' : 'white',
                }}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                  background: checked ? 'var(--primary)' : 'white',
                  border: `2px solid ${checked ? 'var(--primary)' : 'var(--gray-300)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {checked && <span style={{ color: 'white', fontSize: 11, lineHeight: 1 }}>✓</span>}
                </div>
                <span style={{ fontSize: 14, fontWeight: checked ? 700 : 500, color: checked ? 'var(--primary)' : 'var(--gray-900)' }}>
                  {opt}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Autocomplete({ placeholder, value, onChange, options, onClear }) {
  const [input, setInput] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const close = (e) => { if (!wrapRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, []);

  const matches = input.length >= 1
    ? options.filter(o => o.toLowerCase().includes(input.toLowerCase())).slice(0, 8)
    : [];

  if (value) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: 5, height: 40,
        padding: '0 10px', background: 'var(--primary-light)',
        border: '1.5px solid var(--primary)', borderRadius: 8,
        fontSize: 13, fontWeight: 700, color: 'var(--primary)',
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
        <button
          onPointerDown={e => { e.stopPropagation(); onClear(); }}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: 18, lineHeight: 1, flexShrink: 0 }}
        >×</button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <input
        className="form-input"
        placeholder={placeholder}
        value={input}
        onChange={e => { setInput(e.target.value); setOpen(true); }}
        onFocus={() => { if (input.length >= 1) setOpen(true); }}
        style={{ fontSize: 13 }}
      />
      {open && matches.length > 0 && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 3px)', left: 0, right: 0, zIndex: 200,
          background: 'white', borderRadius: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          border: '1px solid var(--gray-200)', overflow: 'hidden',
        }}>
          {matches.map(opt => (
            <div
              key={opt}
              onPointerDown={e => { e.preventDefault(); onChange(opt); setInput(''); setOpen(false); }}
              style={{ padding: '11px 14px', fontSize: 14, fontWeight: 600, cursor: 'pointer', borderBottom: '1px solid var(--gray-100)', color: 'var(--gray-900)' }}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value, sub }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '8px 4px' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--gray-400)', marginTop: 1 }}>{sub}</div>}
      <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function AllReports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState('month');
  const [filterWorker, setFilterWorker] = useState('');
  const [filterLine, setFilterLine] = useState('');
  const [filterEquips, setFilterEquips] = useState([]);   // multi-select
  const [filterRequester, setFilterRequester] = useState('');
  const [filterEquipId, setFilterEquipId] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [equipNames, setEquipNames] = useState(DEFAULT_EQUIPMENT_NAMES);
  const [linesList, setLinesList] = useState(DEFAULT_LINES);
  const navigate = useNavigate();

  useEffect(() => {
    loadEquipmentNames().then(setEquipNames).catch(() => {});
    loadLines().then(setLinesList).catch(() => {});
  }, []);

  const loadReports = async () => {
    setLoading(true);
    setSearched(true);
    try {
      const snap = await getDocs(query(collection(db, 'reports'), orderBy('date', 'desc'), limit(300)));
      setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // Summary stats (작업자 선택시 해당 작업자 데이터만)
  const now = new Date();
  const thisYear = String(now.getFullYear());
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const statsBase = filterWorker ? reports.filter(r => r.workerName === filterWorker) : reports;
  const yearCount = statsBase.filter(r => r.date?.startsWith(thisYear)).length;
  const monthCount = statsBase.filter(r => r.date?.startsWith(thisMonth)).length;
  const sortedDates = [...new Set(statsBase.map(r => r.date).filter(Boolean))].sort();
  const lastTaskDate = sortedDates[sortedDates.length - 1];
  const daysSinceLast = lastTaskDate
    ? Math.floor((now - new Date(lastTaskDate + 'T00:00:00')) / 86400000)
    : null;
  let avgInterval = null;
  if (sortedDates.length >= 2) {
    let total = 0;
    for (let i = 1; i < sortedDates.length; i++)
      total += (new Date(sortedDates[i]) - new Date(sortedDates[i-1])) / 86400000;
    avgInterval = Math.round(total / (sortedDates.length - 1));
  }

  // Filtering
  const range = getPeriodRange(filterPeriod);
  const filtered = reports.filter(r => {
    if (filterWorker && r.workerName !== filterWorker) return false;
    if (range?.prefix && !r.date?.startsWith(range.prefix)) return false;
    if (range?.start && (r.date < range.start || r.date > range.end)) return false;
    if (filterLine) {
      const text = `${r.taskName || ''} ${r.line || ''}`;
      if (!text.toLowerCase().includes(filterLine.toLowerCase())) return false;
    }
    if (filterEquips.length > 0) {
      const text = (r.taskName || '').toLowerCase();
      if (!filterEquips.some(e => text.includes(e.toLowerCase()))) return false;
    }
    if (filterRequester) {
      const text = `${r.taskName || ''} ${r.requester || ''}`;
      if (!text.includes(filterRequester)) return false;
    }
    if (filterEquipId) {
      const text = `${r.taskName || ''} ${r.equipmentId || ''}`;
      if (!text.toLowerCase().includes(filterEquipId.toLowerCase())) return false;
    }
    return true;
  });

  const hasMoreFilter = !!(filterRequester || filterEquipId);
  const showStats = filterWorker && reports.length > 0;

  return (
    <Layout title="보고서 검색">
      {/* 기간 + 작업자 */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
        {[['week', '이번 주'], ['month', '이번 달'], ['lastMonth', '지난 달'], ['', '전체']].map(([val, label]) => (
          <button
            key={val}
            className={`btn btn-sm ${filterPeriod === val ? 'btn-primary' : 'btn-gray'}`}
            style={{ flex: 1 }}
            onClick={() => setFilterPeriod(val)}
          >
            {label}
          </button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          <Autocomplete
            placeholder="작업자 이름 입력"
            value={filterWorker}
            onChange={setFilterWorker}
            options={WORKERS}
            onClear={() => setFilterWorker('')}
          />
        </div>
        <button
          className={`btn btn-sm ${(showMore || hasMoreFilter) ? 'btn-primary' : 'btn-gray'}`}
          style={{ flexShrink: 0 }}
          onClick={() => setShowMore(v => !v)}
        >
          {hasMoreFilter ? '필터중' : '상세'}
        </button>
      </div>

      {/* 상세 필터 */}
      {(showMore || hasMoreFilter) && (
        <div style={{ background: 'white', borderRadius: 12, padding: '12px 14px', marginBottom: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.07)' }}>
          <div style={{ marginBottom: 8, position: 'relative' }}>
            <Autocomplete
              placeholder="라인 (P2, M10A…)"
              value={filterLine}
              onChange={setFilterLine}
              options={linesList.map(l => l.name)}
              onClear={() => setFilterLine('')}
            />
          </div>
          <div style={{ position: 'relative', marginBottom: 8 }}>
            <EquipMultiSelect
              options={equipNames}
              selected={filterEquips}
              onChange={setFilterEquips}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Autocomplete
              placeholder="담당자명"
              value={filterRequester}
              onChange={setFilterRequester}
              options={WORKERS}
              onClear={() => setFilterRequester('')}
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              {filterEquipId ? (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 5, height: 40,
                  padding: '0 10px', background: 'var(--primary-light)',
                  border: '1.5px solid var(--primary)', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, color: 'var(--primary)',
                }}>
                  <span style={{ flex: 1 }}>{filterEquipId}</span>
                  <button onPointerDown={() => setFilterEquipId('')}
                    style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--primary)', fontSize: 18, lineHeight: 1 }}>×</button>
                </div>
              ) : (
                <input
                  className="form-input"
                  placeholder="호기/베이 (1호기…)"
                  value={filterEquipId}
                  onChange={e => setFilterEquipId(e.target.value)}
                  style={{ fontSize: 13 }}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Worker summary stats */}
      {showStats && (
        <div style={{ background: 'white', borderRadius: 10, marginBottom: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.07)', overflow: 'hidden' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--gray-500)', padding: '10px 14px 6px' }}>
            {filterWorker} 작업 통계
          </div>
          <div style={{ display: 'flex', borderTop: '1px solid var(--gray-100)' }}>
            <StatBox label="올해" value={`${yearCount}건`} />
            <div style={{ width: 1, background: 'var(--gray-100)' }} />
            <StatBox label="이번 달" value={`${monthCount}건`} />
            <div style={{ width: 1, background: 'var(--gray-100)' }} />
            <StatBox
              label="마지막 작업"
              value={daysSinceLast === 0 ? '오늘' : daysSinceLast === 1 ? '어제' : `${daysSinceLast ?? '-'}일 전`}
              sub={lastTaskDate ? lastTaskDate.slice(5).replace('-', '/') : ''}
            />
            {avgInterval !== null && <>
              <div style={{ width: 1, background: 'var(--gray-100)' }} />
              <StatBox label="평균 간격" value={`${avgInterval}일`} />
            </>}
          </div>
        </div>
      )}

      {/* 검색 버튼 */}
      <button className="btn btn-primary btn-full" style={{ marginBottom: 14 }} onClick={loadReports}>
        검색
      </button>

      {/* 결과 */}
      {loading ? (
        <div className="loading">불러오는 중...</div>
      ) : !searched ? null : filtered.length === 0 ? (
        <div className="empty-state">
          <div className="emoji">🔍</div>
          <p>검색 결과가 없습니다</p>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 8 }}>총 {filtered.length}건</div>
          {filtered.map(r => (
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
              {r.chamberStatus?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
                  {r.chamberStatus.slice(0, 5).map(s => (
                    <span key={s} style={{ fontSize: 11, padding: '2px 8px', background: 'var(--primary-light)', color: 'var(--primary)', borderRadius: 10, fontWeight: 600 }}>{s}</span>
                  ))}
                  {r.chamberStatus.length > 5 && (
                    <span style={{ fontSize: 11, color: 'var(--gray-400)' }}>+{r.chamberStatus.length - 5}</span>
                  )}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {r.totalHours > 0 && (
                  <span style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>{formatHours(r.totalHours)}</span>
                )}
                {r.isNight && <span className="badge badge-night">야간</span>}
                {r.isSpecial && <span className="badge badge-special">특근</span>}
                {r.notes && <span style={{ fontSize: 12, color: 'var(--gray-500)' }}>특이사항 있음</span>}
                {!r.totalHours && !r.chamberStatus?.length && !r.notes && (
                  <span style={{ fontSize: 12, color: 'var(--gray-300)' }}>임시저장</span>
                )}
              </div>
            </div>
          ))}
        </>
      )}
    </Layout>
  );
}
