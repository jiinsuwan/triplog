# segment_all.py — Vision 검출 bbox를 SAM2 box-prompt로 줘서 각 접시/그릇/잔의 정밀 외곽 마스크 추출
#   기존 segment_food.py 개선: 면적 임계 완화(작은 그릇 유지) + 비음식 SKIP 확장 + 폴리곤 저장
#   사용: .venv/bin/python segment_all.py IMG_9717
import sys, json
import cv2
import numpy as np
from ultralytics import SAM

name = sys.argv[1] if len(sys.argv) > 1 else 'IMG_9717'
img_path = f'images/{name}.jpg'
img = cv2.imread(img_path)
H, W = img.shape[:2]

SKIP = ['사람', '손', '폰', '스마트폰', '하늘', '건물', '산', '기마상', '받침대', '동상', '기단',
        '인물', '테이블', '식탁', '배경', '벽', '바닥', '의자', '냅킨', '수저', '포크', '나이프', '젓가락']
vision = json.load(open(f'out/vision_claude_{name}.json'))
bboxes, labels = [], []
for o in vision['objects']:
    if any(s in o['name'] for s in SKIP):
        continue
    x1, y1, x2, y2 = o['bbox']
    bboxes.append([x1 * W, y1 * H, x2 * W, y2 * H])
    labels.append(o['name'])

if not bboxes:
    json.dump({'W': W, 'H': H, 'items': []}, open(f'out/segments_{name}.json', 'w'), ensure_ascii=False)
    print(f'{name}: no food bboxes'); sys.exit(0)

model = SAM('sam2.1_l.pt')  # SAM2 large — 접시+음식 통째 정밀. 최초 1회 자동 다운로드
res = model(img_path, bboxes=bboxes, device='cpu', verbose=False)[0]
masks = res.masks.data.cpu().numpy() if res.masks is not None else []

items = []
for idx, m in enumerate(masks):
    m_u8 = (m > 0.5).astype(np.uint8) * 255
    if m_u8.shape != (H, W):
        m_u8 = cv2.resize(m_u8, (W, H), interpolation=cv2.INTER_NEAREST)
    kk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9))
    m_u8 = cv2.morphologyEx(m_u8, cv2.MORPH_CLOSE, kk)
    m_u8 = cv2.morphologyEx(m_u8, cv2.MORPH_OPEN, kk)
    cnts, _ = cv2.findContours((m_u8 > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        continue
    cnt = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(cnt) < H * W * 0.0012:   # 완화된 임계 — 작은 그릇/잔 유지
        continue
    cnt = cv2.convexHull(cnt)   # 접시·그릇·잔은 볼록 → 음식 굴곡 따라 들어가는 선 제거(깔끔한 림)
    eps = 0.004 * cv2.arcLength(cnt, True)
    poly = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2).astype(float)
    x, y, w, h = cv2.boundingRect(cnt)
    items.append({
        'label': labels[idx] if idx < len(labels) else '',
        'poly_norm': [[round(px / W, 4), round(py / H, 4)] for px, py in poly],
        'cx_norm': round((x + w / 2) / W, 4), 'cy_norm': round((y + h / 2) / H, 4),
    })

json.dump({'W': W, 'H': H, 'items': items}, open(f'out/segments_{name}.json', 'w'),
          ensure_ascii=False, indent=1)
print(f'{name}: {len(items)} masks')
for it in items:
    print(' ', it['label'], it['cx_norm'], it['cy_norm'], 'pts', len(it['poly_norm']))
