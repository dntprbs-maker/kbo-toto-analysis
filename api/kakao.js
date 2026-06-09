import { GoogleGenerativeAI } from '@google/generative-ai';
import admin from 'firebase-admin';

// 파이어베이스 관리자(Admin) 권한 초기화
// Vercel 환경변수에서 FIREBASE_SERVICE_ACCOUNT 문자열을 가져와 JSON으로 변환합니다.
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

    // 시스템 프롬프트: 제미나이가 무조건 JSON 형식으로만 답하도록 강제합니다.
    const systemPrompt = `
      너는 KBO 프로야구 결과를 정리해서 데이터베이스에 입력해주는 똑똑한 AI 어시스턴트야.
      사용자의 말을 분석해서 아래 JSON 형식으로만 정확하게 리턴해. 마크다운(\`\`\`json)이나 다른 설명은 절대 추가하지 마.
      {
        "team": "분석된 메인 팀 이름 (예: 기아, LG, 삼성 등)",
        "opponent": "상대 팀 이름",
        "score": "점수 (예: 3:2)",
        "result": "승리, 패배, 무승부 중 하나",
        "summary": "사용자에게 카카오톡으로 보낼 친절한 2~3줄 요약 코멘트"
      }
      만약 사용자의 말이 야구 결과와 무관하다면,
      {
        "error": "true",
        "summary": "야구 경기 결과에 대한 문장이 아닙니다. '오늘 기아 3:2로 이겼어' 처럼 말씀해 주세요!"
      }
      형식으로 리턴해.
    `;

    const modelNamesToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro-latest",
      "gemini-pro",
      "gemini-2.0-flash",
      "gemini-2.5-flash"
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
        geminiReplyText = result.response.text().trim();
        
        // 마크다운 백틱 제거 (가끔 제미나이가 강제로 붙일 때를 대비)
        geminiReplyText = geminiReplyText.replace(/^```json/g, '').replace(/^```/g, '').replace(/```$/g, '').trim();
        
        // JSON 파싱 테스트 (성공하면 통과)
        JSON.parse(geminiReplyText);
        
        lastError = null;
        break; 
      } catch (err) {
        console.log(`Model ${modelName} failed or returned invalid JSON. Trying next...`);
        lastError = err;
        continue;
      }
    }

    if (lastError) {
      throw new Error("AI가 유효한 JSON을 생성하지 못했거나 할당량이 초과되었습니다.");
    }

    // JSON 파싱
    const parsedData = JSON.parse(geminiReplyText);
    
    let replyMessage = parsedData.summary;

    // 야구 결과 데이터라면 DB에 저장
    if (!parsedData.error && db) {
      const docData = {
        team: parsedData.team || "알 수 없음",
        opponent: parsedData.opponent || "알 수 없음",
        score: parsedData.score || "-",
        result: parsedData.result || "-",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        originalText: utterance
      };
      
      // Firestore 'kbo_results' 컬렉션에 추가
      await db.collection('kbo_results').add(docData);
      
      replyMessage += "\n\n✅ [데이터베이스 저장 완료!]";
    }

    // 카카오톡 응답 포맷
    const responseBody = {
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
    };

    return res.status(200).json(responseBody);
  } catch (error) {
    console.error('Kakao/Gemini Webhook Error:', error);
    
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: "⚠️ 처리 오류: " + (error.message || String(error))
            }
          }
        ]
      }
    });
  }
}
