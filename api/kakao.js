import { GoogleGenerativeAI } from '@google/generative-ai';
import crypto from 'crypto';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 💡 꼼수 비법: 무거운 파이어베이스 라이브러리(firebase-admin)를 쓰지 않고, 순수 HTTP 요청(REST API)으로 가볍게 쏘는 함수입니다.
// 이렇게 하면 Vercel 서버가 무거워서 터지는 현상을 100% 방지할 수 있습니다!
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

// 파이어스토어(Firestore)에 데이터 저장하는 함수
async function saveToFirestore(parsedData) {
  try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!serviceAccountRaw) return "파이어베이스 키 없음";
    
    const serviceAccount = JSON.parse(serviceAccountRaw);
    const accessToken = await getFirebaseAccessToken(serviceAccount);
    const projectId = serviceAccount.project_id;
    
    // 파이어스토어 규격에 맞게 데이터 포장
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

    // 'games' 라는 이름의 컬렉션(폴더)에 문서 저장
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
    return "DB 저장 실패: " + error.message.substring(0, 50); // 에러 메시지가 너무 길면 카카오가 끊어버리므로 짧게 자름
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const utterance = req.body?.userRequest?.utterance || '';

  const modelNamesToTry = [
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-3.5-flash",
    "gemini-2.5-flash"
  ];

  const prompt = `다음 야구 결과를 읽고 JSON 형식으로만 답해. 다른 말은 절대 하지 마.
{
  "team": "승리팀(메인팀)",
  "opponent": "상대팀",
  "score": "점수",
  "result": "승/패/무",
  "summary": "1줄 요약"
}

입력: ${utterance}`;

  let geminiReplyText = "";
  let lastError = null;

  // 제미나이 AI 호출
  for (const modelName of modelNamesToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { 
          maxOutputTokens: 300, 
          temperature: 0.1,
          responseMimeType: "application/json"
        }
      });
      geminiReplyText = result.response.text();
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      continue;
    }
  }

  if (lastError && !geminiReplyText) {
    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "⚠️ AI 연결 실패: " + lastError.message } }] }
    });
  }

  let parsedData = {};
  let dbStatus = "";
  try {
    // 1. JSON 분석
    parsedData = JSON.parse(geminiReplyText);
    
    // 2. 파이어베이스에 몰래 꽂아넣기!
    dbStatus = await saveToFirestore(parsedData);
    
  } catch (e) {
    parsedData = { summary: geminiReplyText };
    dbStatus = "JSON 파싱 실패로 DB 저장 건너뜀";
  }

  const replyMessage = (parsedData.summary || "결과를 성공적으로 처리했습니다.") + `\n\n✅ [${dbStatus}]`;

  return res.status(200).json({
    version: "2.0",
    template: { outputs: [{ simpleText: { text: replyMessage } }] }
  });
}
