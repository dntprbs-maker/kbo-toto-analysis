import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    const utterance = req.body?.userRequest?.utterance || '';

    // 가장 확실하게 사용 가능한 최신 모델로 고정
    const modelName = "gemini-2.5-flash";
    const model = genAI.getGenerativeModel({ model: modelName });

    const prompt = `
[지시사항]
다음 야구 결과를 읽고 JSON으로만 답해. 최대한 짧게 써야 해.
{
  "team": "승리팀(또는 메인팀)",
  "opponent": "상대팀",
  "score": "점수",
  "result": "승/패/무",
  "summary": "1줄 요약"
}

[사용자 입력]
${utterance}
`;

    // 타임아웃 방지를 위해 maxOutputTokens 제한
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 150,
        temperature: 0.2
      }
    });

    const geminiReplyText = result.response.text();
    
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
    
    let replyMessage = parsedData.summary || "결과를 성공적으로 처리했습니다.";
    replyMessage += "\n\n⚠️ 초고속 응답 테스트 완료!";

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
