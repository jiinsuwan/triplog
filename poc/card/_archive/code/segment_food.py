# segment_food.py — Vision bbox를 FastSAM box-prompt로 줘서 각 음식만 정밀 분리
# (everything 모드는 사람/배경을 잡아 부정확 → Vision이 찾은 음식 위치를 프롬프트로 사용)
#
# 파이프라인: Claude vision bbox(음식 위치) → FastSAM box-prompt(정밀 마스크)
#            → OpenCV feather(부드러운 경계) → findContours/approxPolyDP(외곽 폴리곤)
# 산출물:
#   out/foodmask_{name}.png  — 음식 영역만 soft alpha RGBA
#   out/segments_{name}.json — 음식별 외곽 폴리곤(정규화) + 중심 + label
#
# 사용: python3 segment_food.py IMG_9717
import sys, json
import cv2
import numpy as np
from ultralytics import SAM

name = sys.argv[1] if len(sys.argv) > 1 else 'IMG_9717'
img_path = f'images/{name}.jpg'
img_bgr = cv2.imread(img_path)
H, W = img_bgr.shape[:2]

# 음식이 아닌 객체는 제외 (사람/손/폰/풍경 등)
SKIP = ['사람', '손', '폰', '스마트폰', '하늘', '건물', '산', '기마상', '받침대', '동상', '기단', '인물']
vision = json.load(open(f'out/vision_claude_{name}.json'))
bboxes, labels = [], []
for o in vision['objects']:
    if any(s in o['name'] for s in SKIP):
        continue
    x1, y1, x2, y2 = o['bbox']
    bboxes.append([x1 * W, y1 * H, x2 * W, y2 * H])  # 정규화 → 픽셀
    labels.append(o['name'])

model = SAM('sam2.1_l.pt')  # SAM2 large — 접시+음식 통째를 더 정밀하게. 최초 실행 시 자동 다운로드
res = model(img_path, bboxes=bboxes, device='cpu', verbose=False)[0]
masks = res.masks.data.cpu().numpy() if res.masks is not None else []

items = []
combined = np.zeros((H, W), np.uint8)
for idx, m in enumerate(masks):
    m_u8 = (m > 0.5).astype(np.uint8) * 255
    if m_u8.shape != (H, W):
        m_u8 = cv2.resize(m_u8, (W, H), interpolation=cv2.INTER_NEAREST)
    # 마스크 정리 — 구멍 메우고 가는 삐침/노이즈 제거 (외곽선 정밀도)
    kk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (21, 21))
    m_u8 = cv2.morphologyEx(m_u8, cv2.MORPH_CLOSE, kk)
    m_u8 = cv2.morphologyEx(m_u8, cv2.MORPH_OPEN, kk)
    cnts, _ = cv2.findContours((m_u8 > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        continue
    cnt = max(cnts, key=cv2.contourArea)  # 가장 큰 덩어리만 (작은 노이즈 컴포넌트 제거)
    if cv2.contourArea(cnt) < H * W * 0.01:
        continue
    eps = 0.002 * cv2.arcLength(cnt, True)  # 점 더 촘촘히 → 접시 윤곽 정밀하게
    poly = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2).astype(float)
    x, y, w, h = cv2.boundingRect(cnt)
    cv2.imwrite(f'out/seg_{name}_{len(items)}.png', m_u8)  # 개별 마스크 저장 → 이후 후처리는 SAM 없이 즉시
    items.append({
        'label': labels[idx] if idx < len(labels) else '',
        'poly_norm': [[round(px / W, 4), round(py / H, 4)] for px, py in poly],
        'cx_norm': round((x + w / 2) / W, 4), 'cy_norm': round((y + h / 2) / H, 4),
        'bbox_norm': [round(x / W, 4), round(y / H, 4), round(w / W, 4), round(h / H, 4)],
    })
    combined = np.maximum(combined, m_u8)

# 음식 통합 soft mask — 경계를 크게 페더링해서 "극명한 테두리" 제거
soft = cv2.GaussianBlur(combined, (45, 45), 0)
cv2.imwrite(f'out/foodmask_{name}.png', np.dstack([img_bgr, soft]))
json.dump({'W': W, 'H': H, 'items': items}, open(f'out/segments_{name}.json', 'w'),
          ensure_ascii=False, indent=1)

print(f'{name}: {len(items)} food instances (box-prompted)')
for it in items:
    print(f"  {it['label']}  center=({it['cx_norm']},{it['cy_norm']})  pts={len(it['poly_norm'])}")
