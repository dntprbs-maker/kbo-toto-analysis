// 이미지 또는 텍스트로부터 KBO 경기 예측 데이터를 파싱하는 API
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { imageBase64, mimeType = 'image/jpeg', rawText, gameDate } = req.body;
    const geminiApiKey = process.env.GEMINI_API_KEY;

    if (!geminiApiKey) return res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' });
    if (!imageBase64 && !rawText) return res.status(400).json({ error: '이미지 또는 텍스트 데이터가 필요합니다.' });

    const prompt = `아래는 KBO 야구 경기 승패 예측 데이터입니다.
형식은 다양할 수 있습니다:
- 여러 AI가 예측한 비교표 (반짝이/별이/초롱이 등 여러 명의 예측 + 다수결)
- 선발 매치업과 신뢰도(%)가 있는 상세 예측표

다음 규칙으로 각 경기의 예측 정보를 JSON 배열로 정확하게 추출해주세요:

1. 경기당 하나의 객체를 만드세요
2. predictedWinner는 "다수결" 또는 가장 많이 예측된 팀으로 결정하세요
3. confidence는 신뢰도(%)가 있으면 그대로, 없으면 다수결 비율로 계산 (예: 3명 중 2명이면 "중간", 3명 모두면 "높음", 1명만이면 "낮음")
4. reason은 선발 투수 정보, 예상 스코어, 신뢰도 근거 등을 한 줄로 요약
5. awayTeam은 "A vs B"에서 A(왼쪽), homeTeam은 B(오른쪽)

응답 형식 (JSON만, 설명 없이):
[
  {
    "date": "${gameDate || new Date().toISOString().split('T')[0]}",
    "awayTeam": "원정팀",
    "homeTeam": "홈팀",
    "predictedWinner": "예측 승리팀",
    "confidence": "높음 또는 중간 또는 낮음 또는 숫자%",
    "reason": "예측 근거 한 줄 요약"
  }
]`;

    // parts 구성 (이미지 or 텍스트)
    const parts = [];
    if (imageBase64) {
      parts.push({ inlineData: { mimeType, data: imageBase64 } });
    }
    if (rawText) {
      parts.push({ text: `다음 텍스트에서 예측 정보를 추출해주세요:\n\n${rawText}\n\n${prompt}` });
    } else {
      parts.push({ text: prompt });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 }
        })
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API 오류 ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const clean = text.replace(/```json/g, '').replace(/```/g, '').trim();

    let parsedPredictions;
    try {
      parsedPredictions = JSON.parse(clean);
    } catch {
      return res.status(422).json({
        error: '예측 데이터를 파싱하지 못했습니다. 이미지가 더 선명한지 또는 텍스트가 정확한지 확인해주세요.',
        rawText: text
      });
    }

    return res.status(200).json({
      success: true,
      predictions: parsedPredictions,
      count: parsedPredictions.length
    });

  } catch (error) {
    console.error('Prediction Parse Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
