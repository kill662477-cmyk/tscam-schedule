const crypto = require("crypto");

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const path = "data/schedule.json";

    const body = req.body || {};
    const password = body.password || "";
    const nextData = body.data;

    if (sha256(password) !== sha256(process.env.ADMIN_PASSWORD || "1931")) {
      return res.status(401).json({ error: "비밀번호가 틀렸습니다." });
    }

    if (!token || !owner || !repo) {
      return res.status(500).json({ error: "GitHub 환경변수가 없습니다." });
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "monstarz-schedule"
    };

    const getRes = await fetch(apiUrl, { headers });

    if (!getRes.ok) {
      const text = await getRes.text();
      return res.status(500).json({ error: "schedule.json 읽기 실패: " + text });
    }

    const fileInfo = await getRes.json();

    const nextJson = {
      updatedAt: new Date().toISOString(),
      data: nextData
    };

    const content = Buffer.from(
      JSON.stringify(nextJson, null, 2),
      "utf8"
    ).toString("base64");

    const putRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: "Update schedule.json",
          content,
          sha: fileInfo.sha,
          branch
        })
      }
    );

    if (!putRes.ok) {
      const text = await putRes.text();
      return res.status(500).json({ error: "GitHub 저장 실패: " + text });
    }

    return res.status(200).json({ ok: true, updatedAt: nextJson.updatedAt });
  } catch (err) {
    return res.status(500).json({ error: err.message || "저장 실패" });
  }
};
