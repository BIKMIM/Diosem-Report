import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, getDocs, updateDoc, doc, query, orderBy, deleteDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../contexts/AuthContext';
import Layout from '../components/Layout';
import { DEFAULT_EQUIPMENT_NAMES, loadEquipmentNames, saveEquipmentNames } from '../utils/equipmentNames';
import { DEFAULT_LINES, loadLines, saveLines } from '../utils/lineNames';
import { parseJobDetails } from '../utils/parser';

export default function AdminPanel() {
  const { workerProfile } = useAuth();
  const navigate = useNavigate();

  const [tab, setTab] = useState('workers');
  const [loading, setLoading] = useState(true);
  const [migrating, setMigrating] = useState(false);
  const [migrateResult, setMigrateResult] = useState('');

  // Workers / Jobs
  const [workers, setWorkers] = useState([]);
  const [jobs, setJobs] = useState([]);

  // Equipment names
  const [equipNames, setEquipNames] = useState([]);
  const [newEquip, setNewEquip] = useState('');
  const [equipSaving, setEquipSaving] = useState(false);

  // Lines
  const [linesList, setLinesList] = useState([]);
  const [newLine, setNewLine] = useState({ name: '', aliases: '', sublines: '' });
  const [lineSaving, setLineSaving] = useState(false);

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [wSnap, jSnap, names, lines] = await Promise.all([
        getDocs(query(collection(db, 'workers'), orderBy('createdAt'))),
        getDocs(query(collection(db, 'jobs'), orderBy('date', 'desc'))),
        loadEquipmentNames(),
        loadLines(),
      ]);
      setWorkers(wSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setJobs(jSnap.docs.map(d => ({ id: d.id, ...d.data() })));
      setEquipNames(names);
      setLinesList(lines);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  // ── Workers ──
  const toggleActive = async (worker) => {
    await updateDoc(doc(db, 'workers', worker.id), { isActive: !worker.isActive });
    setWorkers(ws => ws.map(w => w.id === worker.id ? { ...w, isActive: !w.isActive } : w));
  };
  const toggleAdmin = async (worker) => {
    await updateDoc(doc(db, 'workers', worker.id), { isAdmin: !worker.isAdmin });
    setWorkers(ws => ws.map(w => w.id === worker.id ? { ...w, isAdmin: !w.isAdmin } : w));
  };

  // ── Jobs ──
  const deleteJob = async (jobId) => {
    if (!window.confirm('이 작업을 삭제하시겠습니까?')) return;
    await deleteDoc(doc(db, 'jobs', jobId));
    setJobs(js => js.filter(j => j.id !== jobId));
  };

  const migrateJobs = async () => {
    if (!window.confirm(`저장된 작업 ${jobs.length}건을 최신 파서로 재처리합니다. 계속하시겠습니까?`)) return;
    setMigrating(true);
    setMigrateResult('');
    try {
      let updated = 0;
      // Firestore writeBatch: max 500 per batch
      for (let i = 0; i < jobs.length; i += 400) {
        const chunk = jobs.slice(i, i + 400);
        const batch = writeBatch(db);
        for (const job of chunk) {
          if (!job.taskName) continue;
          const details = parseJobDetails(job.taskName);
          batch.update(doc(db, 'jobs', job.id), {
            process: details.process,
            equipmentId: details.equipmentId,
            chamber: details.chamber,
            floor: details.floor || job.floor || '',
            bay: details.bay || job.bay || '',
          });
          updated++;
        }
        await batch.commit();
      }
      setMigrateResult(`✅ ${updated}건 업데이트 완료`);
      await loadData();
    } catch (e) {
      setMigrateResult('❌ 오류: ' + e.message);
    } finally {
      setMigrating(false);
    }
  };

  // ── Equipment names ──
  const addEquipName = async () => {
    const name = newEquip.trim();
    if (!name || equipNames.includes(name)) return;
    const updated = [...equipNames, name].sort((a, b) => a.localeCompare(b));
    setEquipSaving(true);
    try { await saveEquipmentNames(updated); setEquipNames(updated); setNewEquip(''); }
    catch (e) { console.error(e); }
    finally { setEquipSaving(false); }
  };
  const removeEquipName = async (name) => {
    const updated = equipNames.filter(n => n !== name);
    setEquipSaving(true);
    try { await saveEquipmentNames(updated); setEquipNames(updated); }
    catch (e) { console.error(e); }
    finally { setEquipSaving(false); }
  };
  const resetEquip = async () => {
    if (!window.confirm('장비명을 기본값으로 초기화하시겠습니까?')) return;
    setEquipSaving(true);
    try { await saveEquipmentNames(DEFAULT_EQUIPMENT_NAMES); setEquipNames(DEFAULT_EQUIPMENT_NAMES); }
    catch (e) { console.error(e); }
    finally { setEquipSaving(false); }
  };

  // ── Lines ──
  const addLine = async () => {
    const name = newLine.name.trim();
    if (!name) return;
    const aliases = newLine.aliases.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const sublines = newLine.sublines.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
    const entry = { name, aliases, ...(sublines.length ? { sublines } : {}) };
    const updated = [...linesList, entry];
    setLineSaving(true);
    try {
      await saveLines(updated);
      setLinesList(updated);
      setNewLine({ name: '', aliases: '', sublines: '' });
    } catch (e) { console.error(e); }
    finally { setLineSaving(false); }
  };
  const removeLine = async (name) => {
    const updated = linesList.filter(l => l.name !== name);
    setLineSaving(true);
    try { await saveLines(updated); setLinesList(updated); }
    catch (e) { console.error(e); }
    finally { setLineSaving(false); }
  };
  const resetLines = async () => {
    if (!window.confirm('라인 목록을 기본값으로 초기화하시겠습니까?')) return;
    setLineSaving(true);
    try { await saveLines(DEFAULT_LINES); setLinesList(DEFAULT_LINES); }
    catch (e) { console.error(e); }
    finally { setLineSaving(false); }
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
      {/* Quick links */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => navigate('/payroll')}>급여현황</button>
        <button className="btn btn-outline btn-sm" style={{ flex: 1 }} onClick={() => navigate('/schedule-input')}>일정 입력</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 5, marginBottom: 16 }}>
        {[['workers', '직원'], ['jobs', '작업'], ['equip', '장비명'], ['lines', '라인']].map(([key, label]) => (
          <button
            key={key}
            className={`btn btn-sm ${tab === key ? 'btn-primary' : 'btn-gray'}`}
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
          <div style={{ fontSize: 13, color: 'var(--gray-500)', marginBottom: 8 }}>등록된 계정: {workers.length}명</div>
          {workers.map(w => (
            <div key={w.id} className={`worker-row ${!w.isActive ? 'inactive' : ''}`}>
              <div>
                <div style={{ fontWeight: 700 }}>{w.name}</div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>{w.isAdmin ? '관리자' : '일반'} • {w.isActive ? '활성' : '비활성'}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button className="btn btn-sm btn-gray" onClick={() => toggleAdmin(w)} style={{ fontSize: 11 }}>
                  {w.isAdmin ? '권한해제' : '관리자'}
                </button>
                <label className="toggle">
                  <input type="checkbox" checked={!!w.isActive} onChange={() => toggleActive(w)} />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>
          ))}
          {workers.length === 0 && <div className="empty-state"><div className="emoji">👤</div><p>등록된 계정이 없습니다.</p></div>}
        </>
      ) : tab === 'jobs' ? (
        <>
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: 'var(--gray-500)', flex: 1 }}>총 {jobs.length}건</div>
            <button
              className="btn btn-sm btn-outline"
              onClick={migrateJobs}
              disabled={migrating}
              style={{ flexShrink: 0 }}
            >
              {migrating ? '처리 중...' : '장비명 재파싱'}
            </button>
          </div>
          {migrateResult && (
            <div className={`alert ${migrateResult.startsWith('✅') ? 'alert-success' : 'alert-error'}`}
              style={{ marginBottom: 10 }}>
              {migrateResult}
            </div>
          )}
          {jobs.slice(0, 50).map(j => (
            <div key={j.id} className="card" style={{ padding: '12px 16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{j.date} ({j.dayOfWeek})</div>
                  <div style={{ fontSize: 12, color: 'var(--gray-700)', marginTop: 2 }}>{j.taskName}</div>
                  <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 2 }}>{j.assignedWorkers?.join(', ')}</div>
                </div>
                <button className="btn btn-sm btn-danger" onClick={() => deleteJob(j.id)}>삭제</button>
              </div>
            </div>
          ))}
          {jobs.length === 0 && <div className="empty-state"><div className="emoji">📅</div><p>저장된 작업이 없습니다.</p></div>}
        </>
      ) : tab === 'equip' ? (
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>장비명 추가</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="form-input" style={{ flex: 1 }} placeholder="장비명 (예: Centra)" value={newEquip}
                onChange={e => setNewEquip(e.target.value)} onKeyDown={e => e.key === 'Enter' && addEquipName()} />
              <button className="btn btn-primary btn-sm" onClick={addEquipName} disabled={equipSaving || !newEquip.trim()} style={{ whiteSpace: 'nowrap' }}>추가</button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>등록 {equipNames.length}개</div>
            <button className="btn btn-sm btn-gray" onClick={resetEquip} disabled={equipSaving}>기본값 초기화</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {equipNames.map(name => (
              <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 10px 6px 12px', background: 'white', borderRadius: 20, border: '1.5px solid var(--gray-200)', fontSize: 13, fontWeight: 600 }}>
                {name}
                <button onClick={() => removeEquipName(name)} disabled={equipSaving}
                  style={{ width: 18, height: 18, borderRadius: '50%', background: 'var(--gray-200)', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--gray-600)' }}>×</button>
              </div>
            ))}
          </div>
        </>
      ) : (
        /* ── 라인 관리 ── */
        <>
          <div className="card" style={{ marginBottom: 12 }}>
            <div className="card-title" style={{ marginBottom: 10 }}>라인 추가</div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">라인명 *</label>
              <input className="form-input" placeholder="예: P2" value={newLine.name}
                onChange={e => setNewLine(l => ({ ...l, name: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label className="form-label">별칭 (쉼표 구분)</label>
              <input className="form-input" placeholder="예: P2L, P2-Line" value={newLine.aliases}
                onChange={e => setNewLine(l => ({ ...l, aliases: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 10 }}>
              <label className="form-label">세부라인 (쉼표 구분)</label>
              <input className="form-input" placeholder="예: S5, V2" value={newLine.sublines}
                onChange={e => setNewLine(l => ({ ...l, sublines: e.target.value }))} />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                세부라인 입력 시 작업명에 등장하면 P2(S5)처럼 표시됩니다
              </div>
            </div>
            <button className="btn btn-primary btn-full btn-sm" onClick={addLine} disabled={lineSaving || !newLine.name.trim()}>
              추가하기
            </button>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>등록 {linesList.length}개</div>
            <button className="btn btn-sm btn-gray" onClick={resetLines} disabled={lineSaving}>기본값 초기화</button>
          </div>

          {linesList.map(line => (
            <div key={line.name} style={{
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
              background: 'white', borderRadius: 10, padding: '10px 14px', marginBottom: 6,
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{line.name}</div>
                {line.aliases?.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 2 }}>
                    별칭: {line.aliases.join(', ')}
                  </div>
                )}
                {line.sublines?.length > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--primary)', marginTop: 2 }}>
                    세부: {line.sublines.map(s => `${line.name}(${s})`).join(', ')}
                  </div>
                )}
              </div>
              <button className="btn btn-sm btn-danger" style={{ flexShrink: 0, marginLeft: 8 }}
                onClick={() => removeLine(line.name)} disabled={lineSaving}>
                삭제
              </button>
            </div>
          ))}
        </>
      )}
    </Layout>
  );
}
