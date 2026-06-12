# serve_outline.py — 외곽선 모듈 FastAPI 사이드카 프로토타입
#
# 제품 구도 (조사 메모 + decisions/0004 D2 정합):
#   Spring Boot(단일 서버) --내부 HTTP--> 본 서버 (같은 호스트, 외부 비공개)
#   - 업로드 시 1회: POST /v1/images (등록+전처리) -> 자동 초안 items 반환
#   - 에디터 보정:   POST /v1/outline/tap | /box | /multitap  (이산 클릭 -> 왕복 1회)
#   - 묶음:          POST /v1/outline/group  (자동 초안 item 합집합 -> 느슨한 루프)
#   모든 좌표는 0~1 정규화 (W/H 무관). 출력 폴리곤 = 에디터 벡터 요소로 직결.
#
# 실행: .venv/bin/uvicorn serve_outline:app --port 8765
# 데모: curl -F file=@images/IMG_0621.jpg localhost:8765/v1/images
import time, uuid
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, HTTPException
from pydantic import BaseModel

from outline_module import Engine, PROC_MAX

app = FastAPI(title='triplog outline sidecar (PoC)')
# 모델 상주. 주의: PoC는 요청 직렬화가 없음(단일 사용자 전제) — register는 CPU 바운드라
# 처리 중 전체 응답이 막힌다. 제품은 워커 1 + 내부 큐 필요 (DEPLOY_RESEARCH.md 권고).
eng = Engine()
store = {}                         # image_id -> {img_s, items}  (PoC: 메모리 무제한, 제품: 디스크/캐시 + 퇴출)
MAX_UPLOAD = 25 * 1024 * 1024


def _decode(data: bytes):
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, 'file too large')
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        raise HTTPException(400, 'invalid image')
    H, W = img.shape[:2]
    s = PROC_MAX / max(H, W)
    return cv2.resize(img, (int(W * s), int(H * s))) if s < 1 else img


def _items_json(items, Hs, Ws):
    out = []
    for it in items:
        out.append({
            'id': it['id'], 'label': it['label'], 'conf': it['conf'], 'src': it['src'],
            'bbox': it['bbox_norm'], 'center': it['center_norm'], 'area': it['area_frac'],
            'polygons': [[[round(x / Ws, 4), round(y / Hs, 4)] for x, y in poly]
                         for poly in it['loops']],
            'anchors': it.get('anchors', []),
        })
    return out


@app.post('/v1/images')
async def register(file: UploadFile):
    """업로드 1회 전처리: 자동 초안 추출 + 캐시. 제품에선 업로드 파이프라인이 호출."""
    img_s = _decode(await file.read())
    t0 = time.time()
    items, meta = eng.candidates(img_s)
    items = eng.text_anchors(img_s, items)      # 계약(§1·§2-1): items에 anchors 포함
    image_id = uuid.uuid4().hex[:12]
    store[image_id] = {'img': img_s, 'items': items}
    Hs, Ws = img_s.shape[:2]
    return {'image_id': image_id, 'elapsed_s': round(time.time() - t0, 1),
            'meta': {k: v for k, v in meta.items() if k != 'dropped_boxes'},
            'items': _items_json(items, Hs, Ws)}


class TapReq(BaseModel):
    image_id: str
    point: list[float]                  # [x, y] 0~1


class MultiTapReq(BaseModel):
    image_id: str
    points: list[list[float]]


class BoxReq(BaseModel):
    image_id: str
    box: list[float]                    # [x1, y1, x2, y2] 0~1


class GroupReq(BaseModel):
    image_id: str
    item_ids: list[int]
    margin: float = 0.012               # 객체-선 간격 (min(H,W) 비율) -> 에디터 여백 슬라이더
    relax: str = 'hull'                 # 버블 모양: 'hull'(떨어진 묶음) | 'smooth'(한 덩어리 대형)


def _get(image_id):
    if image_id not in store:
        raise HTTPException(404, 'unknown image_id (register first)')
    return store[image_id]


def _poly_response(img_s, result, state=None, src='user'):
    if result is None or not result.get('loops'):
        return {'polygons': []}
    Hs, Ws = img_s.shape[:2]
    resp = {'polygons': [[[round(x / Ws, 4), round(y / Hs, 4)] for x, y in poly]
                         for poly in result['loops']],
            **({'cov': result['cov']} if 'cov' in result else {})}
    if state is not None:
        # 보정 결과도 item으로 등록 -> 이후 group(item_ids)에 섞을 수 있음
        # ("기존 그룹에 빠진 부분 추가" = 그 그룹 id + 새 탭 id 로 group 재호출)
        new_id = max((it['id'] for it in state['items']), default=-1) + 1
        state['items'].append({'id': new_id, 'label': src, 'conf': 1.0, 'src': src,
                               'mask': result['mask'], 'loops': result['loops']})
        resp['item_id'] = new_id
    return resp


@app.post('/v1/outline/tap')
def tap(req: TapReq):
    """탭 = 단일 객체. 에디터 클릭당 왕복 1회."""
    s = _get(req.image_id)
    return _poly_response(s['img'], eng.outline_at(s['img'], req.point), state=s, src='tap')


@app.post('/v1/outline/multitap')
def multitap(req: MultiTapReq):
    """멀티탭 = 점들 합집합 한 묶음."""
    s = _get(req.image_id)
    return _poly_response(s['img'], eng.outline_multitap(s['img'], req.points), state=s, src='multitap')


@app.post('/v1/outline/box')
def box(req: BoxReq):
    """박스 = 적응형 묶음 (단일 덩어리 or 잘게-따서-합치기)."""
    s = _get(req.image_id)
    return _poly_response(s['img'], eng.outline_box(s['img'], req.box), state=s, src='box')


@app.post('/v1/outline/group')
def group(req: GroupReq):
    """자동 초안 item들의 합집합 -> 느슨한 외곽 루프. SAM 호출 없음(즉시)."""
    s = _get(req.image_id)
    masks = [it['mask'] for it in s['items'] if it['id'] in req.item_ids]
    if not masks:
        raise HTTPException(400, 'no matching item_ids')
    return _poly_response(s['img'], eng.group(masks, req.margin, relax=req.relax),
                          state=s, src='group')


@app.get('/health')
def health():
    return {'ok': True, 'images_cached': len(store)}
