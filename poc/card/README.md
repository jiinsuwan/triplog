# 카드 PoC — 외곽선 모듈 (v12, 정리됨)

사진 위 다꾸 overlay 카드의 **피사체 외곽선 CV 모듈** PoC. 자동 초안 + 사람 탭/박스 보정 + LLM 판단 계층이
소비하는 벡터(폴리곤) 출력. 전체 연혁은 [`HISTORY.md`](HISTORY.md), 최종 결과는 [`report-v12.html`](report-v12.html).

> 모델·구조 결정: [`docs/decisions/0004-card-poc-result.md`](../../docs/decisions/0004-card-poc-result.md) ·
> v3(overlay 확정) 리포트: [`docs/poc/card-poc-v3-report.md`](../../docs/poc/card-poc-v3-report.md)

## 구성

| 경로 | 역할 |
|---|---|
| `outline_module.py` | 코어 모듈 — `candidates`(자동 초안+텍스트 앵커) / `outline_at`(탭) / `outline_multitap` / `outline_box` / `group`(hull·smooth 버블) |
| `serve_outline.py` | FastAPI 사이드카 프로토타입 (업로드 1회 전처리 + 클릭 보정 API) |
| `OUTLINE_API.md` | JSON 계약 — 에디터·LLM 판단 계층 관점 (텍스트 최초 배치 규칙 포함) |
| `DEPLOY_RESEARCH.md` | 운용 형태 조사 (Java 비권장 / Python 사이드카 권고 / 브라우저 디코드 경로) |
| `report-v12.html` | 최종 보고서 (결과 5쌍·톤다운 실측·스트로크·완성형) — `out/v12`·`images` 상대 참조 |
| `HISTORY.md` | v1~v12 연대기 + 기각 기록 (반복 방지) |
| `legacy-v3/` | v3 렌더/에디터 코어 (`render-overlay.mjs` = D5 렌더 정본, 편집 데모) |
| `measure_caption.py` | GMS 문구 생성 실측 (#20, 키 확보 시 1회) |
| `out/v12/` · `out/v3/` | v12 결과(보고서 참조분) · v3 결과(v3 리포트/0004가 참조) |
| `images/` · `weights/` · `.venv/` | 테스트 사진(개인, gitignore) · 모델 가중치(gitignore) · 환경 |

## 실행

```bash
cd poc/card
# 환경 (최초 1회): python3 -m venv .venv && .venv/bin/pip install ultralytics opencv-python rembg onnxruntime fastapi uvicorn
export SSL_CERT_FILE=$(.venv/bin/python -c "import certifi; print(certifi.where())")   # CLIP 다운로드 SSL 대비

.venv/bin/python outline_module.py auto IMG_0621 ...          # 자동 초안 + 비교/앵커 산출
.venv/bin/python outline_module.py tap IMG_0989 0.5 0.34      # 탭(정규화 좌표)
.venv/bin/uvicorn serve_outline:app --port 8765               # 사이드카 (POST /v1/images, /v1/outline/*)
```

## 주의

- `images/`는 개인 사진 — 외부 공유 금지. `weights/`(가중치)·`.venv`는 로컬 재생성.
- 미해결 한계·다음 단계는 `report-v12.html` §6, 계약 세부는 `OUTLINE_API.md`.
