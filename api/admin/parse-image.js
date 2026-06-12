// 이미지(base64)를 받아 Gemini Vision으로 KBO 경기 결과를 파싱하는 API
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, mimeType = 'image/jpeg', gameDate } = req.body;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
    if (!imageBase64) return res.status(400).json({ error: '이미지 데이터가 없습니다.' });

    // Gemini Vision에게 이미지 분석 요청
    const prompt = `이 이미지는 KBO 야구 경기 결과 화면입니다.
    
이미지에서 '종료'된 경기만 찾아서, 아래 JSON 배열 형식으로만 정확하게 응답해주세요.
진행 중이거나 예정된 경기는 제외하세요.

응답 예시:
[
  {
    "date": "${gameDate || new Date().toISOString().split('T')[0]}",
    "awayTeam": "원정팀명",
    "homeTeam": "홈팀명",
    "awayScore": 숫자,
    "homeScore": 숫자,
    "winner": "승리팀명"
  }
]

규칙:
- 왼쪽 팀이 원정(away), 오른쪽 팀이 홈(home)입니다
- winner는 점수가 높은 팀명을 그대로 적어주세요
- 동점인 경우 winner는 "무승부"로 적으세요
- 팀명은 한국어로 정확히 기입하세요 (예: 롯데, LG, KIA, 한화, 두산, SSG, NC, KT, 키움, 삼성)
- JSON만 응답하고 다른 설명은 절대 쓰지 마세요`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              // 이미지 파트
              {
                inlineData: {
                  mimeType: mimeType,
                  data: imageBase64
                }
              },
              // 텍스트 프롬프트 파트
              { text: prompt }
            ]
          }],
          generationConfig: {
            temperature: 0.1, // 낮을수록 정확한 추출
            maxOutputTokens: 1024
          }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API 오류 ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';

    // JSON 파싱 (마크다운 코드블록 제거)
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedGames;
    try {
      parsedGames = JSON.parse(clean);
    } catch {
      return res.status(422).json({
        error: '이미지에서 경기 결과를 파싱하지 못했습니다. 더 선명한 이미지를 시도해보세요.',
        rawText: text
      });
    }

    return res.status(200).json({
      success: true,
      games: parsedGames,
      count: parsedGames.length
    });

  } catch (error) {
    console.error('Image Parse Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
