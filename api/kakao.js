import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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

  for (const modelName of modelNamesToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { 
          maxOutputTokens: 300, 
          temperature: 0.1,
          responseMimeType: "application/json" // 강제로 JSON만 뱉도록 설정 (마크다운 차단)
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
  try {
    // responseMimeType: application/json 옵션으로 인해 순수 JSON 문자열만 오게 됩니다.
    parsedData = JSON.parse(geminiReplyText);
  } catch (e) {
    // 만약 파싱에 실패하면 텍스트 자체를 리턴합니다.
    parsedData = { summary: geminiReplyText };
  }

  const replyMessage = (parsedData.summary || "결과를 성공적으로 처리했습니다.");

  return res.status(200).json({
    version: "2.0",
    template: { outputs: [{ simpleText: { text: replyMessage } }] }
  });
}
