import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    const utterance = req.body?.userRequest?.utterance || '';

    // 시간 초과(5초)를 막기 위해 존재하지 않는 가짜 모델 하나만 찔러서 고의로 에러를 냅니다.
    const modelNamesToTry = ["force-error-model"];

    let geminiReplyText = "";
    let lastError = null;

    for (const modelName of modelNamesToTry) {
      try {
        const model = genAI.getGenerativeModel({ model: modelName });
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
      throw lastError; // 강제로 catch 블록으로 보냄
    }

    return res.status(200).json({
      version: "2.0",
      template: { outputs: [{ simpleText: { text: "성공: " + geminiReplyText } }] }
    });
  } catch (error) {
    let availableModels = "";
    try {
      // REST API로 진짜 목록만 1초만에 가져오기
      const response = await fetch(\`https://generativelanguage.googleapis.com/v1beta/models?key=\${process.env.GEMINI_API_KEY}\`);
      const data = await response.json();
      if (data && data.models) {
        // text generation 을 지원하는 모델만 필터링
        const textModels = data.models.filter(m => m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent"));
        availableModels = textModels.map(m => m.name.replace('models/', '')).join(',\\n');
      }
    } catch (e) {
      availableModels = "목록을 가져올 수 없음";
    }

    return res.status(200).json({
      version: "2.0",
      template: { 
        outputs: [{ 
          simpleText: { 
            text: "✅ [사용 가능한 제미나이 모델 목록]\\n\\n" + availableModels
          } 
        }] 
      }
    });
  }
}
