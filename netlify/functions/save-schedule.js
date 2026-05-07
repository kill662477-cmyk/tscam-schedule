const https = require('https');
const crypto = require('crypto');

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = 'main',
  ADMIN_PASSWORD
} = process.env;

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
          const parsed = raw ? JSON.parse(raw) : {};
          resolve({
            status: res.statusCode,
            data: parsed
          });
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(data);
    }

    req.end();
  });
}

exports.handler = async function(event) {

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({
        error: 'Method not allowed'
      })
    };
  }

  try {

    const body = JSON.parse(event.body || '{}');

    const password = body.password || '';
    const newPassword = body.newPassword || '';
    const data = body.data || {};

    if (!ADMIN_PASSWORD) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'ADMIN_PASSWORD 환경변수 없음'
        })
      };
    }

    if (password !== ADMIN_PASSWORD) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: '비밀번호가 틀렸습니다.'
        })
      };
    }

    const adminPasswordHash = sha256(newPassword || password);

    const finalJson = {
      adminPasswordHash,
      data
    };

    const filePath = 'data/schedule.json';

    const getFile = await githubRequest(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}?ref=${GITHUB_BRANCH}`
    );

    let sha = '';

    if (getFile.status === 200) {
      sha = getFile.data.sha;
    }

    const content = Buffer
      .from(JSON.stringify(finalJson, null, 2))
      .toString('base64');

    const commitResult = await githubRequest(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`,
      'PUT',
      {
        message: 'Update schedule.json',
        content,
        sha,
        branch: GITHUB_BRANCH
      }
    );

    if (commitResult.status !== 200 && commitResult.status !== 201) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'GitHub 저장 실패',
          detail: commitResult.data
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        adminPasswordHash
      })
    };

  } catch (error) {

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message || '서버 오류'
      })
    };

  }
};
