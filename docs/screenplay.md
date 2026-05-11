# 영화 시나리오(극본) 메타데이터와 텍스트 내보내기

이 문서는 **README와 별도로**, 게임 데이터에서 **할리우드식 시나리오 슬러그·지문·대사 큐·트랜지션**에 가까운 **플레인 텍스트**를 만들기 위해 추가된 기능만 정리합니다. 실제 PDF 조판(쿠리어 12pt, 여백, 페이지 번호 등)은 포함하지 않으며, **클립보드용 텍스트** 생성이 목표입니다.

---

## 1. 목적

- 스토리 비트 → 시퀀스 → 씬 구조에 **극본 전용 필드**를 붙여, 채워 두면 **한 덩어리 시나리오 초안**을 자동으로 이어 붙일 수 있게 합니다.
- 맵·캐릭터·몬스터에 **슬러그/큐 이름**을 두어, 씬에서 비워 둔 값은 시트 기본값으로 보완합니다.

---

## 2. 데이터 모델 (요약)

공통 타입 정의: 프론트 `frontend/src/rpg/types.ts`, 백엔드 `backend/src/types.ts` (개념 동일).

### 2.1 극본 표지·머리말 — `ScriptMeta` (`StorySheet.scriptMeta`)

| 필드 | 설명 |
|------|------|
| `scriptTitle` | 극본 제목 (비우면 스토리 `title` 사용) |
| `episodeTitle` | 에피소드/회차 제목 |
| `draftLabel` | 초안 라벨 등 |
| `writtenBy` | 작가 표기 (`Written by …` 줄) |
| `basedOn` | 원작 표기 (`Based on …` 줄) |
| `contact` | 연락처 한 줄 |
| `revisionNote` | 리비전 메모 |
| `pageNumberStart` | **씬 번호 자동 부여** 시 시작 번호 (씬에 `sceneNumber`가 없을 때) |

병합·기본값: `mergeScriptMeta` — `frontend/src/rpg/story/scriptMeta.ts`, `backend/src/editor/scriptMeta.ts`.

### 2.2 씬 — `StoryScene` (극본 관련 필드만)

| 필드 | 설명 |
|------|------|
| `sceneNumber` | 극본 씬 번호. **0이면** 내보내기 시 자동 연번 (`pageNumberStart`부터) |
| `intExt` | `INT` / `EXT` / `INT_EXT` (또는 빈 문자열 → 맵 기본값 → 최종 기본 `INT`) |
| `locationPrimary` | 슬러그 주 로케이션 (비우면 맵 `scriptLocationName` → 맵 `name`) |
| `locationSecondary` | 부 로케이션 (`PRIMARY--SECONDARY` 형태) |
| `timeOfDay` | 시간대 문자열 (비우면 맵 `scriptDefaultTimeOfDay` → 기본 `DAY`) |
| `sluglineOverride` | 있으면 **자동 슬러그 전부 무시**하고 이 한 줄만 사용 |
| `scriptBlocks` | 순서 있는 극본 블록 배열 (비어 있으면 `event`만 지문처럼 출력) |

### 2.3 블록 — `ScriptBlock`

| 필드 | 설명 |
|------|------|
| `id` | 고유 id |
| `type` | `action` \| `character` \| `parenthetical` \| `dialogue` \| `transition` \| `general` |
| `text` | 본문 (타입에 따라 괄호/대사/트랜지션 등으로 렌더) |
| `cueName` | `character`일 때 대사 위 큐 (대문자 처리) |
| `extension` | `V.O.`, `O.S.`, `CONT'D` 등 — `CHARACTER (extension)` 형태 |

정규화: `normalizeScriptBlocks` (같은 `scriptMeta` 모듈).

### 2.4 맵 — `MapStage` (극본 기본값)

| 필드 | 설명 |
|------|------|
| `scriptLocationName` | 씬 `locationPrimary`가 비었을 때 슬러그용 |
| `scriptDefaultIntExt` | 씬 `intExt`가 비었을 때 |
| `scriptDefaultTimeOfDay` | 씬 `timeOfDay`가 비었을 때 |

### 2.5 캐릭터 / 몬스터 — 대사 큐 이름

- `Character.screenplayCueName`, `Monster.screenplayCueName`  
- 내보내기 헬퍼: `screenplayCueForCharacter` / `screenplayCueForMonster` (`frontend/src/rpg/story/screenplayExport.ts`) — UI에서 블록에 자동 채우기까지는 선택 사항.

---

## 3. 슬러그라인 규칙

`buildSceneSlugline(scene, map, sceneNumber)` (`screenplayExport.ts`):

1. `sluglineOverride`가 있으면 그대로 사용.
2. 없으면 형식:  
   `{번호} {INT./EXT./INT./EXT.} {PRIMARY[--SECONDARY]}-{TIME}`  
   - `INT_EXT`는 라벨 `INT./EXT.`로 표기.
3. `PRIMARY`, `SECONDARY`, `TIME`은 출력 시 대문자화되는 경로가 있음 (코드 기준).

---

## 4. 전체 텍스트 내보내기 — `storyToScreenplayText`

`frontend/src/rpg/story/screenplayExport.ts`:

1. 표지/머리말 줄들 (`ScriptMeta` + 스토리 제목 폴백).
2. `FADE IN:`.
3. 비트 → 시퀀스 → 씬 순서로 평탄화.
4. 각 씬: 슬러그라인 + 빈 줄 + (`scriptBlocks` 렌더 또는 `event` 폴백).
5. 마지막 `FADE OUT.`  
6. 연속 빈 줄은 둘 이상으로 압축.

백엔드에는 동일한 “극본 텍스트 생성” 엔드포인트가 필수는 아니며, **프론트에서 클립보드**로 복사하는 흐름이 기준입니다.

---

## 5. 에디터에서 편집하는 위치

| 위치 | 내용 |
|------|------|
| 스토리 **개요** 탭 (`AdminEditorShell`) | **극본 메타** (`scriptMeta`), **극본 텍스트 클립보드 복사** |
| 스토리 비트 카드 (`StoryBeatCard`) | **극본 슬러그 & 블록**: 슬러그 필드, 미리보기, 블록 타입/큐/익스텐션/본문 |
| 캐릭터 프로필 (`CharacterProfileEditor`) | `screenplayCueName` |

몬스터·맵의 극본 필드는 **시스템 시트** 편집기 컬럼으로도 노출: `frontend/src/editor/sheets/schemas.ts` (`maps`, `characters`, `monsters` 컬럼 확장).

스타일: `frontend/src/index.css` (극본 필드셋, 슬러그 미리보기 등).

---

## 6. 저장·정규화 (백엔드)

- 스토리 시트 shape: `normalizeStorySheetShape`에서 `scriptMeta: mergeScriptMeta(story.scriptMeta)` — `backend/src/editor/beatsNormalize.ts` (프론트 `beatsNormalize.ts` 대응).
- JSON 로드 시 맵/캐릭터/몬스터의 극본 옵션 필드 유지: `backend/src/editor/store.ts` (맵 `scriptLocationName`, `scriptDefaultIntExt`, `scriptDefaultTimeOfDay`; 캐릭터·몬스터 `screenplayCueName`).
- 씬/비트 기본 placeholder: `storyFrameworkDefaults` (프론트·백엔드 각각).

---

## 7. 한계·향후

- **PDF**: 현재는 시나리오 **형식에 가까운 텍스트**만 생성. 표준 대본 PDF 조판은 별도 도구/라이브러리가 필요합니다.
- **FDX 등**: 동일하게 미구현; 구조는 `ScriptMeta` + `scriptBlocks`로 확장 가능합니다.
- 블록 편집기에서 `castCharacterId`로부터 `screenplayCueName`을 자동 제안하는 것은 선택적 개선입니다.

---

## 8. 관련 파일 빠른 목록

| 역할 | 경로 |
|------|------|
| 타입 (프론트) | `frontend/src/rpg/types.ts` |
| 메타/블록 정규화 (프론트) | `frontend/src/rpg/story/scriptMeta.ts` |
| 내보내기 | `frontend/src/rpg/story/screenplayExport.ts` |
| 씬 기본값 | `frontend/src/rpg/story/storyFrameworkDefaults.ts` |
| 시트 컬럼 | `frontend/src/editor/sheets/schemas.ts` |
| 타입 (백엔드) | `backend/src/types.ts` |
| 메타 (백엔드) | `backend/src/editor/scriptMeta.ts` |
| 스토어 정규화 | `backend/src/editor/store.ts` |
