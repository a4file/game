# Terminal DOS RPG

브라우저 기반 DOS 스타일 텍스트 RPG입니다.  
플레이어는 터미널 명령으로 게임을 진행하고, 에디터에서 **STORY 중심 시트**를 직접 관리할 수 있습니다.

이 프로젝트는 "플레이어가 감독처럼 한 편의 이야기를 만든다"는 목표로, 스토리 데이터를 다음 계층으로 구성합니다.

- `STORY`
- `theme`, `world`, `characters`, `monsters`, `systems`
- `beats` (권장 12비트)
- `sequences`
- `scenes`
- `dramaticBeats`

---

## 1) 프로젝트 구성

- `frontend/`: React + Vite + Zustand + xterm 기반 게임/에디터 UI
- `backend/`: Express API (콘텐츠 번들, 에디터 저장, AI 보조)
- `backend/data/sheets.json`: 기본 시트 데이터 소스
- `docs/mythic-archive/`: World Bible 마크다운 문서
- `api/[[...slug]].js`: Vercel 서버리스 진입점

---

## 2) STORY 메인 데이터 구조

현재 시트 번들의 핵심은 `stories`입니다.

```json
{
  "stories": [
    {
      "id": "story-001",
      "title": "STORY1 ...",
      "theme": "...",
      "world": "...",
      "characters": ["c-001", "c-002"],
      "monsters": ["m-001"],
      "systems": ["..."],
      "beats": [
        {
          "id": "beat-01",
          "title": "세팅",
          "sequences": [
            {
              "id": "sequence-01-01",
              "title": "...",
              "scenes": [
                {
                  "id": "scene-01-01-01",
                  "title": "...",
                  "event": "...",
                  "dramaticBeats": ["...", "...", "..."]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

### 호환성 규칙 (중요)

- 런타임은 여전히 `storyBranches` 기반 스토리 명령(`story`, `story choose`)을 사용합니다.
- 대신 프론트/백엔드 정규화 단계에서 **`stories -> storyBranches`를 자동 파생**합니다.
- 즉, 운영 관리는 `stories`를 메인으로 하고, 게임 엔진 호환은 내부 파생으로 유지합니다.

---

## 3) 현재 기본 시드 데이터

`backend/data/sheets.json`은 더미 대량 데이터 대신 STORY 중심 샘플로 교체되어 있습니다.

- `STORY1 봉인 서고`: 12비트 구성 완료
- `STORY2 잿빛 항로`: 12비트 구성 완료
- `storyBranches`: 빈 배열 (정규화 시 `stories`에서 자동 생성)

---

## 4) 로컬 실행

### 4.1 백엔드

```bash
cd backend
npm install
npm run dev
```

- 기본 주소: `http://localhost:4000`
- 상태 확인: `GET /health`

### 4.2 프론트엔드

```bash
cd frontend
npm install
npm run dev
```

- 기본 주소: `http://localhost:5173`

프론트 `.env` 예시:

```bash
VITE_API_BASE_URL=http://localhost:4000
```

지정하지 않으면 기본적으로 `/api`를 사용합니다.

---

## 5) 빌드

### 프론트

```bash
cd frontend
npm run build
```

실행 내용:

- `tsc -b`
- `copy:sheets-fallback`
- `copy:mythic`
- `vite build`

### 백엔드

```bash
cd backend
npm run build
```

---

## 6) Vercel 배포 가이드

## 핵심 주의사항

**Root Directory는 반드시 리포지토리 루트(`.`)** 로 설정하세요.  
`frontend/`만 루트로 잡으면 `api/` 서버리스와 루트 빌드 스크립트가 빠져 API가 동작하지 않습니다.

### 배포 빌드 흐름

- `npm run vercel-build`
- 백엔드 `tsc`
- `docs/mythic-archive`, `sheets.json`을 `backend/dist/vercel-bundle/`로 복사
- 프론트 `vite build`

### API 경로

- 기본 베이스: `/api`
- 예시:
  - `GET /api/health`
  - `GET /api/content/bundle`
  - `GET /api/editor/sheets`

### 저장소 특성 (DB 관련)

이 프로젝트는 기본적으로 RDB(Postgres 등)와 직접 연결되지 않습니다.

- 로컬: `backend/data/sheets.json`, `docs/mythic-archive/*.md` 파일 기반
- Vercel: `VERCEL=1` 환경에서 `/tmp` 저장(비영속)

즉, Vercel 서버리스에서는 콜드 스타트/스케일 시 저장값이 유실될 수 있습니다.

영속 저장이 필요하면:

- Vercel KV / Postgres(Neon) / Blob
- Supabase
- 혹은 API 서버 별도 호스팅(Railway 등)

중 하나를 연동하세요.

### 권장 환경 변수

- `OPENROUTER_API_KEY`
- `OPENROUTER_SITE_URL`
- `OPENROUTER_MODEL`
- `OPENROUTER_FALLBACK_MODELS`
- (선택) `CORS_ORIGIN`

배포 동일성 테스트:

```bash
npm install
bash scripts/vercel-build.sh
```

---

## 7) 에디터 사용법 (Admin Sheet Editor)

게임에서 `editor on` 명령으로 에디터를 엽니다.

### 주요 탭

- `stories` (메인)
- `maps`
- `characters`
- `monsters`
- `storyBranches` (호환/검증용)
- `skills`
- `weapons`
- `items`
- `equipments`
- `bible`

### stories 편집 포인트

- `characters`, `monsters`, `systems`: 줄바꿈/쉼표 기반 배열 입력
- `beats`: JSON 편집
- 권장: 12비트 구조를 기준으로 `beat -> sequence -> scene` 설계

### 제공 기능

- 행 추가/복제/삭제
- JSON export
- 백엔드 reload/save
- AI row 생성 / 셀 보조 제안

---

## 8) 터미널 명령 (플레이)

대표 명령:

- `help`
- `/start`
- `story`
- `story choose A|B|C`
- `profile`
- `inventory`
- `battle`
- `adventure`
- `book shop`
- `book buy random`
- `save`
- `load`
- `reload-bundle`
- `diag`
- `editor on`
- `editor off`

---

## 9) 스토리 이벤트 시스템 요약

이벤트 타입:

- `battle`
- `adventure`
- `companion`
- `merchant`
- `town`
- `fishing`
- `maze`
- `trap`
- `treasure`

### story choose 밸런스 개요

- 성공 보상: `eventTier(common/rare/legend)` 기반 gem + 타입별 추가 보상
- 실패 페널티: `eventTier` 기반 gem 손실 + 타입별 추가 페널티
- 동일 타입 연속 성공 시 콤보 보너스 플래그/추가 보상 적용

### 챕터 구간 배수

- `early (1~20)`: 기본 배수
- `mid (21~45)`: 보상/페널티 증가
- `late (46+)`: 고리스크·고보상 강화

---

## 10) 네트워크/폴백 동작

번들 로드 순서:

1. API `/content/bundle` 시도
2. 실패 시 `public/sheets-fallback.json` 시도

Bible 로드 순서:

1. API `/editor/bible` 시도
2. 실패 시 `public/bible-manifest.json` + `public/mythic-archive/*.md` 폴백

즉, API 장애 시에도 읽기 중심 플레이/문서 확인이 가능한 구조입니다.

---

## 11) 자주 발생하는 이슈

### Q1. `npm run build` 실패

- 루트에서 `build` 스크립트가 없을 수 있습니다.
- `frontend` 또는 `backend` 디렉터리에서 각각 실행하세요.

### Q2. `bundle not loaded`

- 터미널에서 `diag`, `reload-bundle` 실행
- `/api` 라우팅/배포 Root Directory 확인
- API 실패 시 폴백 파일 존재 여부 확인

### Q3. 에디터 저장이 되지 않음

- Vercel 서버리스에서는 `/tmp` 비영속 저장
- 재기동 시 초기화 가능
- 영구 저장이 필요하면 외부 DB/스토리지 연동 필요

---

## 12) 개발 팁

- STORY를 추가할 때는 `stories`에만 입력하고, `storyBranches` 수동 편집은 최소화하세요.
- 씬 단위 텍스트(`event`)와 `dramaticBeats`를 함께 작성하면 플레이 체감이 안정적입니다.
- 12비트 템플릿을 복제해 `STORY3 ~ STORY99`를 확장하면 운영이 쉽습니다.

---

## 13) Git 원격 초기 연결

```bash
cd /path/to/game
git remote add origin https://github.com/<사용자>/<저장소>.git
git branch -M main
git push -u origin main
```

GitHub CLI 사용:

```bash
gh auth login
gh repo create <저장소이름> --private --source=. --remote=origin --push
```

