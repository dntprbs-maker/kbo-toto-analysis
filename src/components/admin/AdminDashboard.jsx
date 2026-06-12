import React, { useState, useEffect, useRef } from 'react';
import './AdminDashboard.css';

// ============================================================
// TODO (나중에 구현 예정): 관리자 PIN 로그인 보안 기능
// - /admin 접근 시 PIN 번호 입력 화면 먼저 표시
// - 올바른 PIN 입력 시에만 관리자 대시보드 진입 허용
// - 현재는 인증 없이 바로 대시보드가 열림 (임시 설정)
// - 구현 방법: isAuthenticated state + handleLogin 함수 + PIN 입력 UI 추가
// ============================================================

const AdminDashboard = () => {
  const [games, setGames] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);

  // 수동 입력 폼 상태
  const [gameForm, setGameForm] = useState({ date: '', homeTeam: '', awayTeam: '', homeScore: '', awayScore: '', winner: '' });
  const [predForm, setPredForm] = useState({ date: '', homeTeam: '', awayTeam: '', predictedWinner: '', confidence: '', reason: '' });

  // AI 분석 모달 상태
  const [aiReport, setAiReport] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // 이미지 업로드 상태 (경기 결과용)
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [imageDate, setImageDate] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedGames, setParsedGames] = useState([]);
  const fileInputRef = useRef(null);

  // 예측 이미지/텍스트 업로드 상태
  const [predImagePreview, setPredImagePreview] = useState(null);
  const [predImageBase64, setPredImageBase64] = useState(null);
  const [predImageMime, setPredImageMime] = useState('image/jpeg');
  const [predRawText, setPredRawText] = useState('');
  const [predDate, setPredDate] = useState('');
  const [isPredParsing, setIsPredParsing] = useState(false);
  const [parsedPredictions, setParsedPredictions] = useState([]);
  const predFileInputRef = useRef(null);
  // 예측 입력 탭: 'image' | 'text'
  const [predInputTab, setPredInputTab] = useState('image');

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const gRes = await fetch('/api/admin/games');
      const pRes = await fetch('/api/admin/predictions');
      if (gRes.ok) setGames(await gRes.json());
      if (pRes.ok) setPredictions(await pRes.json());
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  // PIN 인증 없이 컴포넌트 마운트 시 바로 데이터 로드
  useEffect(() => {
    fetchAllData();
    // 오늘 날짜를 기본값으로 설정
    const today = new Date().toISOString().split('T')[0];
    setImageDate(today);
    setPredDate(today);
  }, []);

  // ===================== CRUD 함수들 =====================
  const deleteItem = async (type, id) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;
    await fetch(`/api/admin/${type}?id=${id}`, { method: 'DELETE' });
    fetchAllData();
  };

  const saveGame = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/games', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameForm)
    });
    setGameForm({ date: '', homeTeam: '', awayTeam: '', homeScore: '', awayScore: '', winner: '' });
    fetchAllData();
  };

  const savePrediction = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(predForm)
    });
    setPredForm({ date: '', homeTeam: '', awayTeam: '', predictedWinner: '', confidence: '', reason: '' });
    fetchAllData();
  };

  // ===================== 이미지 업로드 & AI 파싱 =====================
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageMime(file.type || 'image/jpeg');

    // 미리보기용 URL 생성
    const previewUrl = URL.createObjectURL(file);
    setImagePreview(previewUrl);
    setParsedGames([]); // 이전 결과 초기화

    // base64 변환
    const reader = new FileReader();
    reader.onload = () => {
      // "data:image/jpeg;base64,xxxxx" 에서 "xxxxx" 부분만 추출
      const base64 = reader.result.split(',')[1];
      setImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleImageDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInputRef.current.files = dataTransfer.files;
    handleImageSelect({ target: fileInputRef.current });
  };

  const parseImageWithAI = async () => {
    if (!imageBase64) return;
    setIsParsing(true);
    setParsedGames([]);
    try {
      const res = await fetch('/api/admin/parse-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: imageMime, gameDate: imageDate })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `서버 오류 ${res.status}`);
      }
      if (data.success) {
        setParsedGames(data.games);
      } else {
        alert('파싱 실패: ' + data.error);
      }
    } catch(e) {
      alert('오류: ' + e.message);
    }
    setIsParsing(false);
  };

  // 경기 결과 이미지 초기화
  const clearGameImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    setParsedGames([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveAllParsedGames = async () => {
    if (parsedGames.length === 0) return;
    let count = 0;
    for (const game of parsedGames) {
      await fetch('/api/admin/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(game)
      });
      count++;
    }
    alert(`✅ ${count}개 경기 결과를 저장했습니다!`);
    setParsedGames([]);
    setImagePreview(null);
    setImageBase64(null);
    fetchAllData();
  };

  const saveSingleParsedGame = async (game) => {
    await fetch('/api/admin/games', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(game)
    });
    setParsedGames(prev => prev.filter(g => g !== game));
    fetchAllData();
  };

  // ===================== 예측 이미지/텍스트 파싱 핸들러 =====================
  const handlePredImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPredImageMime(file.type || 'image/jpeg');
    const previewUrl = URL.createObjectURL(file);
    setPredImagePreview(previewUrl);
    setParsedPredictions([]);
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      setPredImageBase64(base64);
    };
    reader.readAsDataURL(file);
  };

  const handlePredImageDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    predFileInputRef.current.files = dataTransfer.files;
    handlePredImageSelect({ target: predFileInputRef.current });
  };

  const parsePredictionWithAI = async () => {
    const hasImage = !!predImageBase64;
    const hasText = predRawText.trim().length > 0;
    if (!hasImage && !hasText) return alert('이미지 또는 텍스트를 입력해주세요.');
    setIsPredParsing(true);
    setParsedPredictions([]);
    try {
      const res = await fetch('/api/admin/parse-prediction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: predImageBase64 || null,
          mimeType: predImageMime,
          rawText: predRawText || null,
          gameDate: predDate
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `서버 오류 ${res.status}`);
      }
      if (data.success) {
        setParsedPredictions(data.predictions);
      } else {
        alert('파싱 실패: ' + data.error);
      }
    } catch(e) {
      alert('오류: ' + e.message);
    }
    setIsPredParsing(false);
  };

  // 예측 이미지 초기화
  const clearPredImage = () => {
    setPredImagePreview(null);
    setPredImageBase64(null);
    setParsedPredictions([]);
    if (predFileInputRef.current) predFileInputRef.current.value = '';
  };

  const saveAllParsedPredictions = async () => {
    if (parsedPredictions.length === 0) return;
    for (const pred of parsedPredictions) {
      await fetch('/api/admin/predictions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pred)
      });
    }
    alert(`✅ ${parsedPredictions.length}개 예측을 저장했습니다!`);
    setParsedPredictions([]);
    setPredImagePreview(null);
    setPredImageBase64(null);
    setPredRawText('');
    fetchAllData();
  };

  const saveSingleParsedPrediction = async (pred) => {
    await fetch('/api/admin/predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pred)
    });
    setParsedPredictions(prev => prev.filter(p => p !== pred));
    fetchAllData();
  };

  // ===================== 심층 AI 실행 =====================
  const runDeepAI = async (pred) => {
    setIsAiLoading(true);
    setAiReport('🤖 딥다이브 분석 중... (약 10초 소요)');
    try {
      const res = await fetch('/api/admin/deep-ai', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ homeTeam: pred.homeTeam, awayTeam: pred.awayTeam, gameDate: pred.date })
      });
      const data = await res.json();
      setAiReport(data.report);
    } catch(e) {
      setAiReport('오류 발생: ' + e.message);
    }
    setIsAiLoading(false);
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-header">
        <h1>👑 관리자 통제실</h1>
        <span>🔒 PIN 로그인 준비 중</span>
      </div>

      {loading && <div className="admin-loading">⏳ 데이터 불러오는 중...</div>}

      {/* ====== 이미지 업로드 섹션 ====== */}
      <div className="admin-panel">
        <h2 className="admin-panel-title yellow">📸 이미지로 경기 결과 자동 입력</h2>
        <p className="admin-panel-desc">네이버 스포츠 캡쳐 등의 이미지를 올리면 AI가 자동으로 경기 결과를 추출합니다.</p>

        <div className="admin-grid">
          {/* 업로드 영역 */}
          <div>
            <div className="upload-area">
              <div
                className="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleImageDrop}
                onClick={() => fileInputRef.current.click()}
              >
                {imagePreview ? (
                  <img src={imagePreview} alt="업로드된 이미지" />
                ) : (
                  <div className="drop-zone-placeholder">
                    <div className="icon">📷</div>
                    <p className="title">클릭하거나 이미지를 드래그하세요</p>
                    <p className="subtitle">PNG, JPG, WebP 지원</p>
                  </div>
                )}
              </div>
              {imagePreview && (
                <button
                  onClick={(e) => { e.stopPropagation(); clearGameImage(); }}
                  className="btn-remove-image"
                  title="이미지 취소"
                >✕</button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{display: 'none'}}
              onChange={handleImageSelect}
            />

            <div className="action-row">
              <div className="input-group">
                <label>경기 날짜</label>
                <input
                  type="date"
                  value={imageDate}
                  onChange={e => setImageDate(e.target.value)}
                  className="admin-input"
                />
              </div>
              <div className="input-group" style={{flex: '0 0 auto', alignSelf: 'flex-end'}}>
                <button
                  onClick={parseImageWithAI}
                  disabled={!imageBase64 || isParsing}
                  className="admin-btn yellow"
                >
                  {isParsing ? '🔍 분석 중...' : '🤖 AI 분석'}
                </button>
              </div>
            </div>
          </div>

          {/* AI 파싱 결과 */}
          <div>
            <div className="result-header text-gray">
              {parsedGames.length > 0 ? `✅ AI가 ${parsedGames.length}경기를 찾았습니다` : '🔍 AI 분석 결과가 여기에 나타납니다'}
            </div>

            {isParsing && (
              <div className="result-loading">
                <div className="spinner"></div>
                <span>이미지 분석 중...</span>
              </div>
            )}

            {parsedGames.length > 0 && (
              <>
                <div className="result-list">
                  {parsedGames.map((game, i) => (
                    <div key={i} className="result-item">
                      <div className="result-item-content">
                        <span className="text-gray">{game.awayTeam} <span className="text-red">{game.awayScore}</span></span>
                        <span className="text-gray" style={{margin:'0 8px'}}>vs</span>
                        <span className="text-gray"><span className="text-blue">{game.homeScore}</span> {game.homeTeam}</span>
                        <span className="text-yellow" style={{marginLeft:'8px', fontSize:'12px'}}>🏆 {game.winner}</span>
                      </div>
                      <button
                        onClick={() => saveSingleParsedGame(game)}
                        className="admin-btn green small"
                      >저장</button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={saveAllParsedGames}
                  className="admin-btn green full-width"
                >✅ 전체 {parsedGames.length}경기 한 번에 저장</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ====== 예측 이미지/텍스트 업로드 섹션 ====== */}
      <div className="admin-panel">
        <h2 className="admin-panel-title purple">🔮 이미지/텍스트로 예측 자동 입력</h2>
        <p className="admin-panel-desc">3인 예측 비교표 이미지 또는 AI가 준 텍스트를 붙여넣으면 자동으로 파싱해 저장합니다.</p>

        <div className="admin-tabs">
          <button
            onClick={() => setPredInputTab('image')}
            className={`admin-tab-btn ${predInputTab === 'image' ? 'active' : ''}`}
          >📷 이미지 업로드</button>
          <button
            onClick={() => setPredInputTab('text')}
            className={`admin-tab-btn ${predInputTab === 'text' ? 'active' : ''}`}
          >📋 텍스트 붙여넣기</button>
        </div>

        <div className="admin-grid">
          {/* 업로드 / 텍스트 입력 영역 */}
          <div>
            {predInputTab === 'image' ? (
              <div className="upload-area">
                <div
                  className="drop-zone purple"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handlePredImageDrop}
                  onClick={() => predFileInputRef.current.click()}
                >
                  {predImagePreview ? (
                    <img src={predImagePreview} alt="예측 이미지" />
                  ) : (
                    <div className="drop-zone-placeholder">
                      <div className="icon">📊</div>
                      <p className="title">예측 비교표 이미지를 올려주세요</p>
                      <p className="subtitle">PNG, JPG, WebP 지원 • 드래그&드롭 가능</p>
                    </div>
                  )}
                </div>
                {predImagePreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearPredImage(); }}
                    className="btn-remove-image"
                    title="이미지 취소"
                  >✕</button>
                )}
              </div>
            ) : (
              <textarea
                value={predRawText}
                onChange={e => setPredRawText(e.target.value)}
                placeholder={"AI가 준 예측 텍스트를 여기에 붙여넣으세요.\n\n예시:\n롯데 vs LG - LG 승 (65%)\nSSG vs 삼성 - SSG 승 (55%)"}
                className="admin-textarea"
              />
            )}
            <input
              ref={predFileInputRef}
              type="file"
              accept="image/*"
              style={{display: 'none'}}
              onChange={handlePredImageSelect}
            />

            <div className="action-row">
              <div className="input-group">
                <label>예측 대상 날짜</label>
                <input
                  type="date"
                  value={predDate}
                  onChange={e => setPredDate(e.target.value)}
                  className="admin-input"
                />
              </div>
              <div className="input-group" style={{flex: '0 0 auto', alignSelf: 'flex-end'}}>
                <button
                  onClick={parsePredictionWithAI}
                  disabled={isPredParsing || (!predImageBase64 && !predRawText.trim())}
                  className="admin-btn purple"
                >
                  {isPredParsing ? '🔍 분석 중...' : '🤖 AI 파싱'}
                </button>
              </div>
            </div>
          </div>

          {/* AI 파싱 결과 */}
          <div>
            <div className="result-header text-gray">
              {parsedPredictions.length > 0 ? `✅ ${parsedPredictions.length}경기 예측을 찾았습니다` : '🔍 파싱 결과가 여기에 나타납니다'}
            </div>

            {isPredParsing && (
              <div className="result-loading" style={{color: 'var(--purple)'}}>
                <div className="spinner"></div>
                <span>예측 데이터 분석 중...</span>
              </div>
            )}

            {parsedPredictions.length > 0 && (
              <>
                <div className="result-list">
                  {parsedPredictions.map((pred, i) => (
                    <div key={i} className="result-item" style={{alignItems: 'flex-start'}}>
                      <div className="result-item-content">
                        <div className="text-gray">{pred.awayTeam} vs {pred.homeTeam}</div>
                        <div className="text-purple" style={{marginTop:'4px'}}>🏆 {pred.predictedWinner} <span className="text-gray" style={{fontSize:'12px', fontWeight:'normal'}}>({pred.confidence})</span></div>
                        {pred.reason && <div className="text-gray" style={{fontSize:'12px', marginTop:'4px', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{pred.reason}</div>}
                      </div>
                      <button
                        onClick={() => saveSingleParsedPrediction(pred)}
                        className="admin-btn purple small"
                      >저장</button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={saveAllParsedPredictions}
                  className="admin-btn purple full-width"
                >✅ 전체 {parsedPredictions.length}경기 예측 한 번에 저장</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ====== 수동 입력 폼 ====== */}
      <div className="admin-grid">
        {/* 경기 결과 추가 */}
        <div className="admin-panel">
          <h2 className="admin-panel-title green">📝 경기 결과 수동 추가</h2>
          <form onSubmit={saveGame}>
            <div className="form-row">
              <input type="date" value={gameForm.date} onChange={e => setGameForm({...gameForm, date: e.target.value})} className="admin-input" required />
            </div>
            <div className="form-row">
              <input type="text" placeholder="원정팀" value={gameForm.awayTeam} onChange={e => setGameForm({...gameForm, awayTeam: e.target.value})} className="admin-input flex-1" required />
              <input type="number" placeholder="점수" value={gameForm.awayScore} onChange={e => setGameForm({...gameForm, awayScore: e.target.value})} className="admin-input w-16" required />
              <span className="self-center">vs</span>
              <input type="number" placeholder="점수" value={gameForm.homeScore} onChange={e => setGameForm({...gameForm, homeScore: e.target.value})} className="admin-input w-16" required />
              <input type="text" placeholder="홈팀" value={gameForm.homeTeam} onChange={e => setGameForm({...gameForm, homeTeam: e.target.value})} className="admin-input flex-1" required />
            </div>
            <div className="form-row">
              <input type="text" placeholder="승리팀 (예: KIA)" value={gameForm.winner} onChange={e => setGameForm({...gameForm, winner: e.target.value})} className="admin-input" required />
            </div>
            <button type="submit" className="admin-btn green full-width">저장하기</button>
          </form>
        </div>

        {/* 예측 수동 추가 */}
        <div className="admin-panel">
          <h2 className="admin-panel-title purple">🔮 예측 수동 추가</h2>
          <form onSubmit={savePrediction}>
            <div className="form-row">
              <input type="date" value={predForm.date} onChange={e => setPredForm({...predForm, date: e.target.value})} className="admin-input" required />
            </div>
            <div className="form-row">
              <input type="text" placeholder="원정팀" value={predForm.awayTeam} onChange={e => setPredForm({...predForm, awayTeam: e.target.value})} className="admin-input flex-1" required />
              <span className="self-center">vs</span>
              <input type="text" placeholder="홈팀" value={predForm.homeTeam} onChange={e => setPredForm({...predForm, homeTeam: e.target.value})} className="admin-input flex-1" required />
            </div>
            <div className="form-row">
              <input type="text" placeholder="승리 예측" value={predForm.predictedWinner} onChange={e => setPredForm({...predForm, predictedWinner: e.target.value})} className="admin-input flex-1" required />
              <select value={predForm.confidence} onChange={e => setPredForm({...predForm, confidence: e.target.value})} className="admin-input flex-1">
                <option value="">확률</option>
                <option value="높음">높음</option>
                <option value="중간">중간</option>
                <option value="낮음">낮음</option>
              </select>
            </div>
            <div className="form-row">
              <input type="text" placeholder="예측 이유" value={predForm.reason} onChange={e => setPredForm({...predForm, reason: e.target.value})} className="admin-input" required />
            </div>
            <button type="submit" className="admin-btn purple full-width">저장하기</button>
          </form>
        </div>
      </div>

      {/* ====== 데이터 테이블 ====== */}
      <div className="admin-grid">
        {/* 경기 결과 테이블 */}
        <div className="table-container">
          <h2 className="table-header">📋 저장된 경기 결과 ({games.length}건)</h2>
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>날짜</th><th>경기</th><th>결과</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                {games.length === 0 && !loading && (
                  <tr><td colSpan="4" className="td-empty">저장된 데이터가 없습니다</td></tr>
                )}
                {games.map(g => (
                  <tr key={g.id}>
                    <td style={{fontSize:'12px'}}>{g.date}</td>
                    <td>{g.awayTeam} vs {g.homeTeam}</td>
                    <td className="text-green">{g.awayScore}:{g.homeScore} <span className="text-gray" style={{fontSize:'12px'}}>({g.winner})</span></td>
                    <td>
                      <button onClick={() => deleteItem('games', g.id)} className="btn-icon red">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 예측 데이터 테이블 */}
        <div className="table-container">
          <h2 className="table-header">🔮 저장된 예측 데이터 ({predictions.length}건)</h2>
          <div className="table-wrapper">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>날짜</th><th>경기</th><th>예측(확률)</th><th>관리</th>
                </tr>
              </thead>
              <tbody>
                {predictions.length === 0 && !loading && (
                  <tr><td colSpan="4" className="td-empty">저장된 데이터가 없습니다</td></tr>
                )}
                {predictions.map(p => (
                  <tr key={p.id}>
                    <td style={{fontSize:'12px'}}>{p.date}</td>
                    <td>{p.awayTeam} vs {p.homeTeam}</td>
                    <td className="text-purple">{p.predictedWinner} <span className="text-gray" style={{fontSize:'12px'}}>({p.confidence})</span></td>
                    <td style={{display:'flex', gap:'4px'}}>
                      <button onClick={() => runDeepAI(p)} className="btn-icon" title="AI 딥다이브 분석">🤖</button>
                      <button onClick={() => deleteItem('predictions', p.id)} className="btn-icon red">삭제</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* AI 분석 모달 */}
      {aiReport && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>🤖 AI 딥다이브 리포트</h2>
              <button onClick={() => setAiReport(null)} className="modal-close">&times;</button>
            </div>
            <div className="modal-body">
              {isAiLoading ? (
                <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'160px'}}>
                  <div className="spinner" style={{width:'48px', height:'48px', borderWidth:'3px', color:'var(--blue)'}}></div>
                </div>
              ) : (
                <pre style={{whiteSpace:'pre-wrap', fontFamily:'inherit', margin:0}}>{aiReport}</pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;
