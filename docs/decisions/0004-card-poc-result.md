# Decision 0004 — 카드 PoC 결과 · 생성 구조 확정 · 모델 확정(Q6)

- **상태**: Accepted (카드 PoC 결과 반영)
- **결정일**: 2026-06-05
- **출처**: 카드 PoC v1~v3 (`poc/card/`), [card-poc-v3-report](../poc/card-poc-v3-report.md)
- **관련 문서**: [requirements Q6](../requirements.md), [architecture §6](../architecture.md), [card-poc.md](../poc/card-poc.md), [sprint-1](../sprints/sprint-1.md) — 이슈 #8 / #9
- **해소**: **Q6**(텍스트/Vision LLM 모델) — requirements의 마지막 미결 항목.

> **경로 주석 (2026-06-12, PR #61 정리 반영)**: 본문이 참조하는 v3 시점 경로는 다음으로 이동/대체되었다 — `segment_all.py` → **v12 모듈 `poc/card/outline_module.py`** (실행 형태 = Python 사이드카, [decisions/0006](0006-card-outline-module.md)) / `freespace.mjs`·`render-overlay.mjs` 등 v3 렌더·에디터 코어 → **`poc/card/legacy-v3/`**. 외곽선 PoC의 현행 정본 = [card-poc-v12-report](../poc/card-poc-v12-report.md). 결정 내용 자체는 유효하다.

---

## 배경

PoC 초기 가설(card-poc.md)은 **"Vision LLM이 bbox 추출 → 텍스트 LLM이 카드 전체 JSON 생성 → 프론트가 Canvas+rough.js로 합성"**이었다. 3회 반복(v1 잡지형 → v2 카드형 → v3 overlay) + 사용자 레퍼런스(GPT 이미지편집 결과, **동일 사진 IMG_9717**) 대조를 거쳐 다음을 확인했다.

1. **레퍼런스의 정체는 "카드"가 아니라 "꾸며진 사진"** — 원본 사진 풀블리드 위에 얇은 흰 손글씨 주석·점선 화살표·접시 외곽선·작은 장식을 얹은 overlay. (잡지형 큰 제목/갈색 배경/해시태그 패널은 과거 회고에서 이미 기각된 방향이며 v1·v2가 이를 반복.)
2. **LLM에 좌표·레이아웃까지 맡기면 비싸고 불안정** — 배치는 규칙/코드가 안정적이고 토큰이 0.
3. **GPT 이미지편집은 결과가 납작해 편집 불가** — 우리 canvas 합성은 주석이 객체로 남아 **드래그 편집 가능**(제품 차별점).

## 결정

### D1. 카드 생성 구조 = "사진 위 overlay (canvas 합성, 편집 가능)"
- 렌더 캔버스 = 원본 사진 풀블리드(사진 비율 그대로, crop 없음). 렌더엔 위/아래 별도 배경 영역 없음.
  최종 내보내기(#73)만 세로 9:16(1080×1920)으로 맞추며, 사진 비율이 다르면 위/아래를 블러(기본)/단색 패딩으로 채운다. (S3-LOG-04 갱신: 고정 1080×1920 캔버스 cover-fit 크롭이 객체·문구를 잘라내던 문제 해소)
- overlay 요소: 객체별 짧은 흰 손글씨 주석 + 곡선 점선 화살표 + 접시 외곽선 + 작은 장식 + 하단 마무리 한 줄.
- 가독성: 사진 약한 무드 톤다운 + 국소 소프트 음영(전역 어둡힘/불투명 패널 아님).

### D2. Vision 역할 = 업로드 시 1회 전처리 (per-card API 아님)
- **객체 외곽/위치** = SAM2 box-prompt 세그멘테이션(`segment_all.py`)을 **업로드 시 1회** 실행 → 접시 마스크 → radial(각도별 최외곽)+오프셋으로 깔끔한 외곽선 + 객체 앵커.
- **빈 공간/밝기** = 경량 CV(`freespace.mjs`, torch 불필요).
- → **카드 1장당 Vision API 호출 없음.** 의미 라벨(문구 소재)이 필요할 때만 저빈도 Vision/LLM.

### D3. 텍스트 LLM = 객체별 "짧은 문구"만
- 제목/노트/마무리 등 **짧은 문구만** 생성(`{objects:[{label,note}], closing}` 류 고정 스키마). **전체 카드 JSON 생성 폐기.**
- 출력 토큰이 작아(카드당 ~120~180 토큰) 비용이 구조적으로 trivial. 위치·화살표·외곽선·장식·가독성은 전부 코드.

### D4. Q6 모델 확정
- **텍스트 LLM = SSAFY GMS 소형 챗 모델 우선**(architecture §6 기본값 유지). 짧은 문구라 모델 민감도 낮음 → fallback(Anthropic/OpenAI/Google)은 필요 시 어댑터로 추가.
- **Vision LLM = per-card 채택 안 함.** 외곽/위치는 로컬 SAM2 + 경량 CV로 대체. `VisionAdapter`는 "로컬 세그 어댑터"로 충족 가능.
- **Vision·텍스트 단일 호출 통합 = 불요** (Vision이 로컬이라 합칠 LLM 호출이 없음).

### D5. 렌더 = Canvas2D 공용 코어
- `render-overlay.mjs`(브라우저·Node 공용). **Konva 미채택**(불필요 의존성). rough.js도 overlay에선 미사용.

## 근거 (PoC 측정·정성)
- v3 결과가 **동일 사진 GPT 편집 톤에 근접**(외곽선·문구 위치·무드 톤) + **편집 가능**. 비교: `poc/card/out/v3/match_9717_vs_gpt.png`, `compare_vs_reference.png`.
- 외곽선 정밀도: SAM2 box-prompt가 접시 5개를 잡고(작은 그릇 포함), radial+오프셋으로 음식 위를 피해 테이블에 깔끔히. (색-엣지/타원피팅은 노이즈/과적합으로 기각, `_archive`에 실험 보존.)
- H4(정성)·세로 배치 자연스러움: overlay가 세로/풀프레임에서 성립(단, **밝고 여백 있는 사진일수록 유리** — 흰 식탁보·밀집 사진은 자동배치가 약함 → D6).

## 비용·속도 (H5/H6) — 추정 기반 (라이브 실측은 후속 #20)
구조상 카드 1장 생성 = **짧은 문구 LLM 호출 1회**(위치·외곽선·장식은 코드, Vision은 로컬). 추정:
- 입력 ~150~250 tok(장소·분위기·객체 라벨), 출력 ~120~200 tok(객체별 노트 + 마무리).
- 비용: 소형 모델(gpt-4o-mini급) **~$0.0002/카드**, 중형(Haiku급) **~$0.001/카드** → 목표 **$0.03 대비 30~150배 여유**. **GMS(학생 무상)면 실질 $0.**
- 지연: 문구 호출 ~1~2s(<5s 목표). 세그멘테이션(SAM)은 **업로드 시 1회 전처리**(카드 생성 경로 아님).
- → **H5·H6: 추정 기반으로 목표 대비 여유 확인.** 라이브 실측은 후속 이슈 #20 — 키 확보 시 `poc/card/measure_caption.py` 1회로 확정.

## 폴백 / 한계 (정직)
- **D6. 자동초안 + 편집** — 밀집·저대비 사진은 자동 배치가 GPT만큼 빈틈을 못 찾음. **편집기(`editor-overlay.html`) 드래그 보정**으로 메운다(제품 흐름의 일부). card-poc.md §7 "수동 배치 모드" 폴백과 정합.
- 외곽선은 검출된 객체(접시·그릇)만 — 미검출 소품(컵·수저)은 외곽선 없음. 검출 확장 시 동일 방식 적용.

## requirements / architecture 갱신 메모 (후속 docs PR)
- requirements: **Q6 = Resolved**(D4) 반영. 카드 = overlay 구조(D1) 한 줄 추가.
- architecture §6: provider 1순위 = GMS **텍스트** 어댑터. `VisionAdapter`는 **로컬 SAM2 세그 어댑터**로 둘 수 있음(상용 Vision API 미사용). Konva 미채택 명시.
