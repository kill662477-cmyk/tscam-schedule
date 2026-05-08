const https = require('https');
const crypto = require('crypto');

const {
  GITHUB_TOKEN,
  GITHUB_OWNER = 'kill662477-cmyk',
  GITHUB_REPO = 'tscam-schedule',
  GITHUB_BRANCH = 'main',
  ADMIN_PASSWORD
} = process.env;

const FILE_PATH = 'data/schedule.json';

function sha256(text = '') {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function githubRequest(path, method = 'GET', body = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;

    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'User-Agent': 'netlify-function',
        'Authorization': `Bearer ${GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json'
      }
    };

    if (data) {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }

    const req = https.request(options, (res) => {
      let raw = '';

      res.on('data', chunk => {
        raw += chunk;
      });

      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: raw ? JSON.parse(raw) : {}
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);

    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async function (event) {
  try {
    if (!GITHUB_TOKEN) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'GITHUB_TOKEN 없음' })
      };
    }

    const githubPath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}?ref=${GITHUB_BRANCH}`;

    // 읽기: index.html loadSchedule()에서 호출
    if (event.httpMethod === 'GET') {
      const fileRes = await githubRequest(githubPath, 'GET');

      if (fileRes.status < 200 || fileRes.status >= 300) {
        return {
          statusCode: fileRes.status,
          body: JSON.stringify({
            error: fileRes.data.message || 'GitHub read failed'
          })
        };
      }

      const content = Buffer.from(fileRes.data.content, 'base64').toString('utf8');

      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        },
        body: content
      };
    }

    // 저장: 기존 저장 버튼에서 호출
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const body = JSON.parse(event.body || '{}');
    const password = String(body.password || '');
    const newPassword = String(body.newPassword || '').trim();
    const incomingData = body.data;

    if (!incomingData) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: '저장할 데이터 없음' })
      };
    }

    if (ADMIN_PASSWORD && password !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: '비밀번호가 틀렸습니다' })
      };
    }

    const fileRes = await githubRequest(githubPath, 'GET');

    if (fileRes.status < 200 || fileRes.status >= 300) {
      return {
        statusCode: fileRes.status,
        body: JSON.stringify({
          error: fileRes.data.message || 'GitHub file read failed'
        })
      };
    }

    const oldJsonText = Buffer.from(fileRes.data.content, 'base64').toString('utf8');
    let oldJson = {};

    try {
      oldJson = JSON.parse(oldJsonText);
    } catch (_) {
      oldJson = {};
    }

    const admin
