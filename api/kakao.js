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

  const prompt = `다음 야구 결과를 읽고 JSON으로만 답해. 다른 말은 절대 하지 마.
{"team":"팀명","opponent":"상대팀","score":"점수","result":"승/패/무","summary":"1줄 요약"}

입력: ${utterance}`;

  let geminiReplyText = "";
  let lastError = null;

  for (const modelName of modelNamesToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        // 한글 생성 시 토큰이 많이 필요하므로 300으로 늘립니다. (100은 너무 짧아서 텍스트가 잘렸습니다)
        generationConfig: { maxOutputTokens: 300, temperature: 0.1 }
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
    const jsonMatch = geminiReplyText.match(/\{[\s\S]*\}/);
    parsedData = jsonMatch ? JSON.parse(jsonMatch[0]) : { summary: geminiReplyText };
  } catch (e) {
    parsedData = { summary: geminiReplyText };
  }

  const replyMessage = (parsedData.summary || "결과를 처리했습니다.");

  return res.status(200).json({
    version: "2.0",
    template: { outputs: [{ simpleText: { text: replyMessage } }] }
  });
}
