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

exports.handler = async function () {
  const owner = 'kill662477-cmyk';
  const repo = 'tscam-schedule';
  const path = 'data/schedule.json';
  const branch = 'main';

  const token = process.env.GITHUB_TOKEN;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'monstarz-schedule'
        }
      }
    );

    const json = await res.json();

    if (!res.ok) {
      return {
        statusCode: res.status,
        body: JSON.stringify({
          error: json.message || 'GitHub read failed'
        })
      };
    }

    const content = Buffer.from(json.content, 'base64').toString('utf8');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: content
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: err.message
      })
    };
  }
};
