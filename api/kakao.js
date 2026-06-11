import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

  const toBase64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const signatureInput = `${toBase64Url(header)}.${toBase64Url(claim)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  const data = await res.json();
  return data.access_token;
}

async function saveToFirestore(parsedData) {
  try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountRaw) return "파이어베이스 키 없음";
    
    const serviceAccount = JSON.parse(serviceAccountRaw);
    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;
    
    const firestoreData = {
      fields: {
        team: { stringValue: parsedData.team || "" },
        opponent: { stringValue: parsedData.opponent || "" },
        score: { stringValue: parsedData.score || "" },
        result: { stringValue: parsedData.result || "" },
        summary: { stringValue: parsedData.summary || "" },
        createdAt: { timestampValue: new Date().toISOString() }
      }
    };

    const res = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(firestoreData)
    });
    
    if (!res.ok) {
      throw new Error(await res.text());
    }
    return "DB 저장 성공!";
  } catch (error) {
    console.error("Firestore Save Error:", error);
    return "DB 에러"; 
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const utterance = req.body?.userRequest?.utterance || '';

  const prompt = `다음 야구 결과를 읽고 순수한 JSON 객체만 답해. 마크다운(\`\`\`)이나 설명은 절대 쓰지 마.
{
  "team": "승리팀(메인팀)",
  "opponent": "상대팀",
  "score": "점수",
  "result": "승/패/무",
  "summary": "1줄 요약"
}

입력: ${utterance}`;

  // 가장 가볍고 빠르며 안정적인 모델 사용
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });
  
  let geminiReplyText = "";
  let isTimeout = false;

  try {
    const aiPromise = model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 250, temperature: 0.1 }
    });
    
    // 카카오톡 5초 타임아웃 절대 방어: 3.5초 안에 답 안 오면 짜름
    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve('TIMEOUT'), 3500));
    
    const result = await Promise.race([aiPromise, timeoutPromise]);
    
    if (result === 'TIMEOUT') {
      isTimeout = true;
      geminiReplyText = '{"summary": "⚠️ AI 응답 지연 (구글 서버 혼잡). 잠시 후 다시 시도해주세요."}';
    } else {
      geminiReplyText = result.response.text();
    }
  } catch (err) {
    geminiReplyText = `{"summary": "⚠️ AI 연결 에러"}`;
  }

  // 혹시라도 섞여 들어올 수 있는 마크다운 찌꺼기 제거
  let cleanText = geminiReplyText.replace(/```json/g, '').replace(/```/g, '').trim();

  let parsedData = {};
  let dbStatus = "저장 대기";
  
  try {
    parsedData = JSON.parse(cleanText);
    
    if (!isTimeout) {
      // 카카오톡에 답장을 바로 쏘기 위해 DB 저장은 백그라운드로 실행 (await 생략)
      saveToFirestore(parsedData).catch(console.error);
      dbStatus = "저장 시도 완료";
    } else {
      dbStatus = "지연으로 건너뜀";
    }
  } catch (e) {
    parsedData = { summary: cleanText };
    dbStatus = "JSON 파싱 실패";
  }

  const replyMessage = (parsedData.summary || "결과를 처리했습니다.") + `\n\n✅ [${dbStatus}]`;

  return res.status(200).json({
    version: "2.0",
    template: { outputs: [{ simpleText: { text: replyMessage } }] }
  });
}
