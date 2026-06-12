import React, { useState, useEffect, useRef } from 'react';

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
    // input에 파일을 직접 설정해서 handleImageSelect 재활용
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
      // res.ok가 아니면 JSON이 아닌 HTML이 올 수 있으므로 먼저 체크
      if (!res.ok) throw new Error(`서버 오류 ${res.status} - Vercel 배포 환경에서 테스트하세요.`);
      const data = await res.json();
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
      // res.ok가 아니면 JSON이 아닌 HTML이 올 수 있으므로 먼저 체크
      if (!res.ok) throw new Error(`서버 오류 ${res.status} - Vercel 배포 환경에서 테스트하세요.`);
      const data = await res.json();
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
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-2xl md:text-3xl font-bold text-blue-400">👑 관리자 통제실</h1>
          <span className="text-xs text-gray-500 italic">🔒 PIN 로그인 준비 중</span>
        </div>

        {loading && (
          <div className="text-center py-4 text-gray-400">⏳ 데이터 불러오는 중...</div>
        )}

        {/* ====== 이미지 업로드 섹션 ====== */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-8">
          <h2 className="text-xl font-bold mb-1 text-yellow-400">📸 이미지로 경기 결과 자동 입력</h2>
          <p className="text-gray-400 text-sm mb-4">네이버 스포츠 캡쳐 등의 이미지를 올리면 AI가 자동으로 경기 결과를 추출합니다.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 업로드 영역 */}
            <div>
              {/* 이미지 업로드 영역 - relative로 X버튼 오버레이 */}
              <div className="relative">
                <div
                  className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-yellow-500 transition-colors"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleImageDrop}
                  onClick={() => fileInputRef.current.click()}
                >
                  {imagePreview ? (
                    <img src={imagePreview} alt="업로드된 이미지" className="max-h-64 mx-auto rounded-lg object-contain" />
                  ) : (
                    <div className="text-gray-400">
                      <div className="text-4xl mb-2">📷</div>
                      <p className="font-semibold">클릭하거나 이미지를 드래그하세요</p>
                      <p className="text-xs mt-1">PNG, JPG, WebP 지원</p>
                    </div>
                  )}
                </div>
                {/* 이미지 올렸을 때만 X 취소 버튼 표시 */}
                {imagePreview && (
                  <button
                    onClick={(e) => { e.stopPropagation(); clearGameImage(); }}
                    className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm shadow-lg z-10"
                    title="이미지 취소"
                  >
                    ✕
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />

              {/* 날짜 + 분석 버튼 */}
              <div className="flex gap-2 mt-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">경기 날짜</label>
                  <input
                    type="date"
                    value={imageDate}
                    onChange={e => setImageDate(e.target.value)}
                    className="w-full bg-gray-700 p-2 rounded border border-gray-600"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={parseImageWithAI}
                    disabled={!imageBase64 || isParsing}
                    className="bg-yellow-500 hover:bg-yellow-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-black font-bold px-4 py-2 rounded transition h-10"
                  >
                    {isParsing ? '🔍 분석 중...' : '🤖 AI 분석'}
                  </button>
                </div>
              </div>
            </div>

            {/* AI 파싱 결과 */}
            <div>
              <h3 className="text-sm font-bold text-gray-300 mb-3">
                {parsedGames.length > 0 ? `✅ AI가 ${parsedGames.length}경기를 찾았습니다` : '🔍 AI 분석 결과가 여기에 나타납니다'}
              </h3>

              {isParsing && (
                <div className="flex items-center gap-3 text-yellow-400 py-8 justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-yellow-400"></div>
                  <span>이미지 분석 중...</span>
                </div>
              )}

              {parsedGames.length > 0 && (
                <>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-3">
                    {parsedGames.map((game, i) => (
                      <div key={i} className="bg-gray-700 rounded-lg p-3 flex items-center justify-between">
                        <div className="text-sm">
                          <span className="text-gray-300">{game.awayTeam} <span className="text-red-400 font-bold">{game.awayScore}</span></span>
                          <span className="text-gray-500 mx-2">vs</span>
                          <span className="text-gray-300"><span className="text-blue-400 font-bold">{game.homeScore}</span> {game.homeTeam}</span>
                          <span className="ml-2 text-yellow-400 text-xs">🏆 {game.winner}</span>
                        </div>
                        <button
                          onClick={() => saveSingleParsedGame(game)}
                          className="text-xs bg-green-600 hover:bg-green-500 px-2 py-1 rounded ml-2 shrink-0"
                        >
                          저장
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={saveAllParsedGames}
                    className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded transition"
                  >
                    ✅ 전체 {parsedGames.length}경기 한 번에 저장
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ====== 예측 이미지/텍스트 업로드 섹션 ====== */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 mb-8">
          <h2 className="text-xl font-bold mb-1 text-purple-400">🔮 이미지/텍스트로 예측 자동 입력</h2>
          <p className="text-gray-400 text-sm mb-4">3인 예측 비교표 이미지 또는 AI가 준 텍스트를 붙여넣으면 자동으로 파싱해 저장합니다.</p>

          {/* 탭 전환: 이미지 / 텍스트 */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setPredInputTab('image')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition ${predInputTab === 'image' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
            >📷 이미지 업로드</button>
            <button
              onClick={() => setPredInputTab('text')}
              className={`px-4 py-2 rounded-lg font-bold text-sm transition ${predInputTab === 'text' ? 'bg-purple-600 text-white' : 'bg-gray-700 text-gray-400 hover:text-white'}`}
            >📋 텍스트 붙여넣기</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 왼쪽: 이미지 업로드 OR 텍스트 입력 */}
            <div>
              {predInputTab === 'image' ? (
                <div className="relative">
                  <div
                    className="border-2 border-dashed border-gray-600 rounded-xl p-6 text-center cursor-pointer hover:border-purple-500 transition-colors"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handlePredImageDrop}
                    onClick={() => predFileInputRef.current.click()}
                  >
                    {predImagePreview ? (
                      <img src={predImagePreview} alt="예측 이미지" className="max-h-64 mx-auto rounded-lg object-contain" />
                    ) : (
                      <div className="text-gray-400">
                        <div className="text-4xl mb-2">📊</div>
                        <p className="font-semibold">예측 비교표 이미지를 올려주세요</p>
                        <p className="text-xs mt-1">PNG, JPG, WebP 지원 • 드래그&드롭 가능</p>
                      </div>
                    )}
                  </div>
                  {/* 이미지 올렸을 때만 X 취소 버튼 표시 */}
                  {predImagePreview && (
                    <button
                      onClick={(e) => { e.stopPropagation(); clearPredImage(); }}
                      className="absolute top-2 right-2 bg-red-600 hover:bg-red-500 text-white rounded-full w-7 h-7 flex items-center justify-center font-bold text-sm shadow-lg z-10"
                      title="이미지 취소"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ) : (
                <textarea
                  value={predRawText}
                  onChange={e => setPredRawText(e.target.value)}
                  placeholder={"AI가 준 예측 텍스트를 여기에 붙여넣으세요.\n\n예시:\n롯데 vs LG - LG 승 (65%)\nSSG vs 삼성 - SSG 승 (55%)"}
                  className="w-full h-52 bg-gray-700 p-3 rounded-xl text-sm text-gray-200 border border-gray-600 resize-none focus:outline-none focus:border-purple-500"
                />
              )}
              <input
                ref={predFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePredImageSelect}
              />

              {/* 날짜 + 분석 버튼 */}
              <div className="flex gap-2 mt-3">
                <div className="flex-1">
                  <label className="text-xs text-gray-400 mb-1 block">예측 대상 날짜</label>
                  <input
                    type="date"
                    value={predDate}
                    onChange={e => setPredDate(e.target.value)}
                    className="w-full bg-gray-700 p-2 rounded border border-gray-600"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={parsePredictionWithAI}
                    disabled={isPredParsing || (!predImageBase64 && !predRawText.trim())}
                    className="bg-purple-500 hover:bg-purple-400 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-bold px-4 py-2 rounded transition h-10"
                  >
                    {isPredParsing ? '🔍 분석 중...' : '🤖 AI 파싱'}
                  </button>
                </div>
              </div>
            </div>

            {/* 오른쪽: 파싱 결과 */}
            <div>
              <h3 className="text-sm font-bold text-gray-300 mb-3">
                {parsedPredictions.length > 0 ? `✅ ${parsedPredictions.length}경기 예측을 찾았습니다` : '🔍 파싱 결과가 여기에 나타납니다'}
              </h3>

              {isPredParsing && (
                <div className="flex items-center gap-3 text-purple-400 py-8 justify-center">
                  <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-purple-400"></div>
                  <span>예측 데이터 분석 중...</span>
                </div>
              )}

              {parsedPredictions.length > 0 && (
                <>
                  <div className="space-y-2 max-h-56 overflow-y-auto pr-1 mb-3">
                    {parsedPredictions.map((pred, i) => (
                      <div key={i} className="bg-gray-700 rounded-lg p-3 flex items-start justify-between gap-2">
                        <div className="text-sm flex-1">
                          <div className="text-gray-300">{pred.awayTeam} <span className="text-gray-500">vs</span> {pred.homeTeam}</div>
                          <div className="text-purple-400 font-bold mt-0.5">🏆 {pred.predictedWinner} <span className="text-gray-400 font-normal text-xs">({pred.confidence})</span></div>
                          {pred.reason && <div className="text-gray-500 text-xs mt-0.5 truncate">{pred.reason}</div>}
                        </div>
                        <button
                          onClick={() => saveSingleParsedPrediction(pred)}
                          className="text-xs bg-purple-600 hover:bg-purple-500 px-2 py-1 rounded shrink-0"
                        >저장</button>
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={saveAllParsedPredictions}
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white font-bold py-2 rounded transition"
                  >
                    ✅ 전체 {parsedPredictions.length}경기 예측 한 번에 저장
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ====== 수동 입력 폼 ====== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 경기 결과 추가 */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-green-400">📝 경기 결과 수동 추가</h2>
            <form onSubmit={saveGame} className="space-y-3">
              <input type="date" value={gameForm.date} onChange={e => setGameForm({...gameForm, date: e.target.value})} className="w-full bg-gray-700 p-2 rounded" required />
              <div className="flex gap-2">
                <input type="text" placeholder="원정팀" value={gameForm.awayTeam} onChange={e => setGameForm({...gameForm, awayTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
                <input type="number" placeholder="점수" value={gameForm.awayScore} onChange={e => setGameForm({...gameForm, awayScore: e.target.value})} className="w-16 bg-gray-700 p-2 rounded" required />
                <span className="self-center text-gray-500">vs</span>
                <input type="number" placeholder="점수" value={gameForm.homeScore} onChange={e => setGameForm({...gameForm, homeScore: e.target.value})} className="w-16 bg-gray-700 p-2 rounded" required />
                <input type="text" placeholder="홈팀" value={gameForm.homeTeam} onChange={e => setGameForm({...gameForm, homeTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
              </div>
              <input type="text" placeholder="승리팀 (예: KIA)" value={gameForm.winner} onChange={e => setGameForm({...gameForm, winner: e.target.value})} className="w-full bg-gray-700 p-2 rounded" required />
              <button type="submit" className="w-full bg-green-600 hover:bg-green-700 py-2 rounded font-bold transition">저장하기</button>
            </form>
          </div>

          {/* AI 예측 추가 */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-purple-400">🔮 예측 수동 추가</h2>
            <form onSubmit={savePrediction} className="space-y-3">
              <input type="date" value={predForm.date} onChange={e => setPredForm({...predForm, date: e.target.value})} className="w-full bg-gray-700 p-2 rounded" required />
              <div className="flex gap-2">
                <input type="text" placeholder="원정팀" value={predForm.awayTeam} onChange={e => setPredForm({...predForm, awayTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
                <span className="self-center text-gray-500">vs</span>
                <input type="text" placeholder="홈팀" value={predForm.homeTeam} onChange={e => setPredForm({...predForm, homeTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="승리 예측" value={predForm.predictedWinner} onChange={e => setPredForm({...predForm, predictedWinner: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
                <select value={predForm.confidence} onChange={e => setPredForm({...predForm, confidence: e.target.value})} className="bg-gray-700 p-2 rounded">
                  <option value="">확률</option>
                  <option value="높음">높음</option>
                  <option value="중간">중간</option>
                  <option value="낮음">낮음</option>
                </select>
              </div>
              <input type="text" placeholder="예측 이유" value={predForm.reason} onChange={e => setPredForm({...predForm, reason: e.target.value})} className="w-full bg-gray-700 p-2 rounded" required />
              <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 py-2 rounded font-bold transition">저장하기</button>
            </form>
          </div>
        </div>

        {/* ====== 데이터 테이블 ====== */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 경기 결과 테이블 */}
          <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
            <div className="p-4 bg-gray-700">
              <h2 className="font-bold">📋 저장된 경기 결과 ({games.length}건)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-900 text-gray-400">
                  <tr>
                    <th className="p-2">날짜</th><th className="p-2">경기</th>
                    <th className="p-2">결과</th><th className="p-2">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {games.length === 0 && !loading && (
                    <tr><td colSpan="4" className="p-4 text-center text-gray-500">저장된 데이터가 없습니다</td></tr>
                  )}
                  {games.map(g => (
                    <tr key={g.id} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="p-2 text-xs">{g.date}</td>
                      <td className="p-2">{g.awayTeam} vs {g.homeTeam}</td>
                      <td className="p-2 text-green-400 font-bold">{g.awayScore}:{g.homeScore} <span className="text-xs text-gray-400">({g.winner})</span></td>
                      <td className="p-2">
                        <button onClick={() => deleteItem('games', g.id)} className="text-red-500 hover:text-red-300 text-xs border border-red-800 px-2 py-0.5 rounded">삭제</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 예측 데이터 테이블 */}
          <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
            <div className="p-4 bg-gray-700">
              <h2 className="font-bold">🔮 저장된 예측 데이터 ({predictions.length}건)</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-900 text-gray-400">
                  <tr>
                    <th className="p-2">날짜</th><th className="p-2">경기</th>
                    <th className="p-2">예측(확률)</th><th className="p-2">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {predictions.length === 0 && !loading && (
                    <tr><td colSpan="4" className="p-4 text-center text-gray-500">저장된 데이터가 없습니다</td></tr>
                  )}
                  {predictions.map(p => (
                    <tr key={p.id} className="border-b border-gray-700 hover:bg-gray-700">
                      <td className="p-2 text-xs">{p.date}</td>
                      <td className="p-2">{p.awayTeam} vs {p.homeTeam}</td>
                      <td className="p-2 text-purple-400 font-bold">{p.predictedWinner} <span className="text-xs text-gray-400">({p.confidence})</span></td>
                      <td className="p-2 flex gap-1">
                        <button onClick={() => runDeepAI(p)} className="text-blue-400 hover:text-blue-200 text-xs border border-blue-800 px-2 py-0.5 rounded">🤖</button>
                        <button onClick={() => deleteItem('predictions', p.id)} className="text-red-500 hover:text-red-300 text-xs border border-red-800 px-2 py-0.5 rounded">삭제</button>
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
          <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl max-w-2xl w-full p-6 border border-gray-600 max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-blue-400">🤖 AI 딥다이브 리포트</h2>
                <button onClick={() => setAiReport(null)} className="text-gray-400 hover:text-white text-2xl leading-none">&times;</button>
              </div>
              <div className="overflow-y-auto flex-1 pr-2">
                {isAiLoading ? (
                  <div className="flex justify-center items-center h-40">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">{aiReport}</pre>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminDashboard;
