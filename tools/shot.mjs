/* 일정표 페이지를 레포 파일 그대로 렌더해 전체 스크린샷을 남긴다.
   배포된 사이트를 찍지 않고 체크아웃을 직접 여는 이유:
   저장 커밋 직후 배포가 아직 안 끝났을 수 있어 옛 데이터가 찍힐 수 있다.
   index.html은 Netlify 함수 호출이 실패하면 ./data/schedule.json으로
   폴백하므로(로컬에서도 화면이 같다) 러너에서 그대로 렌더된다. */
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : d;
};
const OUT = path.resolve(ROOT, arg("out", "shot.png"));
const WIDTH = Number(arg("width", "1200"));
const SCALE = Number(arg("scale", "2"));   // 레티나 배율. 글자 선명도
const URL_OVERRIDE = arg("url", "");        // 지정하면 그 주소를 찍는다

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".woff2": "font/woff2", ".webp": "image/webp",
};

function findChrome() {
  const cands = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);
  const hit = cands.find((p) => existsSync(p));
  if (!hit) throw new Error("Chrome 실행파일을 찾지 못함 (CHROME_PATH 지정 가능)");
  return hit;
}

function serve(root) {
  return new Promise((res) => {
    const srv = createServer(async (req, rq) => {
      const rel = decodeURIComponent(req.url.split("?")[0]).replace(/^\/+/, "") || "index.html";
      const file = path.join(root, rel);
      if (!file.startsWith(root)) { rq.writeHead(403).end(); return; }
      try {
        const buf = await readFile(file);
        rq.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
        rq.end(buf);
      } catch { rq.writeHead(404).end(); }
    });
    srv.listen(0, "127.0.0.1", () => res({ srv, port: srv.address().port }));
  });
}

const { srv, port } = await serve(ROOT);
const target = URL_OVERRIDE || `http://127.0.0.1:${port}/index.html`;

const browser = await puppeteer.launch({
  executablePath: findChrome(),
  headless: true,
  args: ["--hide-scrollbars", "--mute-audio", "--no-sandbox"],
});
const page = await browser.newPage();
await page.setViewport({ width: WIDTH, height: 900, deviceScaleFactor: SCALE });

const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
await page.goto(target, { waitUntil: "networkidle2", timeout: 60000 });

/* 폰트가 로드되기 전에 찍으면 글자가 대체 폰트로 나온다. */
await page.evaluate(() => document.fonts.ready);

/* 데이터가 실제로 그려졌는지 확인. 빈 화면이 배포되는 사고를 막는다. */
const filled = await page.waitForFunction(
  () => document.body.innerText.replace(/\s/g, "").length > 200,
  { timeout: 20000 }
).then(() => true).catch(() => false);
if (!filled) { await browser.close(); srv.close(); throw new Error("페이지에 내용이 그려지지 않음"); }

await mkdir(path.dirname(OUT), { recursive: true });
await page.screenshot({ path: OUT, fullPage: true });

const dims = await page.evaluate(() => ({
  w: document.documentElement.scrollWidth,
  h: document.documentElement.scrollHeight,
}));
await browser.close();
srv.close();

console.log(JSON.stringify({
  target: URL_OVERRIDE || "레포 파일 직접 렌더",
  out: path.relative(ROOT, OUT),
  cssSize: dims, deviceScaleFactor: SCALE,
  pixels: `${dims.w * SCALE}x${dims.h * SCALE}`,
  kb: Math.round(statSync(OUT).size / 1024),
  pageErrors: errs.slice(0, 3),
}, null, 2));
