import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    const utterance = req.body?.userRequest?.utterance || '';

    // 여러 모델 이름을 순차적으로 시도합니다 (버전 업데이트에 따른 404 에러 방지)
    const modelNamesToTry = [
      "gemini-2.0-flash",
      "gemini-2.5-flash", 
      "gemini-1.5-flash-latest",
      "gemini-pro"
    ];

    let geminiReply = "죄송합니다, 사용 가능한 AI 모델을 찾지 못했습니다.";

    for (const modelName of modelNamesToTry) {
      try {
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          systemInstruction: "너는 KBO 프로야구 결과를 정리해서 데이터베이스에 입력해주는 똑똑한 AI 어시스턴트야. 지금은 카카오톡 봇 연결 테스트 중이므로, 사용자가 하는 말에 대해 아주 친절하고 짧게(2~3줄 이내) 대답해줘."
        });
        const result = await model.generateContent(utterance);
        geminiReply = result.response.text();
        break; // 성공하면 반복문 탈출
      } catch (err) {
        // 404 에러면 다음 모델 시도, 아니면 에러 발생
        if (err.message && err.message.includes('404')) {
          console.log(`Model ${modelName} not found, trying next...`);
          continue;
        } else {
          throw err;
        }
      }
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
              text: "⚠️ 제미나이 연결 오류: " + (error.message || String(error))
            }
          }
        ]
      }
    });
  }
}
