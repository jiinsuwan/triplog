# 카드 PoC v12 — 피사체 외곽선 모듈 최종 리포트

> **이 문서가 카드 "피사체 외곽선" PoC의 현행 정본이다.** v3 리포트([card-poc-v3-report.md](card-poc-v3-report.md))가 확정한 "사진 위 다꾸 overlay" 구조 위에서, overlay의 핵심 재료인 **외곽선 추출을 웹 에디터·LLM 판단 계층이 호출하는 모듈**로 완성한 결과를 기록한다. 원본 보고는 `poc/card/report-v12.html`(2026-06-12 작성, 로컬 HTML)이며 본 문서는 그 정식 이관본이다.

- **날짜**: 2026-06-12 (Sprint 2)
- **코드**: `poc/card/outline_module.py`(코어) · `poc/card/serve_outline.py`(FastAPI 사이드카)
- **계약**: [`poc/card/OUTLINE_API.md`](../../poc/card/OUTLINE_API.md) · 배포 조사: [`poc/card/DEPLOY_RESEARCH.md`](../../poc/card/DEPLOY_RESEARCH.md) · 연혁: [`poc/card/HISTORY.md`](../../poc/card/HISTORY.md)
- **관련 결정**: [decisions/0004](../decisions/0004-card-poc-result.md)(D1 overlay · D2 업로드 1회 로컬 전처리) → [decisions/0006](../decisions/0006-card-outline-module.md)(사이드카 운용 · 계약 · 에디터 보정 모델 확정)
- 이미지 경로는 이 문서 기준 상대(`../../poc/card/out/v12/...`, `../../poc/card/images/...`).
- ⚠️ 본 문서가 참조하는 사진은 전부 **개인 여행 사진**이다(`poc/card/images/` 원본·레퍼런스, `poc/card/out/v12/` 산출물). 외부 공유 시 이미지 처리(제외/동의)가 필요하다.

---

## 1. 목적·범위

**목표**: 컴퓨터비전만으로(이미지 생성/판단 LLM 없이) GPT 레퍼런스 수준의 피사체 외곽선을 따고, 이를 **웹 에디터와 LLM 판단 계층이 호출하는 모듈**로 정리한다.

제품 흐름 = 업로드 시 자동 초안 → 사람이 점(탭)·박스로 보정 → LLM이 문구·배치 판단 → 에디터에서 자유 편집.

- **범위 안**: 외곽선 추출 파이프라인(자동 초안), 보정 연산(탭/멀티탭/박스/그룹), 무드 톤다운 실측, 텍스트 앵커(문구 배치 후보), 운용 형태 조사.
- **범위 밖**: LLM 문구 프롬프트 설계(S3 이슈 분해 때 확정 — [decisions/0006 D4](../decisions/0006-card-outline-module.md)), 에디터 실구현(S3).

## 2. v1~v12 경과 요약

전체 연대기·기각 기록의 정본은 [`poc/card/HISTORY.md`](../../poc/card/HISTORY.md). 요지:

| 버전 | 내용 | 결론 |
|---|---|---|
| v1·v2 | 잡지형·카드형 레이아웃 — LLM이 카드 전체 JSON 생성 | 기각 — 레퍼런스의 정체는 "꾸며진 사진"([v3 리포트 §1](card-poc-v3-report.md)) |
| v3 | **사진 위 overlay 확정** — 풀블리드 + 흰 손글씨/외곽선/장식, canvas 합성(편집 가능) | 채택 — [decisions/0004](../decisions/0004-card-poc-result.md) D1~D5. 렌더·에디터 코어는 `poc/card/legacy-v3/`에 보존 |
| v4 | YOLO-World → SAM2 box → 정밀 윤곽(팽창 오프셋→contour→DP→Chaikin) | 파이프라인 골격으로 채택 |
| v5 | U²-Net saliency vs FastSAM everything | saliency 채택 / FastSAM 기각 |
| v6 | 하이브리드 게이트(conf + saliency + 폴백) | 12/12 — `detect()`의 R1~R3로 흡수 |
| v7 | 의미 단위 강제 병합 | 기각 — "운반대 강등" 아이디어만 계승 |
| v8·v8b | 사용자 박스 + GrabCut/모폴로지 브리지 | 기각 — 교훈 "크게 따지 말고 잘게 따서 합치기" |
| v9 | 박스 = 적응형(커버리지 게이트 + 3×3 점 격자 합집합) | `outline_box()`로 흡수 |
| v10 | 탭 = SAM 점 프롬프트 단일 객체 | `outline_at()`으로 흡수 (실측 1.1s/탭) |
| v11 | 멀티탭 합집합 + 여백 슬라이더 | `outline_multitap()` + margin 파라미터로 흡수 |
| v12 | **모듈화 + 레퍼런스 5장 수렴 루프** | 본 리포트 (§3~§4) |

v12에서 추가된 것: 운반대 강등 + 확대 재검출(SAHI식) + 내부 점-격자 구제, saliency 커버리지-갭 구제, 이중 포커스 자동 해소(마스크 포함형·bbox 포함형), group 버블 2종(hull/smooth), 텍스트 앵커, 무드 톤다운 실측, FastAPI 사이드카 + 보정 결과 item 등록.

## 3. v12 최종 구성

### 3-1. 모듈 구조

| 경로 | 역할 |
|---|---|
| `poc/card/outline_module.py` | 코어 — `candidates`(자동 초안+텍스트 앵커) / `outline_at`(탭) / `outline_multitap` / `outline_box` / `group`(hull·smooth 버블) |
| `poc/card/serve_outline.py` | FastAPI 사이드카 프로토타입 — `POST /v1/images`(업로드 1회 전처리), `POST /v1/outline/{tap,multitap,box,group}`, `GET /health` |
| `poc/card/OUTLINE_API.md` | JSON 계약 — 에디터·LLM 판단 계층 관점 (§6 요지) |
| `poc/card/DEPLOY_RESEARCH.md` | 운용 형태 조사 — Python 사이드카 권고 근거 |
| `poc/card/legacy-v3/` | v3 렌더/에디터 코어(`render-overlay.mjs` = 0004 D5 렌더 정본) |
| `poc/card/out/v12/` · `poc/card/images/` | v12 산출물 · 테스트 사진/레퍼런스 (개인 사진) |

### 3-2. 파이프라인 (CV-only)

```text
YOLO-World(여행 어휘, conf 0.15~) ─ R1 conf≥0.30 채택
                                  ─ R2 0.15~0.30 → U2-Net saliency 겹침 시 채택
중복 제거(IoU + 포함관계) → 운반대 강등(자식≥2 박스)
운반대 확대 재검출(SAHI식) + 운반대 내부 점-격자 구제(어휘 무관, 표면조각 기각)
saliency 커버리지-갭 구제(거대 주인공 미검출 구제)
→ SAM2.1-b (박스 프롬프트 + 타이트 박스 재프롬프트) → 마스크
→ CLOSE/OPEN(7) → 오프셋 팽창(0.6% min변) → findContours → DP(0.0018) → Chaikin×2 → poly_norm
```

### 3-3. 실행 방식

두 가지 — 1) **CLI**(모듈 직접, 산출물 = `out/v12/`의 이미지·JSON), 2) **FastAPI 사이드카**(제품과 같은 형태 — 업로드 1회 전처리 + 클릭 보정 API 왕복). 운용 형태는 Python 사이드카로 확정 — Java 직접 탑재 비권장(SAM2 ONNX 커뮤니티 의존·전후처리 재작성 공수), MSA 아님(로컬 추론 보조 프로세스). 근거 조사는 [`DEPLOY_RESEARCH.md`](../../poc/card/DEPLOY_RESEARCH.md), 결정은 [decisions/0006 D1](../decisions/0006-card-outline-module.md).

## 4. 품질 평가 (report-v12.html 요약)

핵심 지표:

| 지표 | 값 |
|---|---|
| 레퍼런스 수준 도달 | **5 / 5장** (탭 보정 포함) |
| 사진당 사람 클릭 수 | **0~3회** |
| 탭 1회 응답 (CPU) | **~1.1초** |
| 출력 | **100% 벡터** (레이어·굵기·점선 독립) |

### 4-1. 사진별 결과 — 자동 초안 + 점 피드백

핵심 확인: **물체 가운데 점 하나 찍는 단순 피드백**으로 자동 초안의 누락·오포커스가 클릭 단위로 교정된다.

| 사진 | 자동 초안 | 사람 조작 | 결과 | 비교 (좌 = 우리 / 우 = GPT ref) |
|---|---|---|---|---|
| 0621 카페 | 7개 전부 정상 (컵 5·아이스크림·냅킨 개별) | 없음 | 통과 | `../../poc/card/out/v12/auto_IMG_0621.jpg` ↔ `../../poc/card/images/ref_0621.png` |
| 0956 회 | 5개 — 접시/전 이중 포커스 자동 해소 | 없음 | 통과 | `../../poc/card/out/v12/merged_IMG_0956.jpg` ↔ `../../poc/card/images/ref_0956.png` |
| 0988 흑돼지 | 16개, 고기 2점 누락 | 탭 2 | 통과 (18개) | `../../poc/card/out/v12/merged_IMG_0988.jpg` ↔ `../../poc/card/images/ref_0988.png` |
| 0989 순대 | 11개, 뒷줄 우측 2점 문제 | 삭제 1 + 탭 2 | 통과 (순대 9/9) | `../../poc/card/out/v12/merged_IMG_0989.jpg` ↔ `../../poc/card/images/ref_0989.png` |
| 0998 불판 | 12개 | 멀티탭 + 그룹 1회 | 통과 (어두운 림 정밀 추종은 미해결) | `../../poc/card/out/v12/merged_IMG_0998.jpg` ↔ `../../poc/card/images/ref_0998.png` |

**그룹에 추가** — 모든 보정 결과(tap/multitap/box/group)는 item으로 등록되어 id를 돌려받는다. "기존 그룹이 한 모서리를 놓침" → 빠진 부분을 탭(id=k) → `group([그룹id, k])` 재호출로 합집합 버블 갱신. group은 SAM 호출이 없어 즉시(0.02초) 응답. 0998이 실제 사례. 버블은 2종 — **hull**(볼록: 떨어진 객체 묶음, 0621 컵들) / **smooth**(오목 유지: 한 덩어리 대형 객체, 0998 불판 — hull은 오목부를 직선으로 질러 옆 객체까지 품는 듯 보임).

### 4-2. 응답 시간 (CPU, M-시리즈 맥, 1280px)

| 구분 | 시간 | 비고 |
|---|---|---|
| 업로드 전처리 (자동 초안 + 텍스트 앵커) | 2~16초/장 | 운반대 격자 구제 없으면 2~4초, 있으면 9~16초. 업로드 직후 백그라운드 처리 전제라 UX 차단 없음 |
| 탭 보정 1회 | 1.1~1.2초 | 3회 실측 1.10/1.15/1.13초 |
| 그룹 (묶기/추가) | 0.02초 | SAM 호출 없음 — 마스크 합집합+윤곽 재추출 |
| 박스 보정 1회 | 1.5~10초 | 단일 덩어리 ~1.5초 / 점 격자 경로(무리) ~10초 |

개선 여지: 현재 ultralytics가 SAM 호출마다 이미지 인코딩을 재실행 — 업로드 시 인코딩 1회 캐시 구조로 바꾸면 탭·격자 모두 수백 ms급 단축 가능.

### 4-3. 무드 톤다운 (실측 기반)

GPT 레퍼런스 5장을 원본과 비교 실측한 결과, **균일하게 어둡히는 게 아니라 밝은 영역(주인공)은 살리고 어두운 영역을 깊게 누르는 톤커브**를 일관되게 사용한다 — 흰 손글씨 가독성을 만드는 처리.

| 사진 | 평균 휘도 비율 | 밝은 영역 (p90) | 어두운 영역 (p10) |
|---|---|---|---|
| 0621 | ×0.85 | ×0.90 | ×0.72 |
| 0956 | ×0.67 | ×0.81 | ×0.33 |
| 0988 | ×0.65 | ×0.85 | ×0.11 |
| 0989 | ×0.54 | ×0.60 | ×0.22 |
| 0998 | ×0.56 | ×0.77 | ×0.09 |

레퍼런스 중앙값 ≈ 감마 1.55 = **슬라이더 35%**. 단계 데모: `../../poc/card/out/v12/tonedown_demo.jpg`(0% / 20% / 35% / 50%). **에디터 반영**: 감마(또는 brightness+contrast) + 약한 채도 감소를 canvas/CSS filter로 — GPU 가속 실시간 슬라이더. 권장 기본값 35%, 범위 0~50%, 비파괴(원본 픽셀 불변).

### 4-4. 스트로크 — 선은 벡터, 굵기·점선은 렌더 파라미터

외곽선은 그려진 그림이 아니라 **0~1 정규화 폴리곤(JSON)**으로 저장된다. 같은 벡터를 렌더 파라미터만 바꿔 그린 데모: `../../poc/card/out/v12/stroke_1px.jpg` · `stroke_2px.jpg` · `stroke_4px.jpg` · `stroke_7px.jpg` · `stroke_4px-dashed.jpg`. item 하나 = 에디터 레이어 하나로 매핑되어 선별 켜기/끄기·굵기·점선·여백·z순서가 독립 조작된다(0004 D1 정합). 여백(객체-선 간격)만 추출 시점 파라미터(v11 검증: 1×/2.5×/4.5×).

### 4-5. 최종 결과물 — 전부 적용 (외곽선 + 톤다운 35%)

`../../poc/card/out/v12/final_IMG_0621.jpg` · `final_IMG_0956.jpg` · `final_IMG_0988.jpg` · `final_IMG_0998.jpg`, 그리고 텍스트 앵커까지 얹은 완성형 `../../poc/card/out/v12/final_text_IMG_0989.jpg`(외곽선·객체와 비겹침 보장 좌표에 문구 배치 — 최초 1회 배치 규칙은 [OUTLINE_API §2-1](../../poc/card/OUTLINE_API.md)).

## 5. 재현 방법

테스트 사진(`poc/card/images/`, 개인 사진)과 모델 가중치(`poc/card/weights/`, 합계 약 550MB)는 gitignore — 사진 보유 시에만 재현 가능, 가중치는 로컬 재생성(다운로드).

```bash
cd poc/card

# 환경 (최초 1회)
python3 -m venv .venv
.venv/bin/pip install ultralytics opencv-python rembg onnxruntime fastapi uvicorn python-multipart
export SSL_CERT_FILE=$(.venv/bin/python -c "import certifi; print(certifi.where())")   # CLIP 다운로드 SSL 대비

# 1) 자동 초안 + 진단 패널 + 앵커 시각화 → out/v12/auto_*.jpg·json, anchors_*.jpg
.venv/bin/python outline_module.py auto IMG_0621 IMG_0956 IMG_0988 IMG_0989 IMG_0998

# 2) 보정 연산 CLI — 좌표는 0~1 정규화. tap 외에 multitap / box / autogroup 모드 동일 형식
.venv/bin/python outline_module.py tap IMG_0989 0.5 0.34

# 3) FastAPI 사이드카 — POST /v1/images · POST /v1/outline/{tap,multitap,box,group} · GET /health
.venv/bin/uvicorn serve_outline:app --port 8765
```

v3 렌더/에디터 데모 재현은 [v3 리포트](card-poc-v3-report.md) 상단 참조(코드는 `poc/card/legacy-v3/`).

## 6. OUTLINE_API 계약 요지

정본은 [`poc/card/OUTLINE_API.md`](../../poc/card/OUTLINE_API.md). 소비자 둘 — 1) **웹 에디터**(1차 초안 표시 + 탭/박스 보정), 2) **LLM 판단 계층**(후보 중 선택·묶음, 코멘트/스티커 배치 — GMS 텍스트 LLM, 이미지 생성 아님).

- **좌표 규약**: 모든 좌표 0~1 정규화 `[x, y]`. 폴리곤 = 닫힌 루프, 한 항목이 루프 여러 개 가능. **선 스타일(굵기·점선·색)은 계약에 없음** — 렌더 파라미터. 여백만 추출 시점 파라미터(`group.margin`).
- **업로드 전처리**: `POST /v1/images` → `image_id` + `meta`(carriers 등) + `items[]`(id/label/conf/src/bbox/center/area/polygons + 텍스트 앵커 `anchors`). `src` = `det`/`det-weak`/`det-zoom`/`grid`/`sal` — `grid`/`sal`은 label 없음. LLM은 items의 label/center/area/bbox만으로(이미지 없이) 켜고 끄기·묶기·코멘트 위치를 판단할 수 있게 설계.
- **보정 연산** (이산 클릭 → 왕복 1회): `tap`(단일 객체) / `multitap`(합집합 한 묶음) / `box`(적응형 — 커버리지≥0.45 단일, 미달 시 3×3 격자 잘게-따서-합치기) / `group`(기존 item 합집합 버블, hull·smooth 2종, SAM 호출 없음). 응답 공통 `{polygons, item_id}` — **모든 보정 결과도 item으로 등록**.
- **텍스트 최초 배치 규칙(§2-1)**: 주인공·특이점 위주 3~6개 item에 코멘트, 기본 `anchors[0]` 채택(겹치면 `anchors[1..]` 회피), 가장자리 0.06 이내·코너 회피, **날짜+장소 = 좌상단 · 마무리 한 줄 = 우하단 고정**(레퍼런스 5장 공통 패턴), 문구는 2줄 이내(0004 D3).

## 7. 한계와 후속 (Sprint 3 입력)

한계 (정직):

1) 불판 림 포함 통째(0998)는 자동·박스 모두 실패 — **+/− 클릭 정제**가 후속 후보.
2) 격자 구제는 밀도를 올려도(5×5 실험) 얻는/잃는 조각이 교차 — 잔여 누락은 탭 보정 영역으로 확정.
3) 텍스트 앵커: 점 기준이라 텍스트 가로 폭 미고려(사각 적합 필요), 밝은 배경 위 흰 글씨 가독 가중 강화 필요 — 사용자 조정 가능이라 차단 아님.
4) 회귀 검증은 레퍼런스 5장 기준(기존 12장 세트 소실). 격자 구제·운반대 규칙은 이번 5장에서 조정됨 — 새 유형(인물·풍경·실내)에선 운반대 오판 가능성.
5) `grid`/`sal` 항목은 label이 없어 문구 생성 단계에서 저빈도 Vision 라벨링(0004 D2 허용 범위) 또는 사용자 입력 필요.
6) 모델 상주 RSS 2~4GB는 추정 — 도입 시 자체 계측 필요.

후속 (S3 이슈 분해의 입력 — [decisions/0006 D4](../decisions/0006-card-outline-module.md)):

1) GMS LLM 프롬프트 설계 (문구 생성 + 앵커 선택, OUTLINE_API §2-1 기반).
2) 에디터에 탭/박스/그룹 버블/톤다운 슬라이더 반영 (와이어프레임 v3 — log-flow-proposal, 폐기·docs/design/로 대체).
3) 사이드카 도입 시 SAM 인코딩 1회 캐시 구조 검토(탭 수백 ms급 단축 여지) + RSS·지연 자체 계측(#20 카드 실측과 함께).
