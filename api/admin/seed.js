import { getFirebaseAccessToken, toFirestoreFields } from '../_utils/firebase.js';

const INITIAL_DATA = [
  {date:"2026-06-07",games:[{matchup:"삼성 vs KIA",ai1:"KIA",ai2:"KIA",ai3:"KIA",pick:"KIA",result:"KIA"},{matchup:"한화 vs 롯데",ai1:"한화",ai2:"한화",ai3:"한화",pick:"한화",result:"한화"},{matchup:"LG vs NC",ai1:"NC",ai2:"LG",ai3:"LG",pick:"LG",result:"NC"},{matchup:"KT vs SSG",ai1:"SSG",ai2:"KT",ai3:"KT",pick:"KT",result:"SSG"},{matchup:"키움 vs 두산",ai1:"두산",ai2:"두산",ai3:"두산",pick:"두산",result:"키움"}]},
  {date:"2026-06-09",games:[{matchup:"SSG vs LG",ai1:"LG",ai2:"LG",ai3:"LG",pick:"LG",result:"LG"},{matchup:"두산 vs 롯데",ai1:"두산",ai2:"두산",ai3:"두산",pick:"두산",result:"두산"},{matchup:"KIA vs 한화",ai1:"한화",ai2:"KIA",ai3:"KIA",pick:"KIA",result:"KIA"},{matchup:"NC vs 키움",ai1:"키움",ai2:"키움",ai3:"NC",pick:"키움",result:"키움"},{matchup:"삼성 vs KT",ai1:"KT",ai2:"KT",ai3:"KT",pick:"KT",result:"KT"}]},
  {date:"2026-06-10",games:[{matchup:"SSG vs LG",ai1:"LG",ai2:"LG",ai3:"LG",pick:"LG",result:"LG"},{matchup:"두산 vs 롯데",ai1:"두산",ai2:"두산",ai3:"두산",pick:"두산",result:"롯데"},{matchup:"삼성 vs KT",ai1:"삼성",ai2:"KT",ai3:"KT",pick:"KT",result:"KT"},{matchup:"KIA vs 한화",ai1:"KIA",ai2:"KIA",ai3:"한화",pick:"KIA",result:"한화"},{matchup:"NC vs 키움",ai1:"NC",ai2:"키움",ai3:"NC",pick:"NC",result:"NC"}]},
  {date:"2026-06-11",games:[{matchup:"SSG vs LG",ai1:"LG",ai2:"LG",ai3:"LG",pick:"LG",result:"LG"},{matchup:"두산 vs 롯데",ai1:"롯데",ai2:"두산",ai3:"두산",pick:"두산",result:"두산"},{matchup:"삼성 vs KT",ai1:"삼성",ai2:"KT",ai3:"KT",pick:"KT",result:"삼성"},{matchup:"KIA vs 한화",ai1:"한화",ai2:"KIA",ai3:"한화",pick:"한화",result:"한화"},{matchup:"NC vs 키움",ai1:"NC",ai2:"키움",ai3:"NC",pick:"NC",result:"NC"}]},
  {date:"2026-06-12",games:[{matchup:"롯데 vs LG",ai1:"LG",ai2:"LG",ai3:"LG",pick:"LG",result:"롯데"},{matchup:"두산 vs KIA",ai1:"KIA",ai2:"KIA",ai3:"KIA",pick:"KIA",result:"두산"},{matchup:"한화 vs 키움",ai1:"키움",ai2:"키움",ai3:"한화",pick:"키움",result:"키움"},{matchup:"SSG vs 삼성",ai1:"삼성",ai2:"삼성",ai3:"SSG",pick:"삼성",result:"SSG"},{matchup:"NC vs KT",ai1:"NC",ai2:"NC",ai3:"KT",pick:"NC",result:"KT"}]}
];

export default async function handler(req, res) {
  try {
    const { accessToken, projectId } = await getFirebaseAccessToken();
    const gamesUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/games`;
    const predsUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/predictions`;

    let inserted = 0;

    for (const day of INITIAL_DATA) {
      for (const g of day.games) {
        const teams = g.matchup.split(' vs ');
        const awayTeam = teams[0].trim();
        const homeTeam = teams[1].trim();

        // 1. Insert Game
        const gameBody = {
          date: day.date,
          homeTeam,
          awayTeam,
          homeScore: 0,
          awayScore: 0,
          winner: g.result,
          createdAt: new Date().toISOString(),
          type: 'result'
        };

        await fetch(gamesUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFirestoreFields(gameBody) })
        });
        inserted++;

        // 2. Insert Prediction
        const predBody = {
          date: day.date,
          homeTeam,
          awayTeam,
          predictedWinner: g.pick,
          confidence: '중간',
          reason: 'AI 예측',
          createdAt: new Date().toISOString(),
          type: 'prediction'
        };

        await fetch(predsUrl, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ fields: toFirestoreFields(predBody) })
        });
        inserted++;
      }
    }

    return res.status(200).json({ success: true, inserted });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}
