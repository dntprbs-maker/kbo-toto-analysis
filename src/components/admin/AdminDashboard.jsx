import React, { useState, useEffect, useRef } from 'react';
import './AdminDashboard.css';

const AdminDashboard = () => {
  const [games, setGames] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);

  // 모달 상태 ('aiGame' | 'aiPred' | 'manualGame' | 'manualPred' | 'dataGames' | 'dataPreds' | null)
  const [activeModal, setActiveModal] = useState(null);

  // 데이터 필터용 날짜 상태
  const yyyy_mm = new Date().toISOString().slice(0, 7);
  const parts = yyyy_mm.split('-');
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  const [filterStartDate, setFilterStartDate] = useState(yyyy_mm + '-01');
  const [filterEndDate, setFilterEndDate] = useState(yyyy_mm + '-' + String(lastDay).padStart(2, '0'));

  // 수동 입력 폼 상태
  const [gameForm, setGameForm] = useState({ date: '', homeTeam: '', awayTeam: '', homeScore: '', awayScore: '', winner: '' });
  const [predForm, setPredForm] = useState({ date: '', homeTeam: '', awayTeam: '', predictedWinner: '', confidence: '', reason: '' });

  // AI 분석 (테이블에서 딥다이브) 상태
  const [aiReport, setAiReport] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // ====== AI 이미지(경기 결과) 파싱 관련 ======
  const [imagePreview, setImagePreview] = useState(null);
  const [imageBase64, setImageBase64] = useState(null);
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [imageDate, setImageDate] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [parsedGames, setParsedGames] = useState([]);
  const fileInputRef = useRef(null);

  // ====== AI 예측 파싱 관련 ======
  const [predImagePreview, setPredImagePreview] = useState(null);
  const [predImageBase64, setPredImageBase64] = useState(null);
  const [predImageMime, setPredImageMime] = useState('image/jpeg');
  const [predRawText, setPredRawText] = useState('');
  const [predDate, setPredDate] = useState('');
  const [isPredParsing, setIsPredParsing] = useState(false);
  const [parsedPredictions, setParsedPredictions] = useState([]);
  const predFileInputRef = useRef(null);
  const [predInputTab, setPredInputTab] = useState('image');

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const gRes = await fetch('/api/admin/games');
      const pRes = await fetch('/api/admin/predictions');
      if (gRes.ok) setGames(await gRes.json());
      if (pRes.ok) setPredictions(await pRes.json());
    } catch(e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => {
    fetchAllData();
    const today = new Date().toISOString().split('T')[0];
    setImageDate(today);
    setPredDate(today);
  }, []);

  const filteredGames = games.filter(g => (!filterStartDate || g.date >= filterStartDate) && (!filterEndDate || g.date <= filterEndDate));
  const filteredPreds = predictions.filter(p => (!filterStartDate || p.date >= filterStartDate) && (!filterEndDate || p.date <= filterEndDate));

  // 모달이 열려있을 때 배경 스크롤 방지
  useEffect(() => {
    if (activeModal || aiReport) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => { document.body.style.overflow = 'unset'; };
  }, [activeModal, aiReport]);

  const closeModal = () => setActiveModal(null);

  // ===================== CRUD =====================
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
    closeModal();
  };

  const savePrediction = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(predForm)
    });
    setPredForm({ date: '', homeTeam: '', awayTeam: '', predictedWinner: '', confidence: '', reason: '' });
    fetchAllData();
    closeModal();
  };

  // ===================== 경기 이미지 파싱 =====================
  const handleImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageMime(file.type || 'image/jpeg');
    setImagePreview(URL.createObjectURL(file));
    setParsedGames([]);
    const reader = new FileReader();
    reader.onload = () => setImageBase64(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  const parseImageWithAI = async () => {
    if (!imageBase64) return;
    setIsParsing(true);
    setParsedGames([]);
    try {
      const res = await fetch('/api/admin/parse-image', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, mimeType: imageMime, gameDate: imageDate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `서버 오류 ${res.status}`);
      if (data.success) setParsedGames(data.games);
    } catch(e) { alert('오류: ' + e.message); }
    setIsParsing(false);
  };

  const clearGameImage = () => {
    setImagePreview(null);
    setImageBase64(null);
    setParsedGames([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const saveAllParsedGames = async () => {
    if (parsedGames.length === 0) return;
    for (const game of parsedGames) {
      await fetch('/api/admin/games', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(game)
      });
    }
    alert(`✅ ${parsedGames.length}개 경기 저장 완료!`);
    clearGameImage();
    fetchAllData();
    closeModal();
  };

  const saveSingleParsedGame = async (game) => {
    await fetch('/api/admin/games', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(game)
    });
    setParsedGames(prev => prev.filter(g => g !== game));
    fetchAllData();
  };

  // ===================== 예측 데이터 파싱 =====================
  const handlePredImageSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setPredImageMime(file.type || 'image/jpeg');
    setPredImagePreview(URL.createObjectURL(file));
    setParsedPredictions([]);
    const reader = new FileReader();
    reader.onload = () => setPredImageBase64(reader.result.split(',')[1]);
    reader.readAsDataURL(file);
  };

  const parsePredictionWithAI = async () => {
    const hasImage = !!predImageBase64;
    const hasText = predRawText.trim().length > 0;
    if (!hasImage && !hasText) return alert('데이터를 입력해주세요.');
    setIsPredParsing(true);
    setParsedPredictions([]);
    try {
      const res = await fetch('/api/admin/parse-prediction', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: predImageBase64, mimeType: predImageMime, rawText: predRawText, gameDate: predDate })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `서버 오류`);
      if (data.success) setParsedPredictions(data.predictions);
    } catch(e) { alert('오류: ' + e.message); }
    setIsPredParsing(false);
  };

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
    alert(`✅ ${parsedPredictions.length}개 예측 저장 완료!`);
    clearPredImage();
    setPredRawText('');
    fetchAllData();
    closeModal();
  };

  const saveSingleParsedPrediction = async (pred) => {
    await fetch('/api/admin/predictions', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pred)
    });
    setParsedPredictions(prev => prev.filter(p => p !== pred));
    fetchAllData();
  };

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
    } catch(e) { setAiReport('오류 발생: ' + e.message); }
    setIsAiLoading(false);
  };

  return (
    <div className="admin-dashboard">
      <div className="admin-container">
        <div className="admin-header">
          <h1>👑 관리자 통제실</h1>
          <span>🔒 PIN 로그인 준비 중</span>
        </div>

        {loading && <div className="admin-loading">⏳ 데이터 불러오는 중...</div>}

        {/* --- 데이터 관리 섹션 --- */}
        <h2 style={{color: 'var(--light)', fontSize: '18px', marginBottom: '16px'}}>📊 데이터 관리</h2>
        <div className="admin-menu-grid" style={{marginBottom: '32px'}}>
          <div className="admin-menu-card" onClick={() => setActiveModal('dataGames')} style={{borderColor: 'var(--gray)'}}>
            <div className="admin-menu-icon">📋</div>
            <div className="admin-menu-title" style={{color: 'var(--gray)'}}>경기 기록</div>
            <div className="admin-menu-desc">총 {games.length}건 데이터 관리</div>
          </div>
          <div className="admin-menu-card" onClick={() => setActiveModal('dataPreds')} style={{borderColor: 'var(--gray)'}}>
            <div className="admin-menu-icon">🔮</div>
            <div className="admin-menu-title" style={{color: 'var(--gray)'}}>배팅 내역</div>
            <div className="admin-menu-desc">총 {predictions.length}건 데이터 관리</div>
          </div>
        </div>

        {/* --- 데이터 입력 섹션 --- */}
        <h2 style={{color: 'var(--light)', fontSize: '18px', marginBottom: '16px'}}>➕ 데이터 입력</h2>
        <div className="admin-menu-grid">
          <div className="admin-menu-card yellow" onClick={() => setActiveModal('aiGame')}>
            <div className="admin-menu-icon">📸</div>
            <div className="admin-menu-title">경기 결과 자동 입력</div>
            <div className="admin-menu-desc">네이버 스포츠 이미지 파싱</div>
          </div>
          <div className="admin-menu-card purple" onClick={() => setActiveModal('aiPred')}>
            <div className="admin-menu-icon">🎯</div>
            <div className="admin-menu-title">승패 예측 자동 입력</div>
            <div className="admin-menu-desc">비교표/텍스트 AI 파싱</div>
          </div>
          <div className="admin-menu-card green" onClick={() => setActiveModal('manualGame')}>
            <div className="admin-menu-icon">📝</div>
            <div className="admin-menu-title">경기 결과 수동 추가</div>
            <div className="admin-menu-desc">직접 경기 스코어 입력</div>
          </div>
          <div className="admin-menu-card blue" onClick={() => setActiveModal('manualPred')}>
            <div className="admin-menu-icon">✏️</div>
            <div className="admin-menu-title">승패 예측 수동 추가</div>
            <div className="admin-menu-desc">예측 데이터 직접 입력</div>
          </div>
        </div>
      </div>

      {/* ======================= MODALS ======================= */}

      {/* 0-1. 저장된 경기 결과 모달 */}
      {activeModal === 'dataGames' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px', height: '80vh'}}>
            <div className="modal-header" style={{display:'flex', flexWrap:'wrap', gap:'12px'}}>
              <h2 style={{margin:0}}>📋 경기 기록 ({filteredGames.length}건)</h2>
              <div style={{display:'flex', gap:'8px', alignItems:'center', marginLeft:'auto'}}>
                <input type="date" value={filterStartDate} onChange={e=>setFilterStartDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
                <span style={{color:'var(--gray)'}}>~</span>
                <input type="date" value={filterEndDate} onChange={e=>setFilterEndDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
              </div>
              <button className="modal-close" style={{position:'static', alignSelf:'center'}} onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body" style={{padding: '0'}}>
              <div className="table-wrapper" style={{height: '100%'}}>
                <table className="admin-table">
                  <thead><tr><th style={{position:'sticky', top:0}}>날짜</th><th style={{position:'sticky', top:0}}>경기</th><th style={{position:'sticky', top:0}}>결과</th><th style={{position:'sticky', top:0}}>관리</th></tr></thead>
                  <tbody>
                    {filteredGames.length === 0 && !loading && <tr><td colSpan="4" className="td-empty">데이터가 없습니다</td></tr>}
                    {filteredGames.map(g => (
                      <tr key={g.id}>
                        <td style={{fontSize:'12px'}}>{g.date}</td>
                        <td>{g.awayTeam} vs {g.homeTeam}</td>
                        <td className="text-green">{g.awayScore}:{g.homeScore} <span className="text-gray" style={{fontSize:'12px'}}>({g.winner})</span></td>
                        <td><button onClick={() => deleteItem('games', g.id)} className="btn-icon red">삭제</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 0-2. 저장된 예측 데이터 모달 */}
      {activeModal === 'dataPreds' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '800px', height: '80vh'}}>
            <div className="modal-header" style={{display:'flex', flexWrap:'wrap', gap:'12px'}}>
              <h2 style={{margin:0}}>🔮 배팅 내역 ({filteredPreds.length}건)</h2>
              <div style={{display:'flex', gap:'8px', alignItems:'center', marginLeft:'auto'}}>
                <input type="date" value={filterStartDate} onChange={e=>setFilterStartDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
                <span style={{color:'var(--gray)'}}>~</span>
                <input type="date" value={filterEndDate} onChange={e=>setFilterEndDate(e.target.value)} className="admin-input" style={{padding:'4px 8px'}}/>
              </div>
              <button className="modal-close" style={{position:'static', alignSelf:'center'}} onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body" style={{padding: '0'}}>
              <div className="table-wrapper" style={{height: '100%'}}>
                <table className="admin-table">
                  <thead><tr><th style={{position:'sticky', top:0}}>날짜</th><th style={{position:'sticky', top:0}}>경기</th><th style={{position:'sticky', top:0}}>예측(확률)</th><th style={{position:'sticky', top:0}}>관리</th></tr></thead>
                  <tbody>
                    {filteredPreds.length === 0 && !loading && <tr><td colSpan="4" className="td-empty">데이터가 없습니다</td></tr>}
                    {filteredPreds.map(p => (
                      <tr key={p.id}>
                        <td style={{fontSize:'12px'}}>{p.date}</td>
                        <td>{p.awayTeam} vs {p.homeTeam}</td>
                        <td className="text-purple">{p.predictedWinner} <span className="text-gray" style={{fontSize:'12px'}}>({p.confidence})</span></td>
                        <td style={{display:'flex', gap:'4px'}}>
                          <button onClick={() => runDeepAI(p)} className="btn-icon blue" title="AI 딥다이브 분석">🤖</button>
                          <button onClick={() => deleteItem('predictions', p.id)} className="btn-icon red">삭제</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 1. 경기 결과 AI 파싱 모달 */}
      {activeModal === 'aiGame' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="yellow">📸 이미지로 경기 결과 자동 입력</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="modal-grid">
                <div>
                  <div className="upload-area">
                    <div className="drop-zone" onClick={() => fileInputRef.current.click()}>
                      {imagePreview ? <img src={imagePreview} alt="업로드됨" /> : (
                        <div className="drop-zone-placeholder">
                          <div className="icon">📷</div><p className="title">클릭하여 이미지 업로드</p>
                        </div>
                      )}
                    </div>
                    {imagePreview && <button onClick={(e) => { e.stopPropagation(); clearGameImage(); }} className="btn-remove-image">✕</button>}
                  </div>
                  <input ref={fileInputRef} type="file" accept="image/*" style={{display: 'none'}} onChange={handleImageSelect} />
                  <div className="action-row">
                    <div className="input-group">
                      <label>경기 날짜</label>
                      <input type="date" value={imageDate} onChange={e => setImageDate(e.target.value)} className="admin-input" />
                    </div>
                    <div className="input-group" style={{flex: '0 0 auto', alignSelf: 'flex-end'}}>
                      <button onClick={parseImageWithAI} disabled={!imageBase64 || isParsing} className="admin-btn yellow">
                        {isParsing ? '분석 중...' : '🤖 AI 분석'}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="result-header text-gray">
                    {parsedGames.length > 0 ? `✅ AI가 ${parsedGames.length}경기를 찾았습니다` : '🔍 분석 결과가 여기에 표시됩니다'}
                  </div>
                  {isParsing && <div className="result-loading"><div className="spinner"></div><span>분석 중...</span></div>}
                  {parsedGames.length > 0 && (
                    <>
                      <div className="result-list">
                        {parsedGames.map((game, i) => (
                          <div key={i} className="result-item">
                            <div className="result-item-content">
                              <span className="text-gray">{game.awayTeam} <span className="text-red">{game.awayScore}</span> vs <span className="text-blue">{game.homeScore}</span> {game.homeTeam}</span>
                              <span className="text-yellow" style={{marginLeft:'8px', fontSize:'12px'}}>🏆 {game.winner}</span>
                            </div>
                            <button onClick={() => saveSingleParsedGame(game)} className="admin-btn green small">저장</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={saveAllParsedGames} className="admin-btn green full-width">✅ 전체 {parsedGames.length}경기 한 번에 저장</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 2. 승패 예측 AI 파싱 모달 */}
      {activeModal === 'aiPred' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="purple">🔮 예측 데이터 자동 입력</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <div className="admin-tabs">
                <button onClick={() => setPredInputTab('image')} className={`admin-tab-btn ${predInputTab === 'image' ? 'active' : ''}`}>📷 이미지 캡쳐</button>
                <button onClick={() => setPredInputTab('text')} className={`admin-tab-btn ${predInputTab === 'text' ? 'active' : ''}`}>📋 텍스트 복붙</button>
              </div>
              <div className="modal-grid">
                <div>
                  {predInputTab === 'image' ? (
                    <div className="upload-area">
                      <div className="drop-zone purple" onClick={() => predFileInputRef.current.click()}>
                        {predImagePreview ? <img src={predImagePreview} alt="업로드됨" /> : (
                          <div className="drop-zone-placeholder">
                            <div className="icon">📊</div><p className="title">클릭하여 이미지 업로드</p>
                          </div>
                        )}
                      </div>
                      {predImagePreview && <button onClick={(e) => { e.stopPropagation(); clearPredImage(); }} className="btn-remove-image">✕</button>}
                    </div>
                  ) : (
                    <textarea value={predRawText} onChange={e => setPredRawText(e.target.value)} placeholder="AI 텍스트 붙여넣기..." className="admin-textarea" />
                  )}
                  <input ref={predFileInputRef} type="file" accept="image/*" style={{display: 'none'}} onChange={handlePredImageSelect} />
                  <div className="action-row">
                    <div className="input-group">
                      <label>예측 날짜</label>
                      <input type="date" value={predDate} onChange={e => setPredDate(e.target.value)} className="admin-input purple-focus" />
                    </div>
                    <div className="input-group" style={{flex: '0 0 auto', alignSelf: 'flex-end'}}>
                      <button onClick={parsePredictionWithAI} disabled={isPredParsing || (!predImageBase64 && !predRawText.trim())} className="admin-btn purple">
                        {isPredParsing ? '분석 중...' : '🤖 AI 파싱'}
                      </button>
                    </div>
                  </div>
                </div>
                <div>
                  <div className="result-header text-gray">
                    {parsedPredictions.length > 0 ? `✅ ${parsedPredictions.length}경기 예측을 찾았습니다` : '🔍 분석 결과가 여기에 표시됩니다'}
                  </div>
                  {isPredParsing && <div className="result-loading" style={{color:'var(--purple)'}}><div className="spinner"></div><span>분석 중...</span></div>}
                  {parsedPredictions.length > 0 && (
                    <>
                      <div className="result-list">
                        {parsedPredictions.map((pred, i) => (
                          <div key={i} className="result-item" style={{alignItems: 'flex-start'}}>
                            <div className="result-item-content">
                              <div className="text-gray">{pred.awayTeam} vs {pred.homeTeam}</div>
                              <div className="text-purple" style={{marginTop:'4px'}}>🏆 {pred.predictedWinner} ({pred.confidence})</div>
                            </div>
                            <button onClick={() => saveSingleParsedPrediction(pred)} className="admin-btn purple small">저장</button>
                          </div>
                        ))}
                      </div>
                      <button onClick={saveAllParsedPredictions} className="admin-btn purple full-width">✅ 전체 {parsedPredictions.length}경기 한 번에 저장</button>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. 수동 경기 결과 추가 모달 */}
      {activeModal === 'manualGame' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2 className="green">📝 경기 결과 수동 추가</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={saveGame}>
                <div className="form-row">
                  <input type="date" value={gameForm.date} onChange={e => setGameForm({...gameForm, date: e.target.value})} className="admin-input" required />
                </div>
                <div className="form-row mobile-col">
                  <div style={{display:'flex', gap:'8px', flex:1}}>
                    <input type="text" placeholder="원정팀" value={gameForm.awayTeam} onChange={e => setGameForm({...gameForm, awayTeam: e.target.value})} className="admin-input flex-1" required />
                    <input type="number" placeholder="점수" value={gameForm.awayScore} onChange={e => setGameForm({...gameForm, awayScore: e.target.value})} className="admin-input w-16" required />
                  </div>
                  <div className="vs-text" style={{alignSelf:'center', color:'var(--gray)'}}>vs</div>
                  <div style={{display:'flex', gap:'8px', flex:1}}>
                    <input type="number" placeholder="점수" value={gameForm.homeScore} onChange={e => setGameForm({...gameForm, homeScore: e.target.value})} className="admin-input w-16" required />
                    <input type="text" placeholder="홈팀" value={gameForm.homeTeam} onChange={e => setGameForm({...gameForm, homeTeam: e.target.value})} className="admin-input flex-1" required />
                  </div>
                </div>
                <div className="form-row">
                  <input type="text" placeholder="승리팀 (예: KIA)" value={gameForm.winner} onChange={e => setGameForm({...gameForm, winner: e.target.value})} className="admin-input" required />
                </div>
                <button type="submit" className="admin-btn green full-width" style={{marginTop: '16px'}}>저장하기</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 4. 수동 예측 추가 모달 */}
      {activeModal === 'manualPred' && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{maxWidth: '500px'}}>
            <div className="modal-header">
              <h2 className="blue">🎯 승패 예측 수동 추가</h2>
              <button className="modal-close" onClick={closeModal}>&times;</button>
            </div>
            <div className="modal-body">
              <form onSubmit={savePrediction}>
                <div className="form-row">
                  <input type="date" value={predForm.date} onChange={e => setPredForm({...predForm, date: e.target.value})} className="admin-input" required />
                </div>
                <div className="form-row mobile-col">
                  <input type="text" placeholder="원정팀" value={predForm.awayTeam} onChange={e => setPredForm({...predForm, awayTeam: e.target.value})} className="admin-input flex-1" required />
                  <div className="vs-text" style={{alignSelf:'center', color:'var(--gray)'}}>vs</div>
                  <input type="text" placeholder="홈팀" value={predForm.homeTeam} onChange={e => setPredForm({...predForm, homeTeam: e.target.value})} className="admin-input flex-1" required />
                </div>
                <div className="form-row">
                  <input type="text" placeholder="승리 예측팀" value={predForm.predictedWinner} onChange={e => setPredForm({...predForm, predictedWinner: e.target.value})} className="admin-input flex-1" required />
                  <select value={predForm.confidence} onChange={e => setPredForm({...predForm, confidence: e.target.value})} className="admin-input flex-1">
                    <option value="">확률 (선택)</option>
                    <option value="높음">높음</option>
                    <option value="중간">중간</option>
                    <option value="낮음">낮음</option>
                  </select>
                </div>
                <div className="form-row">
                  <input type="text" placeholder="예측 이유 (간단히)" value={predForm.reason} onChange={e => setPredForm({...predForm, reason: e.target.value})} className="admin-input" />
                </div>
                <button type="submit" className="admin-btn blue full-width" style={{marginTop: '16px'}}>저장하기</button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* 5. 딥다이브 리포트 모달 */}
      {aiReport && (
        <div className="modal-overlay" onClick={() => setAiReport(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="blue">🤖 AI 딥다이브 분석</h2>
              <button className="modal-close" onClick={() => setAiReport(null)}>&times;</button>
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
