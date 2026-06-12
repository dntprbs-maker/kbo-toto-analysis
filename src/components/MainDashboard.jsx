import React, { useState, useEffect, useRef } from 'react';
import './MainDashboard.css';

// ── DATA ────────────────────────────────────────────────────
const INITIAL_DATA = [
  {
    date: "2026-06-07",
    games: [
      {matchup:"삼성 vs KIA",  ai1:"KIA", ai2:"KIA", ai3:"KIA", pick:"KIA", result:"KIA"},
      {matchup:"한화 vs 롯데", ai1:"한화",ai2:"한화",ai3:"한화",pick:"한화",result:"한화"},
      {matchup:"LG vs NC",     ai1:"NC",  ai2:"LG",  ai3:"LG",  pick:"LG",  result:"NC"},
      {matchup:"KT vs SSG",    ai1:"SSG", ai2:"KT",  ai3:"KT",  pick:"KT",  result:"SSG"},
      {matchup:"키움 vs 두산", ai1:"두산",ai2:"두산",ai3:"두산",pick:"두산",result:"키움"},
    ],
    unanimousBet: {odds:3.9,  amount:100, betResult:"miss"},
    allFiveBet:   {odds:10.0, amount:100, betResult:"miss"},
  },
];

const MainDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [betFilterType, setBetFilterType] = useState('unanimous');
  
  // 기본 날짜 계산 (DATA 마지막 날짜 기준 월초~월말)
  const defaultLatest = INITIAL_DATA.length ? INITIAL_DATA[INITIAL_DATA.length-1].date : new Date().toISOString().split('T')[0];
  const yyyy_mm = defaultLatest.slice(0, 7);
  const parts = yyyy_mm.split('-');
  const lastDay = new Date(parts[0], parts[1], 0).getDate();
  
  const [startDate, setStartDate] = useState(yyyy_mm + '-01');
  const [endDate, setEndDate] = useState(yyyy_mm + '-' + String(lastDay).padStart(2, '0'));
  const [data, setData] = useState(INITIAL_DATA);

  const canvasRef = useRef(null);

  // 유틸리티 함수
  const isUnanimous = (g) => g.ai1 === g.ai2 && g.ai2 === g.ai3;
  const getUnanimousGames = (day) => day.games.filter(g => isUnanimous(g));
  const calcBetStatus = (games, item) => {
    if (item.betResult === 'hit' || item.betResult === 'miss') return item.betResult;
    if (games.some(g => g.result === null)) return 'pending';
    return games.every(g => g.pick === g.result) ? 'hit' : 'miss';
  };
  const getProfit = (bet) => {
    if (bet.betResult === 'pending') return null;
    if (bet.betResult === 'hit') return Math.round(bet.amount * bet.odds - bet.amount);
    return -bet.amount;
  };
  const fmt = (v, unit = '원') => {
    if (v === null) return '-';
    return (v >= 0 ? '+' : '') + v.toLocaleString() + unit;
  };

  // 필터링된 데이터
  const filteredData = data.filter(d => (!startDate || d.date >= startDate) && (!endDate || d.date <= endDate));

  // 차트 그리기 로직
  useEffect(() => {
    if (activeTab !== 'dashboard') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * window.devicePixelRatio;
    canvas.height = 160 * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    const W = canvas.offsetWidth, H = 160;
    ctx.clearRect(0,0,W,H);
    
    const minTime = new Date(startDate || data[0]?.date || Date.now()).getTime();
    const maxTime = new Date(endDate || new Date().toISOString().split('T')[0]).getTime();
    const timeRange = maxTime - minTime || 86400000;

    const daysWithResults = filteredData.filter(d => d.unanimousBet.betResult !== 'pending' || d.allFiveBet.betResult !== 'pending');

    if (!daysWithResults.length) {
      ctx.fillStyle = '#6b7280'; ctx.font = '13px Noto Sans KR'; ctx.textAlign = 'center';
      ctx.fillText('해당 기간에 결과 데이터가 없습니다', W/2, H/2); 
      
      ctx.font = '9px Noto Sans KR';
      const numLabels = 5;
      const pad = {l:52, r:16, t:16, b:28};
      const cW = W - pad.l - pad.r;
      const toX = t => pad.l + ((t - minTime) / timeRange) * cW;
      for (let i=0; i<=numLabels; i++) {
        const t = minTime + (timeRange * (i/numLabels));
        const d = new Date(t);
        ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, toX(t), H-pad.b+14);
      }
      return;
    }
    
    const pts = daysWithResults.map(d => { 
      const dailyProfit = (getProfit(d.unanimousBet)||0) + (getProfit(d.allFiveBet)||0); 
      return { time: new Date(d.date).getTime(), y: dailyProfit, dateStr: d.date }; 
    });

    const pad = {l:52, r:16, t:16, b:38};
    const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
    
    const maxY = Math.max(...pts.map(p=>p.y), 2000);
    const minY = Math.min(...pts.map(p=>p.y), -2000);
    const rY = maxY - minY || 1;
    const toY = v => pad.t + (1 - (v - minY) / rY) * cH;
    const toX = t => pad.l + ((t - minTime) / timeRange) * cW;

    ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.lineWidth = 1; ctx.setLineDash([4,4]);
    ctx.beginPath(); ctx.moveTo(pad.l, toY(0)); ctx.lineTo(W - pad.r, toY(0)); ctx.stroke(); ctx.setLineDash([]);
    
    const daysDiff = Math.max(timeRange / 86400000, 1);
    const barW = Math.max((cW / daysDiff) * 0.4, 4);

    ctx.textAlign = 'center'; ctx.font = '9px Noto Sans KR';

    pts.forEach((p) => { 
      const isPos = p.y > 0;
      const isZero = p.y === 0;
      const barColor = isPos ? '#3b82f6' : (isZero ? '#6b7280' : '#ef476f');
      
      ctx.fillStyle = barColor;
      const x = toX(p.time);
      const yZero = toY(0);
      const yVal = toY(p.y);
      const rectY = p.y >= 0 ? yVal : yZero;
      const rectH = Math.abs(yZero - yVal);
      ctx.fillRect(x - barW/2, rectY, barW, Math.max(rectH, 1));

      ctx.fillStyle = '#9ca3af';
      const d = new Date(p.time);
      ctx.fillText(`${d.getMonth()+1}/${d.getDate()}`, x, H-pad.b+14);

      ctx.fillStyle = barColor;
      const amtStr = p.y > 0 ? `+${p.y.toLocaleString()}` : p.y.toLocaleString();
      ctx.fillText(amtStr, x, H-pad.b+26);
    });
    
    ctx.fillStyle = '#6b7280'; ctx.font = '10px Noto Sans KR'; ctx.textAlign = 'right';
    [maxY,0,minY].forEach(v => ctx.fillText(v.toLocaleString(), pad.l-4, toY(v)+4));

  }, [filteredData, activeTab, startDate, endDate]);

  const handleResetFilters = () => {
    setStartDate('');
    setEndDate('');
  };

  // 대시보드 요약 지표 계산
  const uBets = filteredData.map(d=>d.unanimousBet).filter(b=>b.betResult!=='pending');
  const a5Bets = filteredData.map(d=>d.allFiveBet).filter(b=>b.betResult!=='pending');
  const allBets = [...uBets, ...a5Bets];
  const totalBet = allBets.reduce((s,b)=>s+b.amount,0);
  const totalProfit = allBets.reduce((s,b)=>s+(getProfit(b)||0),0);
  const totalDays = filteredData.filter(d=>d.games.some(g=>g.result!==null)).length;

  const renderBetStats = (bets, label, cls) => {
    const done = bets.filter(b=>b.betResult!=='pending');
    const hits = done.filter(b=>b.betResult==='hit');
    const profit = done.reduce((s,b)=>s+(getProfit(b)||0),0);
    const rate = done.length ? (hits.length/done.length*100).toFixed(0) : 0;
    
    return (
      <div className={`bet-type-card ${cls}`}>
        <div className="bet-type-title">{label}</div>
        <div className="bet-stat"><span className="bet-stat-label">진행 횟수</span><span className="bet-stat-val">{done.length}회</span></div>
        <div className="bet-stat"><span className="bet-stat-label">적중</span><span className={`bet-stat-val ${hits.length>0?'pos':''}`}>{hits.length}회</span></div>
        <div className="bet-stat"><span className="bet-stat-label">적중률</span><span className={`bet-stat-val ${rate>=50?'pos':'neg'}`}>{rate}%</span></div>
        <div className="bet-stat"><span className="bet-stat-label">누적 손익</span><span className={`bet-stat-val ${profit>=0?'pos':'neg'}`}>{fmt(profit)}</span></div>
      </div>
    );
  };

  const renderBetList = (type) => {
    return [...filteredData.keys()].reverse().map(i => {
      const item = type === 'unanimous' ? filteredData[i].unanimousBet : filteredData[i].allFiveBet;
      const d = filteredData[i];
      const games = type === 'unanimous' ? getUnanimousGames(d) : d.games;
      
      if(type === 'unanimous' && games.length === 0) return null;
      
      const status = calcBetStatus(games, item);
      return (
        <div key={i} className="day-card" style={{marginBottom: 14}}>
          <div className="day-header bet-day-header-pc" style={{flexDirection: 'column', alignItems: 'stretch', gap: 4}}>
            <div className="bet-card-header-row1">
              <span className="day-date">📅 {d.date}</span>
              <span className={`day-badge ${status}`}>{status==='hit'?'✅ 적중':status==='miss'?'❌ 미적중':'⏳ 대기중'}</span>
            </div>
            <div className="bet-card-summary-row">
              <span className="bet-header-summary" style={{marginLeft: 0}}>
                {games.length}경기 / 배당 <strong>{item.odds||'-'}배</strong> / 베팅 {item.amount.toLocaleString()}원
                {status==='hit' ? <span> / <strong style={{color:'var(--green)'}}>📈 +{Math.round(item.amount*item.odds).toLocaleString()}원</strong></span> : 
                 item.odds ? <span> / <span style={{color:'#6b9fce'}}>예상 {Math.round(item.amount*item.odds).toLocaleString()}원</span></span> : ''}
              </span>
            </div>
          </div>
          <div className="day-body">
            <div className="game-list-header">
              <span className="col-match">매치업</span>
              <span className="col-pick">최종픽</span>
              <span className="col-result">결과</span>
            </div>
            {games.map((g, j) => {
              const rs = g.result===null ? 'pending' : g.pick===g.result ? 'hit' : 'miss';
              return (
                <div key={j} className="game-row">
                  <span className="game-matchup">{g.matchup}</span>
                  <span className="col-pick-cell"><span className="pick-chip">{g.pick}</span></span>
                  <span className={`col-result-cell game-result ${rs}`}>{g.result||'대기'}</span>
                </div>
              );
            })}
            {status !== 'hit' && (
              <div style={{display:'flex', justifyContent:'flex-end', marginTop: 8, paddingTop: 8, borderTop:'1px solid var(--border)'}}>
                <span className={status==='pending'?'neu':'neg'} style={{fontWeight: 900, fontSize: 13}}>
                  {status==='pending' ? '-' : fmt(-item.amount)}
                </span>
              </div>
            )}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="main-dashboard">
      <header>
        <div className="header-inner">
          <div className="logo">⚾ KBO<em>TOTO</em></div>
          <div className="header-sub">2026 한국 프로야구 투자 기록부</div>
        </div>
      </header>

      <div className="tabs">
        <div className={`tab ${activeTab === 'dashboard' ? 'active' : ''}`} onClick={() => setActiveTab('dashboard')}>📊 대시보드</div>
        <div className={`tab ${activeTab === 'records' ? 'active' : ''}`} onClick={() => setActiveTab('records')}>📋 경기기록</div>
        <div className={`tab ${activeTab === 'betting' ? 'active' : ''}`} onClick={() => setActiveTab('betting')}>🎯 베팅내역</div>
      </div>

      <main>
        {/* 공통 필터 영역 */}
        <div style={{display: 'flex', justifyContent: 'flex-end', gap: 6, fontSize: 11, alignItems: 'center', marginBottom: 16, color: 'var(--light)', padding: '0 12px'}}>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={{cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--light)', borderRadius: 4, padding: '4px 6px', outline: 'none', fontFamily: 'inherit'}} />
            <span style={{color: 'var(--gray)'}}>~</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={{cursor: 'pointer', background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--light)', borderRadius: 4, padding: '4px 6px', outline: 'none', fontFamily: 'inherit'}} />
            <button onClick={handleResetFilters} style={{cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--gray)', borderRadius: 4, padding: '4px 6px', fontSize: 11, marginLeft: 2}}>초기화</button>
        </div>

        {/* 1. 대시보드 탭 */}
        <div className={`panel ${activeTab === 'dashboard' ? 'active' : ''}`} id="tab-dashboard">
          <div className="sec" style={{marginTop: 0}}>🎯 베팅 전략 성과</div>
          <div className="bet-compare">
            {renderBetStats(filteredData.map(d=>d.unanimousBet), '🎯 만장일치', 'unanimous')}
            {renderBetStats(filteredData.map(d=>d.allFiveBet), '⚾ 다섯경기', 'allfive')}
          </div>
          
          <div className="sec">📆 종합 투자 현황</div>
          <div className="kpi-grid">
            <div className="kpi-card"><div className="kpi-label">💰 총 투자 금액</div><div className="kpi-val gold">{totalBet.toLocaleString()}원</div></div>
            <div className="kpi-card"><div className="kpi-label">📅 경기 진행일수</div><div className="kpi-val gold">{totalDays}일</div></div>
            <div className="kpi-card"><div className="kpi-label">📈 누적 손익 금액</div><div className={`kpi-val ${totalProfit>=0?'green':'red'}`}>{fmt(totalProfit)}</div></div>
            <div className="kpi-card"><div className="kpi-label">💹 수익률</div><div className={`kpi-val ${totalProfit>=0?'green':'red'}`}>{totalBet>0?(totalProfit/totalBet*100).toFixed(1):0}%</div></div>
          </div>
          
          <div className="sec">📈 손익 그래프</div>
          <div className="chart-wrap">
            <canvas ref={canvasRef} height="160"></canvas>
          </div>
        </div>

        {/* 2. 경기기록 탭 */}
        <div className={`panel ${activeTab === 'records' ? 'active' : ''}`} id="tab-records">
          {[...filteredData].reverse().map((d, i) => (
            <div key={i} className="day-card">
              <div className="day-header"><span className="day-date">📅 {d.date}</span></div>
              <div className="table-scroll-wrap">
                <table className="games-table">
                  <thead>
                    <tr>
                      <th className="th-group group-match"></th>
                      <th className="th-group group-ai" colSpan="3">🦾 AI 예측</th>
                      <th className="th-group group-pick">🎯</th>
                      <th className="th-group group-result">🏆</th>
                    </tr>
                    <tr>
                      <th className="col-match">매치업</th><th className="col-ai1">반짝이</th><th className="col-ai2">별이</th><th className="col-ai3">초롱이</th><th className="col-pick">최종픽</th><th className="col-result">결과</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.games.map((g, j) => {
                      const unani = isUnanimous(g);
                      const rs = g.result===null ? 'pending' : g.pick===g.result ? 'hit' : 'miss';
                      return (
                        <tr key={j}>
                          <td className="col-match">{g.matchup}{unani && <span className="unani-dot"></span>}</td>
                          <td className="col-ai1">{g.ai1}</td><td className="col-ai2">{g.ai2}</td><td className="col-ai3">{g.ai3}</td>
                          <td className="col-pick">{g.pick}</td>
                          <td className={`col-result td-result-${rs}`}>{g.result||'대기'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
          {filteredData.length === 0 && <div className="empty">📝 기간 내 기록 데이터 없음</div>}
        </div>

        {/* 3. 베팅내역 탭 */}
        <div className={`panel ${activeTab === 'betting' ? 'active' : ''}`} id="tab-betting">
          <div className="bet-filter-wrap">
            <div className={`btn-filter unanimous ${betFilterType === 'unanimous' ? 'active' : ''}`} onClick={() => setBetFilterType('unanimous')}>🎯 만장일치</div>
            <div className={`btn-filter allfive ${betFilterType === 'allfive' ? 'active' : ''}`} onClick={() => setBetFilterType('allfive')}>⚾ 다섯경기</div>
          </div>
          <div className="bet-lists-container">
            <div className={`bet-content-panel ${betFilterType === 'unanimous' ? 'active' : ''}`} id="panel-unanimous">
              <div className="bet-pc-header">🎯 만장일치 내역</div>
              {renderBetList('unanimous')}
              {renderBetList('unanimous').every(el => el === null) && <div className="empty">📝 기간 내 만장일치 베팅 내역이 없습니다.</div>}
            </div>
            <div className={`bet-content-panel ${betFilterType === 'allfive' ? 'active' : ''}`} id="panel-allfive">
              <div className="bet-pc-header">⚾ 다섯경기 내역</div>
              {renderBetList('allfive')}
              {renderBetList('allfive').every(el => el === null) && <div className="empty">📝 기간 내 다섯경기 베팅 내역이 없습니다.</div>}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default MainDashboard;
