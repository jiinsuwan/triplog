# test_spike.py — A5: 서버 계약 단위(모델 mock) + 실모델 스모크(마커 분리)
# 실행: .venv/bin/pytest -q              (mock 단위만 — pytest.ini가 model 마커 제외)
#       .venv/bin/pytest -q -m model     (실모델 스모크 — 가중치·images/ 필요)
import time
import numpy as np
import pytest


# ---------------- 단위: 서버 계약 (모델 mock — 가중치/추론 없음) ----------------

@pytest.fixture()
def client(monkeypatch):
    import serve_outline as so
    from fastapi.testclient import TestClient

    def fake_items(img_s):
        m = np.zeros(img_s.shape[:2], np.uint8)
        m[10:30, 10:30] = 255
        return [{'id': 0, 'label': 'subject', 'conf': 1.0, 'src': 'det', 'tightened': False,
                 'bbox_norm': [.1, .1, .5, .5], 'center_norm': [.3, .3], 'area_frac': .1,
                 'loops': [[[10., 10.], [30., 10.], [30., 30.], [10., 30.]]], 'mask': m}]

    meta = {'sal_mass': 0.1, 'fallback': False, 'dropped': 0, 'dropped_boxes': [],
            'carriers': [], 't_detect': 0.0, 't_sam': 0.0}
    monkeypatch.setattr(so.eng, 'candidates', lambda img: (fake_items(img), dict(meta)))
    monkeypatch.setattr(so.eng, 'text_anchors', lambda img, items, k=3: items)
    monkeypatch.setattr(so.eng, 'outline_at',
                        lambda img, pt: {'loops': [[[5., 5.], [9., 5.], [9., 9.]]],
                                         'mask': np.zeros(img.shape[:2], np.uint8)})
    monkeypatch.setattr(so.eng, 'outline_refine',
                        lambda img, pos, neg=(): {'loops': [[[4., 4.], [8., 4.], [8., 8.]]],
                                                  'mask': np.zeros(img.shape[:2], np.uint8)})
    so.store.clear()
    so.jobs.clear()
    return TestClient(so.app)


def _png_bytes():
    import cv2
    ok, buf = cv2.imencode('.png', np.full((80, 80, 3), 200, np.uint8))
    assert ok
    return buf.tobytes()


def _wait_done(client, job_id, tries=100):
    for _ in range(tries):
        st = client.get(f'/v1/jobs/{job_id}').json()
        if st['status'] in ('done', 'error'):
            return st
        time.sleep(0.05)
    raise AssertionError('job이 끝나지 않음')


def test_register_job_lifecycle_and_contract(client):
    r = client.post('/v1/images', files={'file': ('t.png', _png_bytes(), 'image/png')})
    assert r.status_code == 202
    job = r.json()
    assert job['job_id'] and job['status'] in ('queued', 'running')

    st = _wait_done(client, job['job_id'])
    assert st['status'] == 'done', st.get('error')
    res = st['result']
    assert set(res) >= {'image_id', 'items', 'meta', 'elapsed_s'}
    it = res['items'][0]
    assert set(it) >= {'id', 'label', 'polygons', 'bbox', 'center', 'anchors'}
    assert all(0 <= v <= 1 for poly in it['polygons'] for xy in poly for v in xy)  # 0~1 정규화

    # tap -> polygons + item 등록(이후 group에 섞을 수 있어야: 계약 §그룹 재호출)
    t = client.post('/v1/outline/tap', json={'image_id': res['image_id'], 'point': [0.5, 0.5]})
    assert t.status_code == 200
    tj = t.json()
    assert tj['polygons'] and isinstance(tj['item_id'], int)

    g = client.post('/v1/outline/group',
                    json={'image_id': res['image_id'], 'item_ids': [0, tj['item_id']]})
    assert g.status_code == 200 and g.json()['polygons']

    # refine (A8): pos/neg 점 묶음 -> polygons + item 등록
    rf = client.post('/v1/outline/refine',
                     json={'image_id': res['image_id'], 'pos': [[0.5, 0.5]], 'neg': [[0.2, 0.2]]})
    assert rf.status_code == 200 and rf.json()['polygons'] and isinstance(rf.json()['item_id'], int)


def test_unknown_ids_and_bad_upload(client):
    assert client.get('/v1/jobs/nope').status_code == 404
    assert client.post('/v1/outline/tap',
                       json={'image_id': 'nope', 'point': [0.5, 0.5]}).status_code == 404
    # 깨진 파일 -> job error로 수렴 (서버는 죽지 않음)
    r = client.post('/v1/images', files={'file': ('t.bin', b'not-an-image', 'application/octet-stream')})
    st = _wait_done(client, r.json()['job_id'])
    assert st['status'] == 'error' and 'invalid image' in st['error']


# ---------------- 실모델 스모크 (1본, 마커 분리) ----------------

@pytest.mark.model
def test_real_model_tap_smoke():
    import cv2
    from outline_module import Engine, PROC_MAX
    eng = Engine()
    img = cv2.imread('images/IMG_0989.jpg')
    assert img is not None, 'images/IMG_0989.jpg 없음'
    H, W = img.shape[:2]
    s = PROC_MAX / max(H, W)
    if s < 1:
        img = cv2.resize(img, (int(W * s), int(H * s)))
    assert eng.outline_at(img, (0.5, 0.34)), '탭 결과 없음'   # 1회차 = 인코딩 포함
    t0 = time.time()
    r = eng.outline_at(img, (0.5, 0.34))                      # 2회차 = 캐시 디코딩
    dt = time.time() - t0
    assert r and r['loops']
    Hs, Ws = img.shape[:2]
    assert all(0 <= x <= Ws and 0 <= y <= Hs for poly in r['loops'] for x, y in poly)
    assert dt < 0.5, f'캐시 탭 {dt:.2f}s — 인코딩 캐시 회귀 의심'
