# inference — 윤곽선 추론 서버

사진에서 객체 윤곽선(폴리곤)과 텍스트 앵커를 계산하는 별도 프로세스.
Spring 백엔드가 같은 호스트에서 내부 HTTP로 호출한다(외부 비공개).
API 형식 정본 = `poc/card/OUTLINE_API.md`.

## 구성
- `serve_outline.py` — FastAPI 서버(요청 처리 + 작업 큐)
- `outline_module.py` — 윤곽선 계산 본체(YOLO-World 검출 → SAM2 세그)
- `requirements.txt` — 의존성
- `test_spike.py` / `pytest.ini` — 테스트

## 설치
Python 3.10+ 필요.

    python3 -m venv .venv
    .venv/bin/pip install -r requirements.txt

## 모델 가중치
`weights/` 폴더에 아래가 있어야 한다(git 미포함, 용량 큼):
- `yolov8s-worldv2.pt` (YOLO-World, 객체 검출)
- `sam2.1_b.pt` (SAM2, 세그멘테이션)
- `clip/` (YOLO-World 텍스트 인코더)

첫 실행 시 ultralytics가 자동 다운로드하거나, 기존 `poc/card/weights/`를 복사·링크해 쓴다.
rembg `u2net`(saliency)는 첫 실행 시 자동 다운로드.
상주 메모리(RSS)는 모델 로드 시 약 3.0~3.5GB.

## 실행

    .venv/bin/uvicorn serve_outline:app --port ${INFERENCE_PORT:-8765}

설정(환경변수):
- `INFERENCE_MAX_UPLOAD_MB` — 업로드 최대 크기 MB(기본 25)
- `INFERENCE_DEV_CORS=1` — 로컬에서 브라우저로 직접 테스트할 때만 CORS 허용(기본 꺼짐)

확인:

    curl localhost:8765/health

## 테스트

    .venv/bin/pytest              # mock 단위(가중치 불필요)
    .venv/bin/pytest -m model     # 실모델 스모크(가중치 필요)
