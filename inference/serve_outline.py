# serve_outline.py — 외곽선 모듈 FastAPI 추론 서버 프로토타입
#
# 제품 구도 (조사 메모 + decisions/0004 D2 정합):
#   Spring Boot(단일 서버) --내부 HTTP--> 본 서버 (같은 호스트, 외부 비공개)
#   - 업로드 시 1회: POST /v1/images (등록+전처리) -> 자동 초안 items 반환
#   - 에디터 보정:   POST /v1/outline/tap | /box | /multitap  (이산 클릭 -> 왕복 1회)
#   - 묶음:          POST /v1/outline/group  (자동 초안 item 합집합 -> 느슨한 루프)
#   모든 좌표는 0~1 정규화 (W/H 무관). 출력 폴리곤 = 에디터 벡터 요소로 직결.
#
# 실행: .venv/bin/uvicorn serve_outline:app --port 8765
# 데모: curl -F file=@images/IMG_0621.jpg localhost:8765/v1/images  -> {job_id}
#       curl localhost:8765/v1/jobs/{job_id}                        -> 상태/결과
import os, asyncio, threading, time, uuid
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
import cv2
import numpy as np
from fastapi import FastAPI, UploadFile, HTTPException
from pydantic import BaseModel

from outline_module import Engine, PROC_MAX

app = FastAPI(title='triplog outline inference server')
# CORS: 기본 비활성 (제품 = 백엔드만 호출, 내부 비공개 포트). 로컬에서 브라우저로 직접
# 테스트할 때만 INFERENCE_DEV_CORS=1 로 전체 허용을 켠다.
if os.getenv('INFERENCE_DEV_CORS') == '1':
    from fastapi.middleware.cors import CORSMiddleware
    app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_methods=['*'], allow_headers=['*'])
# 모델 상주 + 워커 1 직렬화 (A3, 리뷰 P2-7):
#   - 모든 모델 연산은 단일 스레드 executor에서만 수행 -> 동시 추론 없음, 이벤트 루프 비블로킹
#   - register(무거움, 수 초)는 작업 큐: POST /v1/images -> 즉시 job_id -> GET /v1/jobs/{id}
#   - 보정(탭/박스, 인코딩 캐시로 수십~수백 ms)은 같은 executor를 await -> 응답은 동기적
eng = Engine()


class LruDict(OrderedDict):
    """크기 상한 LRU 맵. 상한 초과 시 가장 오래 안 쓴 항목부터 퇴출한다.
    워커 스레드(register 결과 기록)와 이벤트 루프(조회)가 함께 건드리므로 락으로 보호한다.
    - PoC 때 store/jobs 가 무제한이라 반복 업로드·장시간 가동에서 메모리 누적(OOM/DoS) 위험이 있었다(#70 리뷰 P1).
    - 퇴출된 image_id 로 tap/group(에디터, S3-LOG-06)을 호출하면 404('register first')가 난다.
      현재 에디터 미연결이고 상한(기본 64장)이 활성 세션엔 넉넉해 안전하다. 오래된 이미지면 재등록을 유도한다.
    - LOG-06에서 tap/group(`_get`)을 연결하면 `_get`의 'not in 확인→[] 접근' 사이 퇴출 레이스(KeyError)가
      도달 가능해진다(지금은 호출처 없어 도달 불가). 그때 EAFP(try/except KeyError→404) + Lock→RLock 로 닫는다.
      참고: `__contains__`를 비재진입 Lock으로 감싸면 `__setitem__`의 `key in self`에서 self-deadlock이니 금지."""

    def __init__(self, cap):
        super().__init__()
        self._cap = cap
        self._lock = threading.Lock()

    def __setitem__(self, key, value):
        with self._lock:
            if key in self:
                super().__delitem__(key)
            super().__setitem__(key, value)
            while len(self) > self._cap:
                super().__delitem__(next(iter(self)))    # 가장 오래된 항목 퇴출

    def __getitem__(self, key):
        with self._lock:
            value = super().__getitem__(key)
            self.move_to_end(key)                        # 최근 사용으로 표시
            return value


STORE_MAX = max(1, int(os.getenv('INFERENCE_STORE_MAX', '64')))   # 캐시 이미지 수(디코드=수 MB라 메모리 지배). 최소 1 — 0·음수면 퇴출 루프가 빈 dict에 next(iter)→StopIteration
JOBS_MAX = max(1, int(os.getenv('INFERENCE_JOBS_MAX', '256')))    # 보관 작업 레코드 수(작음). 최소 1
store = LruDict(STORE_MAX)          # image_id -> {img, items}  (상한 LRU — 위 클래스 주석)
jobs = LruDict(JOBS_MAX)            # job_id -> {status: queued|running|done|error, result, error}  (상한 LRU)
executor = ThreadPoolExecutor(max_workers=1)   # 워커 수 = 모델 복제 수 (DEPLOY_RESEARCH.md)
MAX_UPLOAD = int(os.getenv('INFERENCE_MAX_UPLOAD_MB', '25')) * 1024 * 1024


async def _run(fn):
    """모델 연산을 워커 스레드로 — 이벤트 루프는 그동안 다른 요청 응답."""
    return await asyncio.get_running_loop().run_in_executor(executor, fn)


def _decode(data: bytes):
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, 'file too large')
    img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if img is None:
        img = _decode_heif(data)          # HEIC/HEIF — cv2 가 못 푸는 아이폰 기본 포맷
    if img is None:
        raise HTTPException(400, 'invalid image')
    H, W = img.shape[:2]
    s = PROC_MAX / max(H, W)
    return cv2.resize(img, (int(W * s), int(H * s))) if s < 1 else img


def _decode_heif(data: bytes):
    """HEIC/HEIF 디코드(pillow-heif). cv2.imdecode 가 None 일 때만 시도. 실패 시 None(→400)."""
    try:
        import io
        from PIL import Image
        from pillow_heif import register_heif_opener
        register_heif_opener()            # PIL 에 HEIF 플러그인 등록(멱등)
        pil = Image.open(io.BytesIO(data)).convert('RGB')
        return cv2.cvtColor(np.asarray(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        return None


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


def _process_register(job_id, data):
    """워커 스레드 전용: 디코드 -> 자동 초안 -> 앵커 -> 캐시. 결과는 jobs[job_id]에."""
    j = jobs[job_id]
    j['status'] = 'running'
    t0 = time.time()
    try:
        img_s = _decode(data)
        items, meta = eng.candidates(img_s)
        items = eng.text_anchors(img_s, items)  # 계약(§1·§2-1): items에 anchors 포함
        image_id = uuid.uuid4().hex[:12]
        store[image_id] = {'img': img_s, 'items': items}
        Hs, Ws = img_s.shape[:2]
        j['result'] = {'image_id': image_id, 'elapsed_s': round(time.time() - t0, 1),
                       'meta': {k: v for k, v in meta.items() if k != 'dropped_boxes'},
                       'items': _items_json(items, Hs, Ws)}
        j['status'] = 'done'
    except HTTPException as e:
        j['status'], j['error'] = 'error', e.detail
    except Exception as e:                       # 워커가 죽으면 큐 전체가 멈춤 -> 전부 흡수
        j['status'], j['error'] = 'error', repr(e)


@app.post('/v1/images', status_code=202)
async def register(file: UploadFile):
    """업로드 등록: 즉시 job_id 반환. 전처리는 워커 큐에서 — GET /v1/jobs/{id}로 결과 수령."""
    data = await file.read()
    if len(data) > MAX_UPLOAD:
        raise HTTPException(413, 'file too large')
    job_id = uuid.uuid4().hex[:12]
    jobs[job_id] = {'status': 'queued', 'result': None, 'error': None}
    asyncio.get_running_loop().run_in_executor(executor, _process_register, job_id, data)
    return {'job_id': job_id, 'status': 'queued'}


@app.get('/v1/jobs/{job_id}')
def job_status(job_id: str):
    """작업 상태/결과. done -> result, error -> error 메시지."""
    if job_id not in jobs:
        raise HTTPException(404, 'unknown job_id')
    j = jobs[job_id]
    out = {'job_id': job_id, 'status': j['status']}
    if j['status'] == 'done':
        out['result'] = j['result']
    elif j['status'] == 'error':
        out['error'] = j['error']
    return out


class TapReq(BaseModel):
    image_id: str
    point: list[float]                  # [x, y] 0~1


class MultiTapReq(BaseModel):
    image_id: str
    points: list[list[float]]


class BoxReq(BaseModel):
    image_id: str
    box: list[float]                    # [x1, y1, x2, y2] 0~1


class RefineReq(BaseModel):
    image_id: str
    pos: list[list[float]]              # 포지티브 점들 [[x, y], ...] 0~1
    neg: list[list[float]] = []         # 네거티브 점들


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
async def tap(req: TapReq):
    """탭 = 단일 객체. 인코딩 캐시로 수십 ms — 같은 워커 큐 통과(직렬화)."""
    s = _get(req.image_id)
    r = await _run(lambda: eng.outline_at(s['img'], req.point))
    return _poly_response(s['img'], r, state=s, src='tap')


@app.post('/v1/outline/refine')
async def refine(req: RefineReq):
    """+/− 클릭 정제 (A8): 한 객체를 pos/neg 점 묶음으로 다듬기. 호출마다 전체 점 목록 전달."""
    s = _get(req.image_id)
    r = await _run(lambda: eng.outline_refine(s['img'], req.pos, req.neg))
    return _poly_response(s['img'], r, state=s, src='refine')


@app.post('/v1/outline/multitap')
async def multitap(req: MultiTapReq):
    """멀티탭 = 점들 합집합 한 묶음."""
    s = _get(req.image_id)
    r = await _run(lambda: eng.outline_multitap(s['img'], req.points))
    return _poly_response(s['img'], r, state=s, src='multitap')


@app.post('/v1/outline/box')
async def box(req: BoxReq):
    """박스 = 적응형 묶음 (단일 덩어리 or 잘게-따서-합치기)."""
    s = _get(req.image_id)
    r = await _run(lambda: eng.outline_box(s['img'], req.box))
    return _poly_response(s['img'], r, state=s, src='box')


@app.post('/v1/outline/group')
async def group(req: GroupReq):
    """자동 초안 item들의 합집합 -> 느슨한 외곽 루프. SAM 호출 없음."""
    s = _get(req.image_id)
    masks = [it['mask'] for it in s['items'] if it['id'] in req.item_ids]
    if not masks:
        raise HTTPException(400, 'no matching item_ids')
    r = await _run(lambda: eng.group(masks, req.margin, relax=req.relax))
    return _poly_response(s['img'], r, state=s, src='group')


@app.get('/health')
def health():
    return {'ok': True, 'images_cached': len(store)}
