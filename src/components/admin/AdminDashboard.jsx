import React, { useState, useEffect } from 'react';

const AdminDashboard = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  
  const [games, setGames] = useState([]);
  const [predictions, setPredictions] = useState([]);
  const [loading, setLoading] = useState(false);
  
  // 폼 상태
  const [gameForm, setGameForm] = useState({ date: '', homeTeam: '', awayTeam: '', homeScore: '', awayScore: '', winner: '' });
  const [predForm, setPredForm] = useState({ date: '', homeTeam: '', awayTeam: '', predictedWinner: '', confidence: '', reason: '' });
  
  // AI 분석 모달 상태
  const [aiReport, setAiReport] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const gRes = await fetch('/api/admin/games');
      const pRes = await fetch('/api/admin/predictions');
      if(gRes.ok) setGames(await gRes.json());
      if(pRes.ok) setPredictions(await pRes.json());
    } catch(e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (isAuthenticated) fetchAllData();
  }, [isAuthenticated]);

  const handleLogin = (e) => {
    e.preventDefault();
    if (pin === '2026') setIsAuthenticated(true);
    else { alert('PIN 번호가 틀렸습니다.'); setPin(''); }
  };

  // ===================== CRUD 함수들 =====================
  const deleteItem = async (type, id) => {
    if(!window.confirm('정말 삭제하시겠습니까?')) return;
    await fetch(`/api/admin/${type}?id=${id}`, { method: 'DELETE' });
    fetchAllData();
  };

  const saveGame = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/games', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(gameForm)
    });
    setGameForm({ date: '', homeTeam: '', awayTeam: '', homeScore: '', awayScore: '', winner: '' });
    fetchAllData();
  };

  const savePrediction = async (e) => {
    e.preventDefault();
    await fetch('/api/admin/predictions', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify(predForm)
    });
    setPredForm({ date: '', homeTeam: '', awayTeam: '', predictedWinner: '', confidence: '', reason: '' });
    fetchAllData();
  };

  // ===================== 심층 AI 실행 =====================
  const runDeepAI = async (pred) => {
    setIsAiLoading(true);
    setAiReport('🤖 딥다이브 분석 중... (약 10초 소요)');
    try {
      const res = await fetch('/api/admin/deep-ai', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ homeTeam: pred.homeTeam, awayTeam: pred.awayTeam, gameDate: pred.date })
      });
      const data = await res.json();
      setAiReport(data.report);
    } catch(e) {
      setAiReport('오류 발생: ' + e.message);
    }
    setIsAiLoading(false);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-gray-800 p-8 rounded-xl max-w-sm w-full">
          <h2 className="text-2xl font-bold text-white mb-6 text-center">관리자 접속</h2>
          <input type="password" value={pin} onChange={(e) => setPin(e.target.value)}
                 className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 text-center tracking-widest mb-4" />
          <button type="submit" className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold">접속</button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8 border-b border-gray-700 pb-4">
          <h1 className="text-3xl font-bold text-blue-400">👑 관리자 통제실</h1>
          <button onClick={() => setIsAuthenticated(false)} className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg">로그아웃</button>
        </div>

        {/* 수동 입력 폼 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* 경기 결과 추가 */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-green-400">📝 경기 결과 수동 추가</h2>
            <form onSubmit={saveGame} className="space-y-3">
              <div className="flex gap-2">
                <input type="date" value={gameForm.date} onChange={e=>setGameForm({...gameForm, date: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="원정팀" value={gameForm.awayTeam} onChange={e=>setGameForm({...gameForm, awayTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
                <input type="number" placeholder="점수" value={gameForm.awayScore} onChange={e=>setGameForm({...gameForm, awayScore: e.target.value})} className="w-20 bg-gray-700 p-2 rounded" required />
                <span className="self-center">VS</span>
                <input type="number" placeholder="점수" value={gameForm.homeScore} onChange={e=>setGameForm({...gameForm, homeScore: e.target.value})} className="w-20 bg-gray-700 p-2 rounded" required />
                <input type="text" placeholder="홈팀" value={gameForm.homeTeam} onChange={e=>setGameForm({...gameForm, homeTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
              </div>
              <input type="text" placeholder="승리팀 (예: KIA)" value={gameForm.winner} onChange={e=>setGameForm({...gameForm, winner: e.target.value})} className="w-full bg-gray-700 p-2 rounded" required />
              <button type="submit" className="w-full bg-green-600 py-2 rounded font-bold">저장하기</button>
            </form>
          </div>

          {/* AI 예측 추가 */}
          <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
            <h2 className="text-xl font-bold mb-4 text-purple-400">🔮 예측 수동 추가</h2>
            <form onSubmit={savePrediction} className="space-y-3">
              <div className="flex gap-2">
                <input type="date" value={predForm.date} onChange={e=>setPredForm({...predForm, date: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="원정팀" value={predForm.awayTeam} onChange={e=>setPredForm({...predForm, awayTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
                <span className="self-center">VS</span>
                <input type="text" placeholder="홈팀" value={predForm.homeTeam} onChange={e=>setPredForm({...predForm, homeTeam: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
              </div>
              <div className="flex gap-2">
                <input type="text" placeholder="승리 예측" value={predForm.predictedWinner} onChange={e=>setPredForm({...predForm, predictedWinner: e.target.value})} className="flex-1 bg-gray-700 p-2 rounded" required />
                <select value={predForm.confidence} onChange={e=>setPredForm({...predForm, confidence: e.target.value})} className="bg-gray-700 p-2 rounded">
                  <option value="">확률</option>
                  <option value="높음">높음</option>
                  <option value="중간">중간</option>
                  <option value="낮음">낮음</option>
                </select>
              </div>
              <input type="text" placeholder="예측 이유" value={predForm.reason} onChange={e=>setPredForm({...predForm, reason: e.target.value})} className="w-full bg-gray-700 p-2 rounded" required />
              <button type="submit" className="w-full bg-purple-600 py-2 rounded font-bold">저장하기</button>
            </form>
          </div>
        </div>

        {/* 데이터 테이블 영역 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          
          {/* 경기 결과 테이블 */}
          <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
            <div className="p-4 bg-gray-700 flex justify-between"><h2 className="font-bold">📋 저장된 경기 결과</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-900 text-gray-400">
                  <tr><th>날짜</th><th>경기</th><th>결과</th><th>관리</th></tr>
                </thead>
                <tbody>
                  {games.map(g => (
                    <tr key={g.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="p-2">{g.date}</td>
                      <td className="p-2">{g.awayTeam} vs {g.homeTeam}</td>
                      <td className="p-2 text-green-400 font-bold">{g.awayScore} : {g.homeScore} ({g.winner})</td>
                      <td className="p-2"><button onClick={()=>deleteItem('games', g.id)} className="text-red-500 hover:text-red-300">삭제</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 예측 데이터 테이블 */}
          <div className="bg-gray-800 rounded-xl overflow-hidden border border-gray-700">
            <div className="p-4 bg-gray-700 flex justify-between"><h2 className="font-bold">🔮 저장된 예측 데이터</h2></div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-900 text-gray-400">
                  <tr><th>날짜</th><th>경기</th><th>예측(확률)</th><th>관리</th></tr>
                </thead>
                <tbody>
                  {predictions.map(p => (
                    <tr key={p.id} className="border-b border-gray-700 hover:bg-gray-750">
                      <td className="p-2">{p.date}</td>
                      <td className="p-2">{p.awayTeam} vs {p.homeTeam}</td>
                      <td className="p-2 text-purple-400 font-bold">{p.predictedWinner}({p.confidence})</td>
                      <td className="p-2 flex gap-2">
                        <button onClick={()=>runDeepAI(p)} className="text-blue-400 hover:text-blue-200" title="심층 AI 분석">🤖</button>
                        <button onClick={()=>deleteItem('predictions', p.id)} className="text-red-500 hover:text-red-300">삭제</button>
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
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-800 rounded-xl max-w-2xl w-full p-6 border border-gray-600 max-h-[80vh] flex flex-col">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-blue-400">🤖 AI 딥다이브 리포트</h2>
                <button onClick={() => setAiReport(null)} className="text-gray-400 hover:text-white text-xl">&times;</button>
              </div>
              <div className="overflow-y-auto flex-1 pr-2 prose prose-invert">
                {isAiLoading ? (
                  <div className="flex justify-center items-center h-40">
                    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
                  </div>
                ) : (
                  <pre className="whitespace-pre-wrap text-sm text-gray-300 font-sans leading-relaxed">
                    {aiReport}
                  </pre>
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
