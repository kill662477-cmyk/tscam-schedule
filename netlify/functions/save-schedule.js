const crypto = require("crypto");

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

exports.handler = async function(event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method Not Allowed" }) };
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const path = "data/schedule.json";

    if (!token || !owner || !repo) {
      return { statusCode: 500, body: JSON.stringify({ error: "Netlify 환경변수(GITHUB_TOKEN/OWNER/REPO)가 필요합니다." }) };
    }

    const body = JSON.parse(event.body || "{}");
    const password = body.password || "";
    const nextData = body.data;
    const newPassword = body.newPassword || "";

    if (!nextData || typeof nextData !== "object") {
      return { statusCode: 400, body: JSON.stringify({ error: "저장할 data가 없습니다." }) };
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const headers = {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "User-Agent": "tscam-schedule-netlify-function"
    };

    const getRes = await fetch(apiUrl, { headers });
    if (!getRes.ok) {
      const txt = await getRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: `GitHub 파일 읽기 실패: ${txt}` }) };
    }

    const fileInfo = await getRes.json();
    const currentText = Buffer.from(fileInfo.content || "", "base64").toString("utf8");
    let currentJson = {};
    try { currentJson = JSON.parse(currentText); } catch (_) {}

    const currentHash = currentJson.adminPasswordHash || sha256(process.env.ADMIN_PASSWORD || "1234");
    if (sha256(password) !== currentHash) {
      return { statusCode: 401, body: JSON.stringify({ error: "비밀번호가 틀렸습니다." }) };
    }

    const nextJson = {
      adminPasswordHash: newPassword ? sha256(newPassword) : currentHash,
      updatedAt: new Date().toISOString(),
      data: nextData
    };

    const content = Buffer.from(JSON.stringify(nextJson, null, 2), "utf8").toString("base64");

    const putRes = await fetch(`https://api.github.com/repos/${owner}/${repo}/contents/${path}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        message: "Update schedule.json",
        content,
        sha: fileInfo.sha,
        branch
      })
    });

    if (!putRes.ok) {
      const txt = await putRes.text();
      return { statusCode: 500, body: JSON.stringify({ error: `GitHub 저장 실패: ${txt}` }) };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, updatedAt: nextJson.updatedAt }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message || "저장 실패" }) };
  }
};
