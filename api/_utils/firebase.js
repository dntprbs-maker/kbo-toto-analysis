import crypto from 'crypto';

export async function getFirebaseAccessToken() {
  const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!serviceAccountRaw) throw new Error('FIREBASE_SERVICE_ACCOUNT 환경변수가 없습니다.');
  
  const serviceAccount = JSON.parse(serviceAccountRaw);
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };
  
  const toBase64Url = (obj) =>
    Buffer.from(JSON.stringify(obj)).toString('base64')
      .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
      
  const signatureInput = `${toBase64Url(header)}.${toBase64Url(claim)}`;
  const sign = crypto.createSign('RSA-SHA256');
  sign.update(signatureInput);
  const signature = sign.sign(serviceAccount.private_key, 'base64')
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const jwt = `${signatureInput}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`
  });
  
  if (!res.ok) throw new Error('토큰 발급 실패');
  const data = await res.json();
  return { accessToken: data.access_token, projectId: serviceAccount.project_id };
}

export function parseFirestoreDoc(doc) {
  if (!doc.fields) return { id: doc.name.split('/').pop() };
  
  const parsed = { id: doc.name.split('/').pop() };
  for (const [key, value] of Object.entries(doc.fields)) {
    if (value.stringValue !== undefined) parsed[key] = value.stringValue;
    else if (value.integerValue !== undefined) parsed[key] = Number(value.integerValue);
    else if (value.booleanValue !== undefined) parsed[key] = value.booleanValue;
    else if (value.doubleValue !== undefined) parsed[key] = Number(value.doubleValue);
  }
  return parsed;
}

export function toFirestoreFields(data) {
  const fields = {};
  for (const [key, value] of Object.entries(data)) {
    if (key === 'id') continue;
    if (typeof value === 'string') fields[key] = { stringValue: value };
    else if (typeof value === 'number') fields[key] = { integerValue: String(value) };
    else if (typeof value === 'boolean') fields[key] = { booleanValue: value };
  }
  return fields;
}
