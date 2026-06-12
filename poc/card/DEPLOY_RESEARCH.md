# 세그멘테이션 파이프라인 운용 형태 조사 메모 (2026-06-12, 로컬 미커밋)

> 조사 주체: 백그라운드 리서치 에이전트(웹 검색 기반). [확인] = 출처로 확인된 사실 / [추정] = 계산·판단.
> 결론 요약: **FastAPI 사이드카 본선 권고. Java 직접 탑재 비권장. 에디터 보정은 서버 왕복으로 시작.**

## 1) Java 직접 탑재 — 비권장

- [확인] ONNX Runtime Java 바인딩·DJL OnnxRuntime 엔진은 공식 지원.
  - https://onnxruntime.ai/docs/get-started/with-java.html
  - https://docs.djl.ai/master/engines/onnxruntime/onnxruntime-engine/index.html
- [확인] YOLOv8 ONNX 추론은 성숙하나 Java 공식 예제 없음(커뮤니티 구현·inference4j 등). letterbox/NMS 직접 작성 필요.
- [확인] SAM2 ONNX export는 Meta 공식이 아닌 커뮤니티 주도(vietanhdev/samexporter, HF 사전 변환 모델).
  - https://github.com/vietanhdev/samexporter
- [확인] Java에서 SAM2 사례는 DJL 예제(PyTorch 엔진+sam2-tiny+포인트만, 특정 버전 trace 종속) 등 제한적.
- [확인] YOLO-World는 worldv2만 export 지원, `set_classes()` 어휘가 export 시점에 모델에 내장(CLIP 제거됨).
  런타임 어휘 변경엔 CLIP 텍스트 인코더+토크나이저 Java 포팅 필요 — 기성 사례 못 찾음.
- [추정] 3모델 전·후처리 Java 재작성 + 커뮤니티 익스포터 버전 추적 + Python PoC와 동등성 검증 = 수 주 단위, 이중 유지보수. **2인 프로젝트 공수 아님.**

## 2) Python 사이드카 (FastAPI) — 본선 권고

- [확인] Spring Boot(비즈니스) / FastAPI(추론) 분리는 표준 관행 (Spring Cloud Sidecar, NVIDIA 블로그 등).
  - https://developer.nvidia.com/blog/building-a-machine-learning-microservice-with-fastapi/
- [확인] 가중치 합계 ≈ 550MB (YOLOv8s-worldv2 ~50MB + SAM2.1-b 324MB + u2net 176MB).
- [추정] CPU 추론 상주 RSS 2~4GB — 실측 공개 사례 없음, 도입 시 자체 계측 필요.
- [확인+추정] CLI(ProcessBuilder) 방식은 호출마다 콜드 스타트(인터프리터+torch+가중치 로드) 수~수십 초 → 상시 기능에 부적합.
- [추정] 배포 = docker-compose 컨테이너 2개(또는 systemd 유닛 2개), 내부 포트 통신. 워커 1 + 내부 큐 권장(워커 수 = 모델 복제 수).
- 아키텍처 정합: MSA(도메인 분해)가 아니라 **로컬 추론 보조 프로세스** — decisions/0004 D2("업로드 시 1회 로컬 전처리")의 실행 형태.

## 3) 브라우저 SAM 디코딩 — 업그레이드 경로로 확보

- [확인] SAM1 공식 웹 데모 = 서버 인코딩 1회 → 임베딩 전송 → onnxruntime-web 디코드(브라우저 CPU ~50ms).
- [확인] SAM2도 동일 하이브리드 구현 공개: Labelbox sam2-web, geronimi73/next-sam(WebGPU) 등. 전용 npm 패키지는 없음.
  - https://labelbox.com/blog/bringing-ai-to-the-browser-sam2-for-interactive-image-segmentation/
- [확인] SAM2 디코더 입력 = image_embed(1,256,64,64) + high_res_feats 2종 → fp32 약 16.8MB/이미지 (fp16 절반 [추정]). 디코더 ONNX 20.6MB(1회 캐시).
- [부분확인] 브라우저 디코드 속도 공식 수치 없음. [추정] 수십~수백 ms. WebGPU는 호환성 이슈 → WASM 폴백 전제.
- 권고: 우리 에디터 입력은 탭/박스(이산적) → **1단계 = 업로드 시 임베딩 캐시 + 클릭당 서버 디코드 API**(왕복 100~300ms 수용 가능).
  hover 프리뷰가 필요해지면 같은 임베딩을 브라우저로 내려 2단계 업그레이드.

## 종합

이 프로젝트(2인, Spring Boot 단일 서버 + Vue 3, 업로드 1회 전처리 + 에디터 보정)에는 사이드카가 최소 공수·표준 관행.
도입 시 자체 계측 필요 항목: 사이드카 RSS, 서버 디코드 지연.
