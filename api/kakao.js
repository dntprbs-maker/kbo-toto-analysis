import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    const utterance = req.body?.userRequest?.utterance || '';

    const systemPrompt = `
      너는 KBO 프로야구 결과를 정리해주는 똑똑한 AI 어시스턴트야.
      사용자의 말을 분석해서 아래 JSON 형식으로만 정확하게 리턴해.
      {
        "team": "분석된 메인 팀 이름",
        "opponent": "상대 팀 이름",
        "score": "점수",
        "result": "승리, 패배, 무승부 중 하나",
        "summary": "사용자에게 카카오톡으로 보낼 친절한 2~3줄 요약 코멘트"
      }
    `;

    // 2026년 기준 사용 가능한 가장 최신 무료 모델들
    const modelNamesToTry = [
      "gemini-3.5-flash",
      "gemini-2.5-flash",
      "gemini-flash-latest"
    ];

    let geminiReplyText = "";
    let lastError = null;

    for (const modelName of modelNamesToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
        const result = await model.generateContent(utterance);
        geminiReplyText = result.response.text();
        lastError = null;
        break; // 성공하면 반복문 종료
      } catch (err) {
        lastError = err;
        continue; // 실패하면 다음 모델 시도
      }
    }

    if (lastError && !geminiReplyText) {
      throw lastError; 
    }

    let parsedData = {};
    try {
      const jsonMatch = geminiReplyText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("JSON 파싱 실패");
      }
    } catch (parseErr) {
      parsedData = { error: "true", summary: geminiReplyText };
    }
    
    let replyMessage = parsedData.summary || "야구 결과를 성공적으로 처리했습니다.";
    replyMessage += "\n\n⚠️ 파이어베이스 통신 테스트 완료!";

    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: replyMessage } }]
      }
    });
  } catch (error) {
    return res.status(200).json({
      version: "2.0",
      template: { 
        outputs: [{ 
          simpleText: { 
            text: "⚠️ 제미나이 연결 실패: " + error.message 
          } 
        }] 
      }
    });
  }
}
