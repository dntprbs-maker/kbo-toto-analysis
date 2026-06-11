import crypto from 'crypto';

// =====================================================
// 🔥 파이어베이스 관련 유틸리티 함수들
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

// 파이어스토어에 단일 문서 저장
async function saveDocument(accessToken, projectId, collection, docData) {
  const firestoreFields = {};
  for (const [key, value] of Object.entries(docData)) {
    if (typeof value === 'string') {
      firestoreFields[key] = { stringValue: value };
    } else if (typeof value === 'number') {
      firestoreFields[key] = { integerValue: String(value) };
    } else if (typeof value === 'boolean') {
      firestoreFields[key] = { booleanValue: value };
    }
  }
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/${collection}`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ fields: firestoreFields })
    }
  );
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Firestore 저장 실패: ${err}`);
  }
  return await res.json();
}

// =====================================================
// 🌐 스포츠 데이터 스크래핑 함수 (스탯티즈 활용)
// =====================================================

async function fetchKboData(date) {
  // date: 'YYYYMMDD' 형식
  const url = `https://www.statiz.co.kr/schedule.php?opt=0&slt=&date=${date}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
  });
  if (!res.ok) throw new Error(`스크래핑 실패: ${res.status}`);
  return await res.text();
}

// =====================================================
// 🤖 제미나이 AI 분석 함수
// =====================================================

async function analyzeWithGemini(apiKey, prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096
        }
      })
    }
  );
  if (!res.ok) throw new Error(`Gemini API 실패: ${await res.text()}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

// =====================================================
// ⏰ 메인 Cron 핸들러
// =====================================================

export default async function handler(req, res) {
  // Vercel Cron Job 보안: 인증 헤더 확인
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
    // 📅 날짜 계산 (한국 시간 기준)
    const now = new Date();
    const koNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);

    const pad = (n) => n < 10 ? '0' + n : String(n);
    const todayStr = `${koNow.getUTCFullYear()}${pad(koNow.getUTCMonth() + 1)}${pad(koNow.getUTCDate())}`;
    const todayLabel = `${koNow.getUTCFullYear()}-${pad(koNow.getUTCMonth() + 1)}-${pad(koNow.getUTCDate())}`;

    const tomorrowKo = new Date(koNow.getTime() + 24 * 60 * 60 * 1000);
    const tomorrowStr = `${tomorrowKo.getUTCFullYear()}${pad(tomorrowKo.getUTCMonth() + 1)}${pad(tomorrowKo.getUTCDate())}`;
    const tomorrowLabel = `${tomorrowKo.getUTCFullYear()}-${pad(tomorrowKo.getUTCMonth() + 1)}-${pad(tomorrowKo.getUTCDate())}`;

    // 내일이 월요일인지 확인 (한국 시간 기준)
    // getUTCDay(): 0=일, 1=월, 2=화...
    const tomorrowDay = tomorrowKo.getUTCDay();
    const isTomorrowMonday = tomorrowDay === 1; // 월요일 = 1

    console.log(`🗓️ 오늘: ${todayLabel}, 내일: ${tomorrowLabel} (${isTomorrowMonday ? '월요일-경기없음' : '경기있음'})`);

    // 🌐 오늘 경기 데이터 스크래핑
    const todayHtml = await fetchKboData(todayStr);

    // 🤖 오늘 경기 결과 추출 (Gemini AI)
    const todayPrompt = `다음은 KBO 야구 경기 일정/결과 웹페이지의 HTML입니다.
오늘 날짜(${todayLabel})에 종료된 경기 결과들만 찾아서 아래 JSON 배열 형식으로만 응답해줘.
마크다운이나 부가 설명은 절대 쓰지 마. 오직 JSON 배열만.

[
  {
    "date": "${todayLabel}",
    "homeTeam": "홈팀명",
    "awayTeam": "어웨이팀명",
    "homeScore": 숫자,
    "awayScore": 숫자,
    "winner": "승리팀명",
    "type": "result"
  }
]

경기가 없거나 찾을 수 없으면 빈 배열 [] 만 반환해.

HTML:
${todayHtml.substring(0, 8000)}`;

    const todayResultText = await analyzeWithGemini(geminiApiKey, todayPrompt);
    const cleanToday = todayResultText.replace(/```json/g, '').replace(/```/g, '').trim();
    let todayGames = [];
    try {
      todayGames = JSON.parse(cleanToday);
    } catch (e) {
      // JSON 파싱 실패시 빈 배열
      console.error('오늘 결과 파싱 실패:', e.message, cleanToday.substring(0, 200));
    }

    // 🌐 내일 경기 일정 스크래핑 (월요일이 아닌 경우에만)
    let tomorrowPredictions = [];
    if (!isTomorrowMonday) {
      const tomorrowHtml = await fetchKboData(tomorrowStr);

      // 🤖 내일 경기 일정 파악 + 승패 예측 (Gemini AI)
      const tomorrowPrompt = `다음은 KBO 야구 경기 일정 웹페이지의 HTML입니다.
내일 날짜(${tomorrowLabel})에 예정된 경기들의 일정을 찾아서, 각 경기의 승패를 분석하고 예측해줘.
아래 JSON 배열 형식으로만 응답해줘. 마크다운이나 부가 설명은 절대 쓰지 마. 오직 JSON 배열만.

[
  {
    "date": "${tomorrowLabel}",
    "homeTeam": "홈팀명",
    "awayTeam": "어웨이팀명",
    "predictedWinner": "예측 승리팀명",
    "confidence": "높음/중간/낮음",
    "reason": "예측 근거 한 줄",
    "type": "prediction"
  }
]

예측 근거는 최근 팀 성적, 홈/원정 이점, 최근 맞대결 상성 등을 고려해서 판단해.
경기가 없거나 찾을 수 없으면 빈 배열 [] 만 반환해.

HTML:
${tomorrowHtml.substring(0, 8000)}`;

      const tomorrowResultText = await analyzeWithGemini(geminiApiKey, tomorrowPrompt);
      const cleanTomorrow = tomorrowResultText.replace(/```json/g, '').replace(/```/g, '').trim();
      try {
        tomorrowPredictions = JSON.parse(cleanTomorrow);
      } catch (e) {
        console.error('내일 예측 파싱 실패:', e.message, cleanTomorrow.substring(0, 200));
      }
    }

    // 🔥 파이어베이스에 저장
    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;

    let savedCount = 0;

    // 오늘 경기 결과 저장
    for (const game of todayGames) {
      if (game && typeof game === 'object') {
        await saveDocument(accessToken, projectId, 'games', {
          ...game,
          homeScore: String(game.homeScore ?? ''),
          awayScore: String(game.awayScore ?? ''),
          createdAt: new Date().toISOString()
        });
        savedCount++;
      }
    }

    // 내일 경기 예측 저장
    for (const pred of tomorrowPredictions) {
      if (pred && typeof pred === 'object') {
        await saveDocument(accessToken, projectId, 'predictions', {
          ...pred,
          createdAt: new Date().toISOString()
        });
        savedCount++;
      }
    }

    const summary = isTomorrowMonday
      ? `✅ 오늘 경기 ${todayGames.length}개 저장 완료. 내일은 월요일(공식 휴무)이라 예측 없음.`
      : `✅ 오늘 경기 ${todayGames.length}개 결과 + 내일 경기 ${tomorrowPredictions.length}개 예측. 총 ${savedCount}개 저장 완료.`;

    console.log(summary);

    return res.status(200).json({
      success: true,
      message: summary,
      todayGames: todayGames.length,
      tomorrowPredictions: tomorrowPredictions.length,
      totalSaved: savedCount,
      isTomorrowMonday
    });

  } catch (error) {
    console.error('Cron 실행 오류:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
