const crypto = require("crypto");

function sha256(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
}

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: "Method Not Allowed" }),
    };
  }

  try {
    const token = process.env.GITHUB_TOKEN;
    const owner = process.env.GITHUB_OWNER;
    const repo = process.env.GITHUB_REPO;
    const branch = process.env.GITHUB_BRANCH || "main";
    const path = "data/schedule.json";

    const body = JSON.parse(event.body || "{}");
    const password = body.password || "";
    const nextData = body.data;
    const newPassword = body.newPassword || "";

    if (!nextData || typeof nextData !== "object") {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "저장할 data가 없습니다." }),
      };
    }

    /**
     * 1차 비밀번호 검사
     * 
     * ADMIN_PASSWORD_HASH가 있으면 그걸 우선 사용
     * 없으면 ADMIN_PASSWORD를 sha256 처리해서 비교
     * 둘 다 없으면 기존 기본값 1234 사용
     *
     * 여기서 먼저 막히면 GitHub API 요청 자체가 발생하지 않음.
     */
    const envPasswordHash =
      process.env.ADMIN_PASSWORD_HASH ||
      sha256(process.env.ADMIN_PASSWORD || "1234");

    if (sha256(password) !== envPasswordHash) {
      return {
        statusCode: 401,
        body: JSON.stringify({ error: "비밀번호가 틀렸습니다." }),
      };
    }

    if (!token || !owner || !repo) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: "Netlify 환경변수(GITHUB_TOKEN/OWNER/REPO)가 필요합니다.",
        }),
      };
    }

    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${branch}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "tscam-schedule-netlify-function",
    };

    /**
     * 비밀번호가 맞을 때만 여기부터 GitHub 요청 발생
     */
    const getRes = await fetch(apiUrl, { headers });

    if (!getRes.ok) {
      const txt = await getRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `GitHub 파일 읽기 실패: ${txt}` }),
      };
    }

    const fileInfo = await getRes.json();
    const currentText = Buffer.from(fileInfo.content || "", "base64").toString(
      "utf8"
    );

    let currentJson = {};
    try {
      currentJson = JSON.parse(currentText);
    } catch (_) {}

    /**
     * 기존 schedule.json 안에 저장된 해시가 있으면 유지.
     * 다만 1차 검사는 이미 환경변수 기준으로 통과한 상태.
     */
    const currentHash =
      currentJson.adminPasswordHash ||
      process.env.ADMIN_PASSWORD_HASH ||
      sha256(process.env.ADMIN_PASSWORD || "1234");

    const nextHash = newPassword ? sha256(newPassword) : currentHash;

    const nextJson = {
      adminPasswordHash: nextHash,
      updatedAt: new Date().toISOString(),
      data: nextData,
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
          branch,
        }),
      }
    );

    if (!putRes.ok) {
      const txt = await putRes.text();
      return {
        statusCode: 500,
        body: JSON.stringify({ error: `GitHub 저장 실패: ${txt}` }),
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, updatedAt: nextJson.updatedAt }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message || "저장 실패" }),
    };
  }
};