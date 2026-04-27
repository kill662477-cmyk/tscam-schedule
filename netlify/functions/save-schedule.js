const crypto = require('crypto');

const DEFAULT_PATH = 'data/schedule.json';
const DEFAULT_BRANCH = 'main';
const DEFAULT_HASH = '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4'; // 1234

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify(body)
  };
}

function sha256(value = '') {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} 환경변수가 없습니다.`);
  return value;
}

function safeScheduleData(input) {
  const weekly = input?.weekly || {};
  const today = input?.today || {};
  const monthly = input?.monthly || {};
  const normArray = (arr) => Array.from({ length: 7 }, (_, i) => String(Array.isArray(arr) ? (arr[i] || '') : ''));
  const cleanMonthly = {};
  if (monthly && typeof monthly === 'object') {
    for (const [key, value] of Object.entries(monthly)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(key) && String(value || '').trim()) {
        cleanMonthly[key] = String(value).trim();
      }
    }
  }
  return {
    weekly: {
      kim: normArray(weekly.kim),
      lee: normArray(weekly.lee)
    },
    today: {
      schedule: String(today.schedule || '').trim(),
      mention: String(today.mention || '').trim()
    },
    monthly: cleanMonthly
  };
}

async function githubFetch(url, token, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(options.headers || {})
    }
  });
  const text = await res.text();
  let parsed = {};
  try { parsed = text ? JSON.parse(text) : {}; } catch (_) { parsed = { raw: text }; }
  if (!res.ok) {
    throw new Error(parsed.message || `GitHub API 오류 (${res.status})`);
  }
  return parsed;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST 요청만 가능합니다.' });

  try {
    const body = JSON.parse(event.body || '{}');
    const password = String(body.password || '');
    const newPassword = body.newPassword ? String(body.newPassword) : '';
    const nextData = safeScheduleData(body.data || {});

    if (!password) return json(400, { error: '비밀번호를 입력하세요.' });
    if (newPassword && newPassword.length < 4) return json(400, { error: '새 비밀번호는 4자 이상이어야 합니다.' });

    const token = requireEnv('GITHUB_TOKEN');
    const owner = requireEnv('GITHUB_OWNER');
    const repo = requireEnv('GITHUB_REPO');
    const branch = process.env.GITHUB_BRANCH || DEFAULT_BRANCH;
    const filePath = process.env.SCHEDULE_PATH || DEFAULT_PATH;
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

    let currentSha = null;
    let currentPayload = { adminPasswordHash: DEFAULT_HASH, data: nextData };

    try {
      const current = await githubFetch(`${apiUrl}?ref=${encodeURIComponent(branch)}`, token);
      currentSha = current.sha;
      const decoded = Buffer.from(current.content || '', 'base64').toString('utf8');
      currentPayload = JSON.parse(decoded || '{}');
    } catch (err) {
      if (!String(err.message).includes('Not Found')) throw err;
    }

    const currentHash = currentPayload.adminPasswordHash || DEFAULT_HASH;
    if (sha256(password) !== currentHash) {
      return json(401, { error: '비밀번호가 틀렸습니다.' });
    }

    const nextPayload = {
      adminPasswordHash: newPassword ? sha256(newPassword) : currentHash,
      updatedAt: new Date().toISOString(),
      data: nextData
    };

    const content = Buffer.from(JSON.stringify(nextPayload, null, 2), 'utf8').toString('base64');
    const message = newPassword ? 'Update schedule and admin password' : 'Update schedule data';

    const putBody = { message, content, branch };
    if (currentSha) putBody.sha = currentSha;

    const saved = await githubFetch(apiUrl, token, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(putBody)
    });

    return json(200, { ok: true, commit: saved.commit?.sha || null, updatedAt: nextPayload.updatedAt });
  } catch (err) {
    return json(500, { error: err.message || '저장 중 오류가 발생했습니다.' });
  }
};
