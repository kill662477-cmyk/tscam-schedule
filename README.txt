츠캄몬스타즈 일정표 Netlify Functions 운영용 패키지

로컬 테스트:
1) 이 폴더에서 CMD 열기
2) python -m http.server 5500
3) http://localhost:5500 접속

주의:
- 로컬에서는 저장 버튼이 Netlify Function이 없어서 실제 GitHub 저장은 안 됩니다.
- 화면 렌더/클릭/팝업/달력 확인용입니다.
- 실제 저장 테스트는 Netlify 배포 후 진행하세요.

Netlify 환경변수:
GITHUB_TOKEN
GITHUB_OWNER
GITHUB_REPO
GITHUB_BRANCH=main
ADMIN_PASSWORD=1234
