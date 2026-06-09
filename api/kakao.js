import { GoogleGenerativeAI } from '@google/generative-ai';

// Vercel 환경변수에서 Gemini API 키를 자동으로 불러옵니다.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

export default async function handler(req, res) {
  // 카카오톡 오픈빌더는 무조건 POST 방식입니다.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    // 1. 카카오톡에서 사용자가 친 채팅 텍스트 가져오기
    const utterance = req.body?.userRequest?.utterance || '';

    // 2. 구글 제미나이(Gemini) API 호출
    // 가장 빠르고 100% 무료인 gemini-1.5-flash 모델을 사용합니다.
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      systemInstruction: "너는 KBO 프로야구 결과를 정리해서 데이터베이스에 입력해주는 똑똑한 AI 어시스턴트야. 지금은 카카오톡 봇 연결 테스트 중이므로, 사용자가 하는 말에 대해 아주 친절하고 짧게(2~3줄 이내) 대답해줘."
    });

    const result = await model.generateContent(utterance);
    const geminiReply = result.response.text();

    // 3. 제미나이의 답변을 카카오톡 규격에 맞게 포장하기
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

    // 4. 카카오톡으로 결과 전송
    return res.status(200).json(responseBody);
  } catch (error) {
    console.error('Kakao/Gemini Webhook Error:', error);
    
    // API 키가 없거나 에러가 났을 때 이유를 카톡으로 알려줍니다.
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
