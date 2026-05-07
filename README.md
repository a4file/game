# Terminal DOS RPG

웹 기반 텍스트 RPG입니다. 브라우저에서 DOS 스타일 터미널 UI로 플레이하며, 관리자 시트 에디터로 콘텐츠를 편집할 수 있습니다.

## 구성

- `frontend/`: React + Zustand + xterm 터미널 UI
- `backend/`: Express API (콘텐츠/AI/에디터)

## Vercel 배포

리포지토리 **루트**를 Vercel 프로젝트 루트로 연결합니다. `vercel.json`이 빌드·정적 출력·API 라우트를 설정합니다.

- **빌드**: `npm run vercel-build` → 백엔드 `tsc` + `docs/mythic-archive`·`sheets.json`을 `backend/dist/vercel-bundle/`에 복사 → 프론트 `vite build`
- **API**: `api/[[...slug]].js` + `serverless-http`로 Express를 서버리스 함수에 탑재. 브라우저는 동일 출처 **`/api/...`** 로 호출합니다.
- **프론트**: 프로덕션에서 `VITE_API_BASE_URL`을 비우면 기본이 **`/api`** 입니다. 별도 API 도메인을 쓰려면 Vercel 환경 변수에 `VITE_API_BASE_URL=https://...` 를 넣으세요.

**Vercel 대시보드 → Environment Variables** (Production 등):

- `OPENROUTER_API_KEY`, `OPENROUTER_SITE_URL`, `OPENROUTER_MODEL`, `OPENROUTER_FALLBACK_MODELS` — AI 사용 시
- (선택) `CORS_ORIGIN` — API만 다른 도메인에 둘 때

**서버리스 제한**: `VERCEL=1`일 때 시트·바이블 저장은 **`/tmp`** 기반이라 **콜드 스타트마다 초기화**될 수 있습니다. 영구 저장이 필요하면 별도 DB·Blob·호스팅(Railway 등)으로 API를 분리하는 편이 좋습니다.

로컬에서 배포와 동일한 빌드를 시험하려면:

```bash
npm install
bash scripts/vercel-build.sh
```

## 실행

### backend

```bash
cd backend
npm install
npm run dev
```

기본 주소: `http://localhost:4000`

### frontend

```bash
cd frontend
npm install
npm run dev
```

기본 주소: `http://localhost:5173`

`.env` 예시:

```bash
VITE_API_BASE_URL=http://localhost:4000
```

## OpenRouter 설정

백엔드 환경변수:

```bash
OPENROUTER_API_KEY=sk-or-v1-your-key-here
OPENROUTER_SITE_URL=http://localhost:5173
OPENROUTER_MODEL=meta-llama/llama-3.1-8b-instruct:free
OPENROUTER_FALLBACK_MODELS=qwen/qwen-2.5-7b-instruct:free,mistralai/mistral-7b-instruct:free
```

`backend/.env` 파일을 사용하며, 기본 추천 무료 모델이 이미 설정되어 있습니다. 필요 시 `.env`에서 모델명을 바꾸면 즉시 반영됩니다.

키가 없거나 API 실패 시 룰 기반 폴백 문장을 반환합니다.

## 터미널 명령

- `help`
- `profile`
- `gacha 1 standard`
- `gacha 10 pickup`
- `battle`
- `adventure`
- `inventory`
- `equip`
- `levelup`
- `save`
- `load`
- `editor on`
- `editor off`

## 관리자 에디터

`editor on` 입력 시 우측 시트 에디터 활성화:

- 탭: `maps`, `characters`, `monsters`, `weapons`, `items`, `equipments`
- 인라인 셀 편집
- JSON export
- AI row 생성 / 셀 보조 suggestion

