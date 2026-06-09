import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    const utterance = req.body?.userRequest?.utterance || '';

    // 다양한 제미나이 모델을 순서대로 모두 시도해 봅니다.
    // 계정에 따라 특정 모델의 무료 할당량(Quota)이 0일 수 있으므로 구형 모델까지 다 찔러봅니다.
    const modelNamesToTry = [
      "gemini-1.5-flash",
      "gemini-1.5-flash-latest",
      "gemini-1.5-flash-8b",
      "gemini-1.5-pro-latest",
      "gemini-pro",
      "gemini-2.0-flash",
      "gemini-2.5-flash"
    ];

    let geminiReply = "죄송합니다, 사용 가능한 AI 모델을 찾지 못했습니다.";
    let lastError = null;

    for (const modelName of modelNamesToTry) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: "너는 KBO 프로야구 결과를 정리해서 데이터베이스에 입력해주는 똑똑한 AI 어시스턴트야. 지금은 카카오톡 봇 연결 테스트 중이므로, 사용자가 하는 말에 대해 아주 친절하고 짧게(2~3줄 이내) 대답해줘."
        });
        const result = await model.generateContent(utterance);
        geminiReply = result.response.text();
        lastError = null; // 성공했으므로 에러 초기화
        break; // 성공하면 즉시 반복문 탈출
      } catch (err) {
        // 404(Not Found) 거나 429(Quota Exceeded) 등 어떤 에러가 나든 다음 모델을 무조건 시도합니다.
        console.log(`Model ${modelName} failed with error: ${err.message}. Trying next...`);
        lastError = err;
        continue;
      }
    }

    // 모든 모델이 다 실패했다면 마지막 에러를 던집니다.
    if (lastError) {
      throw lastError;
    }

    const responseBody = {
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: `🌟 [제미나이 AI]\n\n${geminiReply}`
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
              text: "⚠️ 제미나이 연결 오류: 모든 모델 연결 실패. (에러 원인: " + (error.message || String(error)) + ")"
            }
          }
        ]
      }
    });
  }
}
