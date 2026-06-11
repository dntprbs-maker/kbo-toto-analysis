import crypto from 'crypto';

// =====================================================
// 🔥 파이어베이스 유틸리티 함수들
// =====================================================

async function getFirebaseAccessToken(serviceAccount) {
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  const toBase64Url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${toBase64Url(header)}.${toBase64Url(claim)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  return data.access_token;
}

async function saveDocument(accessToken, projectId, collection, docData) {
  const firestoreFields = {};
  for (const [key, value] of Object.entries(docData)) {
    if (typeof value === 'string') firestoreFields[key] = { stringValue: value };
    else if (typeof value === 'number') firestoreFields[key] = { integerValue: String(value) };
    else if (typeof value === 'boolean') firestoreFields[key] = { booleanValue: value };
  }
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: firestoreFields })
    }
  );
  if (!res.ok) throw new Error(`Firestore 저장 실패: ${await res.text()}`);
  return await res.json();
}

// =====================================================
// ⚾ KBO 공식 API에서 경기 일정/결과 가져오기
// =====================================================

async function fetchKboSchedule(month, year) {
  const pad = n => n < 10 ? '0' + n : String(n);
  const body = `leId=1&srIdList=0%2C9&seasonId=${year}&gameMonth=${pad(month)}&teamId=`;

  const res = await fetch('https://www.koreabaseball.com/ws/Schedule.asmx/GetScheduleList', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.koreabaseball.com/Schedule/Schedule.aspx',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
    },
    body
  });

  if (!res.ok) throw new Error(`KBO API 실패: ${res.status}`);
  return await res.json();
}

// KBO API 응답에서 경기 결과 파싱
// 실제 구조: Class='play', Text='한화3vs5두산' 형식
function parseKboGames(apiData, targetDate) {
  const games = [];
  if (!apiData?.rows) return games;

  let currentDate = '';

  for (const rowObj of apiData.rows) {
    const row = rowObj.row;
    if (!row) continue;

    // 날짜 셀 확인 (Class='day')
    const dateCell = row.find(cell => cell.Class === 'day');
    if (dateCell) currentDate = dateCell.Text.replace(/<[^>]+>/g, '').trim();

    // 해당 날짜 경기만 처리
    if (currentDate !== targetDate) continue;

    // 경기 결과 파싱: Class='play', Text='한화3vs5두산' 형식
    const playCell = row.find(c => c.Class === 'play');
    if (!playCell) continue;

    const playText = playCell.Text.replace(/<[^>]+>/g, '').trim();
    // '팀A숫자vs숫자팀B' 패턴: 예) '한화3vs5두산', 'NC7vs8삼성'
    const playMatch = playText.match(/^(.+?)(\d+)vs(\d+)(.+)$/);
    if (playMatch) {
      const awayTeam = playMatch[1].trim();
      const awayScore = parseInt(playMatch[2]);
      const homeScore = parseInt(playMatch[3]);
      const homeTeam = playMatch[4].trim();
      games.push({
        homeTeam,
        awayTeam,
        homeScore,
        awayScore,
        winner: homeScore > awayScore ? homeTeam
          : awayScore > homeScore ? awayTeam
          : '무승부'
      });
    }
  }
  return games;
}

// 예정 경기(내일) 파싱
// 예정 경기도 Class='play', Text='팀A vs 팀B' 형식 (점수 없음, 시간만 있음)
function parseKboScheduled(apiData, targetDate) {
  const games = [];
  if (!apiData?.rows) return games;

  let currentDate = '';

  for (const rowObj of apiData.rows) {
    const row = rowObj.row;
    if (!row) continue;

    const dateCell = row.find(cell => cell.Class === 'day');
    if (dateCell) currentDate = dateCell.Text.replace(/<[^>]+>/g, '').trim();

    if (currentDate !== targetDate) continue;

    const timeCell = row.find(c => c.Class === 'time');
    const playCell = row.find(c => c.Class === 'play');
    if (!timeCell || !playCell) continue;

    const timeText = timeCell.Text.replace(/<[^>]+>/g, '').trim();
    const playText = playCell.Text.replace(/<[^>]+>/g, '').trim();

    // 예정 경기는 점수 없이 '팀A vs 팀B' 형태로 표시됨
    // 'vs'가 있고 숫자가 없으면 예정 경기
    if (playText.includes('vs') && !/\d+vs\d+/.test(playText)) {
      const [awayTeam, homeTeam] = playText.split('vs').map(s => s.trim());
      if (awayTeam && homeTeam) {
        games.push({ homeTeam, awayTeam, gameTime: timeText });
      }
    }
  }
  return games;
}

// =====================================================
// 🤖 제미나이 AI 예측 함수
// =====================================================

async function predictWithGemini(apiKey, scheduledGames, todayResults, tomorrowLabel) {
  if (scheduledGames.length === 0) return [];

  const gamesText = scheduledGames
    .map(g => `${g.awayTeam}(원정) vs ${g.homeTeam}(홈) - ${g.gameTime}`)
    .join('\n');

  const prompt = `당신은 KBO 야구 전문 분석가입니다.
내일(${tomorrowLabel}) 예정된 KBO 경기 일정입니다:
${gamesText}

오늘 경기 결과 참고:
${todayResults.map(g => `${g.awayTeam} vs ${g.homeTeam}: ${g.awayScore}:${g.homeScore}`).join('\n')}

각 경기의 승패를 예측해서 아래 JSON 배열 형식으로만 응답해줘. 마크다운이나 설명은 절대 쓰지 마.
[
  {
    "homeTeam": "홈팀명",
    "awayTeam": "원정팀명",
    "predictedWinner": "예측 승리팀명",
    "confidence": "높음/중간/낮음",
    "reason": "예측 근거 한 줄 (홈 이점, 최근 폼 등)"
  }
]`;

  // gemini-2.5-flash: 빠르고 가벼워서 cron 예측에 최적
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 2048 }
      })
    }
  );

  if (!res.ok) throw new Error(`Gemini API 실패: ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();

  try {
    return JSON.parse(clean);
  } catch {
    return [];
  }
}

// =====================================================
// ⏰ 메인 Cron 핸들러
// =====================================================

export default async function handler(req, res) {
  // Vercel Cron 보안 인증
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const geminiApiKey = process.env.GEMINI_API_KEY;
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;

  if (!geminiApiKey || !serviceAccountRaw) {
    return res.status(500).json({ error: '환경변수 설정 누락' });
  }

  const serviceAccount = JSON.parse(serviceAccountRaw);

  try {
    // 📅 한국 시간 기준 날짜 계산
    const now = new Date();
    const koNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const tomorrowKo = new Date(koNow.getTime() + 24 * 60 * 60 * 1000);
    const pad = n => n < 10 ? '0' + n : String(n);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    const todayMonth = koNow.getUTCMonth() + 1;
    const todayDay = koNow.getUTCDate();
    const todayYear = koNow.getUTCFullYear();

    const tomorrowMonth = tomorrowKo.getUTCMonth() + 1;
    const tomorrowDay = tomorrowKo.getUTCDate();
    const tomorrowYear = tomorrowKo.getUTCFullYear();
    const tomorrowDayOfWeek = tomorrowKo.getUTCDay(); // 0=일, 1=월

    // KBO 날짜 형식: '06.12(금)'
    const todayLabel = `${pad(todayMonth)}.${pad(todayDay)}(${dayNames[koNow.getUTCDay()]})`;
    const tomorrowLabel = `${pad(tomorrowMonth)}.${pad(tomorrowDay)}(${dayNames[tomorrowDayOfWeek]})`;
    const tomorrowISO = `${tomorrowYear}-${pad(tomorrowMonth)}-${pad(tomorrowDay)}`;

    // 월요일 여부 확인 (KBO 공식 휴무일)
    const isTomorrowMonday = tomorrowDayOfWeek === 1;

    console.log(`🗓️ 오늘: ${todayLabel} | 내일: ${tomorrowLabel} | 월요일: ${isTomorrowMonday}`);

    // ⚾ KBO API 호출
    const kboData = await fetchKboSchedule(todayMonth, todayYear);

    // 오늘 종료된 경기 결과 파싱
    const todayResults = parseKboGames(kboData, todayLabel);
    console.log(`✅ 오늘 종료 경기: ${todayResults.length}개`);

    // 내일 예정 경기 파싱
    let scheduledGames = [];
    if (!isTomorrowMonday) {
      // 달이 바뀌는 경우 처리
      const tomorrowData = tomorrowMonth !== todayMonth
        ? await fetchKboSchedule(tomorrowMonth, tomorrowYear)
        : kboData;
      scheduledGames = parseKboScheduled(tomorrowData, tomorrowLabel);
      console.log(`📅 내일 예정 경기: ${scheduledGames.length}개`);
    }

    // 🤖 제미나이 AI로 내일 경기 승패 예측 (실패해도 결과 저장은 계속 진행)
    let predictions = [];
    if (!isTomorrowMonday && scheduledGames.length > 0) {
      try {
        predictions = await predictWithGemini(geminiApiKey, scheduledGames, todayResults, tomorrowISO);
        console.log(`🔮 예측 완료: ${predictions.length}개`);
      } catch (predErr) {
        console.error('⚠️ 예측 실패 (결과 저장은 계속):', predErr.message);
      }
    }

    // 🔥 파이어베이스에 저장
    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;
    let savedCount = 0;

    // 오늘 경기 결과 저장
    for (const game of todayResults) {
      await saveDocument(accessToken, projectId, 'games', {
        date: `${todayYear}-${pad(todayMonth)}-${pad(todayDay)}`,
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        homeScore: String(game.homeScore),
        awayScore: String(game.awayScore),
        winner: game.winner,
        type: 'result',
        createdAt: new Date().toISOString()
      });
      savedCount++;
    }

    // 내일 경기 예측 저장
    for (const pred of predictions) {
      await saveDocument(accessToken, projectId, 'predictions', {
        date: tomorrowISO,
        homeTeam: pred.homeTeam || '',
        awayTeam: pred.awayTeam || '',
        predictedWinner: pred.predictedWinner || '',
        confidence: pred.confidence || '중간',
        reason: pred.reason || '',
        type: 'prediction',
        createdAt: new Date().toISOString()
      });
      savedCount++;
    }

    const summary = isTomorrowMonday
      ? `✅ 오늘 ${todayResults.length}경기 결과 저장. 내일은 월요일(KBO 휴무)로 예측 없음. 총 ${savedCount}개 저장.`
      : `✅ 오늘 ${todayResults.length}경기 결과 + 내일 ${predictions.length}경기 예측. 총 ${savedCount}개 저장.`;

    console.log(summary);

    return res.status(200).json({
      success: true,
      message: summary,
      todayResults: todayResults.length,
      tomorrowPredictions: predictions.length,
      totalSaved: savedCount,
      isTomorrowMonday
    });

  } catch (error) {
    console.error('Cron 실행 오류:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
