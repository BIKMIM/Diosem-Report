import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { WORKERS } from '../utils/workers';

export default function Login() {
  const [mode, setMode] = useState('login');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!name) return setError('이름을 선택해주세요.');
    if (!password) return setError('비밀번호를 입력해주세요.');
    if (mode === 'register' && password !== passwordConfirm)
      return setError('비밀번호가 일치하지 않습니다.');
    if (mode === 'register' && password.length < 6)
      return setError('비밀번호는 6자 이상이어야 합니다.');

    setError('');
    setLoading(true);
    try {
      if (mode === 'login') await login(name, password);
      else await register(name, password);
      navigate('/');
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
        setError('이름 또는 비밀번호가 올바르지 않습니다.');
      else if (err.code === 'auth/email-already-in-use')
        setError('이미 등록된 계정입니다. 로그인을 해주세요.');
      else if (err.code === 'auth/wrong-password')
        setError('비밀번호가 올바르지 않습니다.');
      else setError('오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <h1>DIOSEM</h1>
          <p>디오셈 작업 보고서 시스템</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">이름 선택</label>
            <select
              className="form-select"
              value={name}
              onChange={e => setName(e.target.value)}
            >
              <option value="">-- 이름을 선택하세요 --</option>
              {WORKERS.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">비밀번호</label>
            <input
              type="password"
              className="form-input"
              placeholder="비밀번호 입력"
              value={password}
              onChange={e => setPassword(e.target.value)}
            />
          </div>

          {mode === 'register' && (
            <div className="form-group">
              <label className="form-label">비밀번호 확인</label>
              <input
                type="password"
                className="form-input"
                placeholder="비밀번호 재입력"
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
              />
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary btn-full"
            disabled={loading}
          >
            {loading ? '처리 중...' : mode === 'login' ? '로그인' : '계정 만들기'}
          </button>
        </form>

        <div className="divider">또는</div>

        <button
          className="btn btn-outline btn-full"
          onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}
        >
          {mode === 'login' ? '처음 사용 → 계정 만들기' : '이미 계정이 있어요 → 로그인'}
        </button>
      </div>
    </div>
  );
}
