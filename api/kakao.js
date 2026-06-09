import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from 'firebase-admin';

// 파이어베이스 관리자(Admin) 권한 초기화
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Firebase 초기화 에러:", error);
  }
}

const db = admin.apps.length ? admin.firestore() : null;
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    const utterance = req.body?.userRequest?.utterance || '';

    const systemPrompt = `
      너는 KBO 프로야구 결과를 정리해서 데이터베이스에 입력해주는 똑똑한 AI 어시스턴트야.
      사용자의 말을 분석해서 아래 JSON 형식으로만 정확하게 리턴해.
      {
        "team": "분석된 메인 팀 이름",
        "opponent": "상대 팀 이름",
        "score": "점수",
        "result": "승리, 패배, 무승부 중 하나",
        "summary": "사용자에게 카카오톡으로 보낼 친절한 2~3줄 요약 코멘트"
      }
      만약 사용자의 말이 야구 결과와 무관하다면,
      {
        "error": "true",
        "summary": "야구 경기 결과에 대한 문장이 아닙니다. '오늘 기아 3:2로 이겼어' 처럼 말씀해 주세요!"
      }
    `;

    // 응답 속도를 위해 2개의 모델만 우선 시도 (카카오톡 5초 타임아웃 방지)
    const modelNamesToTry = [
      "gemini-1.5-flash-8b",
      "gemini-pro"
    ];

    let geminiReplyText = "";
    let lastError = null;

    for (const modelName of modelNamesToTry) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: systemPrompt
        });
        const result = await model.generateContent(utterance);
        geminiReplyText = result.response.text();
        lastError = null;
        break; // 성공 시 루프 탈출
      } catch (err) {
        console.log(`Model ${modelName} failed. Error:`, err.message);
        lastError = err;
        continue;
      }
    }

    if (lastError && !geminiReplyText) {
      throw new Error("AI 호출 실패: " + lastError.message);
    }

    // JSON 강제 추출 (정규식 사용)
    let parsedData = {};
    try {
      const jsonMatch = geminiReplyText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("JSON 형태를 찾을 수 없습니다.");
      }
    } catch (parseErr) {
      console.error("JSON 파싱 에러:", parseErr, "원본 텍스트:", geminiReplyText);
      parsedData = { error: "true", summary: "데이터를 분석했지만, 형식이 맞지 않습니다. 원본 답변: " + geminiReplyText };
    }
    
    let replyMessage = parsedData.summary || "결과를 처리했습니다.";

    // DB 저장
    if (!parsedData.error && db) {
      const docData = {
        team: parsedData.team || "알 수 없음",
        opponent: parsedData.opponent || "알 수 없음",
        score: parsedData.score || "-",
        result: parsedData.result || "-",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        originalText: utterance
      };
      
      await db.collection('kbo_results').add(docData);
      replyMessage += "\n\n✅ [데이터베이스 저장 완료!]";
    } else if (!db) {
      replyMessage += "\n\n⚠️ 파이어베이스 키가 연결되지 않아 DB에는 저장되지 않았습니다.";
    }

    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: replyMessage
            }
          }
        ]
      }
    });
  } catch (error) {
    console.error('Kakao/Gemini Webhook Error:', error);
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: "⚠️ 처리 오류: " + error.message } }]
      }
    });
  }
}
