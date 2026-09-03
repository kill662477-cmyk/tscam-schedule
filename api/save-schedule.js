/* 일정표 읽기/저장. Netlify Function(save-schedule)을 Vercel로 옮긴 것.
   저장은 GitHub contents API로 data/schedule.json을 커밋한다.

   환경변수: GITHUB_TOKEN, ADMIN_PASSWORD
             GITHUB_OWNER/GITHUB_REPO/GITHUB_BRANCH (기본값 있음) */
const crypto = require("crypto");

const {
  GITHUB_TOKEN,
  GITHUB_OWNER = "kill662477-cmyk",
  GITHUB_REPO = "tscam-schedule",
  GITHUB_BRANCH = "main",
  ADMIN_PASSWORD,
} = process.env;

const FILE_PATH = "data/schedule.json";
const sha256 = (t = "") => crypto.createHash("sha256").update(String(t)).digest("hex");

async function gh(path, method = "GET", body = null) {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      "User-Agent": "vercel-function",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, data: text ? JSON.parse(text) : {} };
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try { resolve(JSON.parse(raw || "{}")); } catch { resolve({}); }
    });
  });
}

const json = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(typeof payload === "string" ? payload : JSON.stringify(payload));
};

module.exports = async (req, res) => {
  try {
    if (!GITHUB_TOKEN) return json(res, 500, { error: "GITHUB_TOKEN 없음" });

    const filePath = `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${FILE_PATH}`;

    /* 읽기: index.html loadSchedule()에서 호출 */
    if (req.method === "GET") {
      const file = await gh(`${filePath}?ref=${GITHUB_BRANCH}`);
      if (file.status < 200 || file.status >= 300) {
        return json(res, file.status, { error: file.data.message || "GitHub read failed" });
      }
      return json(res, 200, Buffer.from(file.data.content, "base64").toString("utf8"));
    }

    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

    const body = await readBody(req);
    const password = String(body.password || "");
    const newPassword = String(body.newPassword || "").trim();
    const incoming = body.data;

    if (!incoming) return json(res, 400, { error: "저장할 데이터 없음" });
    if (ADMIN_PASSWORD && password !== ADMIN_PASSWORD) {
      return json(res, 401, { error: "비밀번호가 틀렸습니다" });
    }

    const file = await gh(`${filePath}?ref=${GITHUB_BRANCH}`);
    if (file.status < 200 || file.status >= 300) {
      return json(res, file.status, { error: file.data.message || "GitHub file read failed" });
    }

    let oldJson = {};
    try { oldJson = JSON.parse(Buffer.from(file.data.content, "base64").toString("utf8")); } catch {}

    const adminPasswordHash = newPassword
      ? sha256(newPassword)
      : oldJson.adminPasswordHash || sha256(ADMIN_PASSWORD || password || "");

    const updated = await gh(filePath, "PUT", {
      message: "Update schedule.json",
      content: Buffer.from(JSON.stringify({ adminPasswordHash, data: incoming }, null, 2), "utf8").toString("base64"),
      sha: file.data.sha,
      branch: GITHUB_BRANCH,
    });
    if (updated.status < 200 || updated.status >= 300) {
      return json(res, updated.status, { error: updated.data.message || "GitHub update failed" });
    }

    return json(res, 200, { ok: true, adminPasswordHash });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
};
