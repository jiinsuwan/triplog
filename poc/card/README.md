# 카드 PoC — 사진 위 다꾸 overlay (v3, 최종)

원본 사진을 풀블리드로 깔고 그 위에 **얇은 흰 손글씨 주석 + 곡선 점선 화살표 + 접시 외곽선 + 작은 장식**을
canvas로 합성한다. GPT 이미지편집 결과와 달리 **요소가 객체(노트/외곽선/화살표)로 남아 편집 가능**한 게 핵심.

> 결과/판단 근거: [`docs/poc/card-poc-v3-report.md`](../../docs/poc/card-poc-v3-report.md)
> 모델·구조 결정: [`docs/decisions/0004-card-poc-result.md`](../../docs/decisions/0004-card-poc-result.md)

## 파이프라인
```
사진 ─(SAM2 box-prompt: segment_all.py)→ 접시 마스크 segments_*.json
사진 ─(경량 CV: freespace.mjs)→ 점유맵/밝기
        │
overlay-data.mjs (객체 앵커 + 짧은 문구)  ─┐
overlay-prep.mjs (사진→캔버스 좌표 + 마스크 매칭) ─┤
        ▼
overlay-place.mjs (코드 배치: 빈공간 회피·화살표·외곽선·장식)
        ▼
render-overlay.mjs (흰 펜·radial 외곽선·점선 mix·국소 음영)
        ▼
overlay-exp.mjs (양산) / editor-overlay.html (드래그 편집)
```

## 파일
| 파일 | 역할 |
|---|---|
| `render-overlay.mjs` | overlay 렌더 코어 (DOM/Node 공용) |
| `overlay-place.mjs` | 코드/규칙 기반 배치 엔진 |
| `overlay-prep.mjs` | 사진→1080×1920(or 풀프레임) 좌표 변환 + 마스크 nearest 매칭 |
| `overlay-data.mjs` | 사진별 객체 앵커 + 큐레이션 문구 |
| `overlay-exp.mjs` | 시안 양산 + 레퍼런스 비교 |
| `freespace.mjs` | 경량 CV 점유맵/밝기 |
| `editor-overlay.html` | 브라우저 편집기 (주석 드래그 이동·추가·문구 편집·외곽선 토글·PNG) |
| `segment_all.py` | SAM2 box-prompt 세그멘테이션 → 접시 외곽 폴리곤 |
| `_archive/` | v1(잡지형)·v2(카드형)·실험(color-edge/ellipse) 보존 |

## 실행
```bash
# 시안 양산 (Node)
node overlay-exp.mjs            # → out/v3/*_overlay.png, compare_vs_reference.png

# 편집기 (정적 서버 필요)
python3 -m http.server 8000     # → localhost:8000/editor-overlay.html

# 외곽선 재추출 (SAM2, 최초 1회 .venv 필요)
python3 -m venv .venv && .venv/bin/pip install ultralytics "numpy<2"
.venv/bin/python segment_all.py IMG_9717
```

## 주의
- `.venv`(1.2GB)·SAM 가중치(`*.pt`, 600MB+)는 gitignore. 로컬 재생성.
- `segments_*.json`(접시 외곽)은 추적 → 외곽선 재현 보장. `foodmask`·`_legacy`는 미추적.
- 외곽선은 **SAM 마스크 → radial(각도별 최외곽) → 접시 밖 오프셋 → 실선/점선 mix**. 색-엣지/타원피팅은 `_archive/code`에 실험 보존.
