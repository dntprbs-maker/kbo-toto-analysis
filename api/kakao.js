export default async function handler(req, res) {
  // 카카오톡 봇(오픈빌더)은 무조건 POST 방식으로만 요청을 보냅니다.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Only POST is accepted.' });
  }

  try {
    // 1. 카카오톡에서 날아온 사용자 메시지 추출 (사용자가 친 채팅 텍스트)
    const utterance = req.body?.userRequest?.utterance || '';

    // TODO: (Phase 2) 여기에 클로드(Claude) API를 호출하는 로직이 추가될 예정입니다.
    // 지금은 Phase 1 단계이므로 서버 연결이 정상적인지 확인하는 테스트용 답장만 보냅니다.
    const replyMessage = `✅ Vercel 서버 통신 성공!\n\n사용자님이 봇에게 보낸 텍스트:\n"${utterance}"\n\n(현재 서버 뼈대 연결 테스트 중입니다. 곧 클로드 두뇌가 이식될 예정입니다.)`;

    // 2. 카카오톡 스킬 응답 포맷(SimpleText 규격)에 맞춰서 JSON 덩어리 만들기
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

    // 3. 카카오톡 서버로 정상(200) 응답 반환 (이 내용이 카톡 채팅방에 뜹니다)
    return res.status(200).json(responseBody);
  } catch (error) {
    console.error('Kakao Webhook Error:', error);
    // 에러가 발생해도 카카오톡에서 확인할 수 있도록 알림을 보냅니다.
    return res.status(200).json({
      version: "2.0",
      template: {
        outputs: [
          {
            simpleText: {
              text: "서버 내부 오류: " + (error.message || String(error))
            }
          }
        ]
      }
    });
  }
}
