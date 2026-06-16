# Decision 0006 — 카드 외곽선 모듈: 사이드카 운용 · 계약 · 에디터 보정 모델

- **상태**: Accepted (Sprint 2 회고 합의)
- **결정일**: 2026-06-12
- **출처**: 카드 PoC v4~v12 (`poc/card/`), [card-poc-v12-report](../poc/card-poc-v12-report.md), [`poc/card/DEPLOY_RESEARCH.md`](../../poc/card/DEPLOY_RESEARCH.md)
- **관련 문서**: [decisions/0004](0004-card-poc-result.md) — **D2(업로드 1회 로컬 전처리)의 실행 형태를 본 문서 D1이 구체화**, [`poc/card/OUTLINE_API.md`](../../poc/card/OUTLINE_API.md), 와이어프레임 v3([log-flow-proposal.html](../design/log-flow-proposal.html)), [sprint-2](../sprints/sprint-2.md)

---

## 배경

decisions/0004는 카드 = 사진 위 overlay(D1), Vision 역할 = 업로드 시 1회 로컬 전처리(D2)를 확정했지만, 세 가지가 미정이었다 — 1) 그 전처리가 **어떤 형태로 실행되는가**(Java 탑재? 별도 프로세스?), 2) 에디터·LLM이 전처리 결과와 **무엇을 주고받는가**(계약), 3) 에디터에서 보정이 **어떤 조작 모델로 노출되는가**.

Sprint 2에서 외곽선 PoC를 v4~v12로 이어 0004 D2의 단일 스크립트(`segment_all.py`, 현재는 정리됨)를 모듈(`outline_module.py` + `serve_outline.py`)로 발전시켰고, 운용 형태 조사(`DEPLOY_RESEARCH.md`)와 레퍼런스 5장 수렴 검증([card-poc-v12-report](../poc/card-poc-v12-report.md))을 마쳤다. Sprint 2 회고에서 아래를 합의한다.

## 결정

### D1. 외곽선 모듈 실행 형태 = Python 사이드카 (FastAPI)

- Spring Boot(비즈니스)와 분리해 같은 호스트에서 도는 **로컬 추론 보조 프로세스**. **Java 직접 탑재 아님, MSA 아님** — 도메인 분해가 아니라 0004 D2 "업로드 시 1회 로컬 전처리"의 실행 형태 구체화다.
- 에디터 보정(탭/박스)은 **서버 왕복으로 시작**(이산 클릭 UX, 왕복 1~1.5초 수용 범위). 브라우저 onnxruntime-web 디코드는 업그레이드 경로로만 확보(현 시점 도입 아님).

### D2. 모듈 계약 = `poc/card/OUTLINE_API.md`

핵심 입출력 요지 (정본은 OUTLINE_API.md):

- **좌표 = 0~1 정규화 폴리곤**(닫힌 루프, 한 항목이 루프 여러 개 가능). 선 스타일(굵기·점선·색)은 **계약에 없음** — 전부 에디터/렌더러 파라미터. 여백만 추출 시점 파라미터(`group.margin`).
- 업로드 전처리 `POST /v1/images` → `image_id` + `meta` + `items[]`(label/conf/src/bbox/center/area/polygons + 텍스트 앵커 `anchors`). LLM은 items 메타만으로(이미지 없이) 켜고 끄기·묶기·코멘트 위치를 판단.
- 보정 연산 `POST /v1/outline/{tap,multitap,box,group}` — 응답 공통 `{polygons, item_id}`. **모든 보정 결과도 item으로 등록**되어 "기존 그룹에 빠진 부분 추가"가 group 재호출 한 번으로 성립.

### D3. 에디터 보정 모델 = 탭 / 박스 / 그룹 버블 2종 / 톤다운 슬라이더 35%

와이어프레임 v3 + v12 평가의 합의안. 에디터가 노출하는 보정 조작은 다음으로 확정:

- **탭** — 사진을 점 클릭해 단일 객체 외곽선 추가 (멀티탭 = 합집합 한 묶음).
- **박스** — 드래그로 무리를 한 줄로 (적응형: 커버리지 미달 시 잘게-따서-합치기).
- **그룹 버블 2종** — `hull`(볼록: 떨어진 객체 묶음용) / `smooth`(오목 유지: 한 덩어리 대형 객체용) 토글.
- **무드 톤다운 슬라이더** — 기본값 **35%**, 범위 0~50%, 비파괴(canvas/CSS filter, 원본 픽셀 불변).

### D4. PoC 산출물 = Sprint 3 카드 이슈 분해의 입력

- **역할 경계 (0004 D3 유지 — PR #64 리뷰로 명문화)**: 좌표·앵커 **후보 산출 = 전부 코드(사이드카)**. LLM은 후보 중 **선택**(코멘트 대상 객체·anchors 인덱스·켜기/끄기·묶기)과 **짧은 문구 생성**만 담당한다 — LLM의 임의 좌표 생성 금지.

- v12 산출물(모듈 코드 · OUTLINE_API 계약 · [card-poc-v12-report](../poc/card-poc-v12-report.md) §7 한계·후속)을 S3 카드 이슈 분해의 입력으로 삼는다.
- **LLM 프롬프트 단계는 S3 분해 때 확정**한다 — [OUTLINE_API §2-1 "최초 1회 텍스트 배치 규칙"](../../poc/card/OUTLINE_API.md)(코멘트 대상 선별 3~6개 · `anchors[0]` 기본 채택 · 날짜=좌상단·마무리=하단 · 2줄 이내)이 그 기반이다.

## 근거

- **품질**: 레퍼런스 5장 5/5 수준 도달, 사진당 사람 클릭 0~3회, 탭 1.1초·group 0.02초(CPU) — [card-poc-v12-report §4](../poc/card-poc-v12-report.md).
- **운용(D1)**: SAM2 ONNX export는 커뮤니티 주도, YOLO-World 런타임 어휘 변경엔 CLIP 텍스트 인코더 Java 포팅 필요(기성 사례 없음) — 3모델 전·후처리 Java 재작성은 2인 프로젝트 공수가 아니다. Spring(비즈니스)/FastAPI(추론) 분리는 표준 관행. ([DEPLOY_RESEARCH §1·§2](../../poc/card/DEPLOY_RESEARCH.md))
- **톤다운 35%(D3)**: GPT 레퍼런스 5장 실측 — 균일 어둡힘이 아니라 밝은 영역 보존·어두운 영역 강압 톤커브, 중앙값 ≈ 감마 1.55 = 슬라이더 35%.
- **버블 2종(D3)**: hull 단독은 오목부를 직선으로 질러 옆 객체까지 품는 듯 보임(0998 불판) → smooth 병행이 필요.

## 영향

- **S3 이슈 분해**: 본 문서 + card-poc-v12-report §7(한계·후속)을 입력으로 카드 트랙 이슈를 나눈다. LLM 프롬프트 설계·에디터 구현(탭/박스/버블/슬라이더)·사이드카 도입이 후보.
- **배포 단위**: Spring Boot + 사이드카 프로세스 동시 기동(docker-compose 컨테이너 2개 또는 systemd 유닛 2개 수준 — 조사 메모 권고, 확정은 인프라 이슈에서).
- **자체 계측 필요**: 사이드카 상주 RSS(추정 2~4GB)·서버 디코드 지연 — 도입 시 #20(카드 실측, S3)과 함께 측정.
- **0004 정합**: 0004 D2가 참조하던 `segment_all.py`는 PR #61 정리로 본 모듈이 대체 — 0004에 경로 주석 반영.
