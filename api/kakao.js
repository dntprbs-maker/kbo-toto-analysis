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

    const modelNamesToTry = [
      "gemini-2.5-flash",
      "gemini-2.0-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro",
      "gemini-pro"
    ];

    let geminiReplyText = "";
    let lastError = null;

    for (const modelName of modelNamesToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName, systemInstruction: systemPrompt });
        const result = await model.generateContent(utterance);
        geminiReplyText = result.response.text();
        lastError = null;
        break;
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    if (lastError && !geminiReplyText) {
      throw lastError; // 에러를 밖으로 던져서 catch 블록으로 보냄
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
    
    let replyMessage = parsedData.summary || "결과를 처리했습니다.";
    replyMessage += "\n\n⚠️ 파이어베이스 통신 테스트 완료!";

    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [{ simpleText: { text: replyMessage } }]
      }
    });
  } catch (error) {
    // 모델 리스트 가져와서 에러 메시지에 추가하기
    let availableModels = "";
    try {
      // (꼼수) getGenerativeModel 이 아니라 REST API로 모델 목록 가져오기
      const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models?key=\${process.env.GEMINI_API_KEY}\`);
      const data = await response.json();
      if (data && data.models) {
        availableModels = data.models.map(m => m.name.replace('models/', '')).join(', ');
      }
    } catch (e) {
      availableModels = "목록을 가져올 수 없음";
    }

    return res.status(200).json({
      version: "2.0",
      template: { 
        outputs: [{ 
          simpleText: { 
            text: "⚠️ 제미나이 연결 실패: " + error.message + "\\n\\n[현재 사용 가능한 모델 목록]\\n" + availableModels
          } 
        }] 
      }
    });
  }
}
