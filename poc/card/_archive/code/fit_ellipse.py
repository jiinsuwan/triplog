# fit_ellipse.py — SAM 마스크 외곽에 타원 피팅 (접시·그릇은 원근상 타원 → 매끈하고 정확)
#   색-엣지 추적의 울퉁불퉁함을 피하고, 접시 방향(각도)까지 맞는 깔끔한 타원 외곽선.
#   사용: .venv/bin/python fit_ellipse.py IMG_9717
import sys, json
import cv2
import numpy as np

name = sys.argv[1] if len(sys.argv) > 1 else 'IMG_9717'
img = cv2.imread(f'images/{name}.jpg')
H, W = img.shape[:2]
seg = json.load(open(f'out/segments_{name}.json'))

items = []
for it in seg['items']:
    poly = (np.array(it['poly_norm'], np.float32) * [W, H]).astype(np.int32)
    if len(poly) < 5:
        continue
    (ecx, ecy), (d1, d2), ang = cv2.fitEllipse(poly)   # 축은 전체 길이, 각도는 도(°)
    items.append({
        'label': it['label'],
        'cx_norm': round(ecx / W, 4), 'cy_norm': round(ecy / H, 4),
        'rx_norm': round((d1 / 2) / W, 4), 'ry_norm': round((d2 / 2) / W, 4),
        'angle': round(ang, 1),
    })

json.dump({'W': W, 'H': H, 'items': items}, open(f'out/ellipses_{name}.json', 'w'), ensure_ascii=False)
print(f'{name}: {len(items)} ellipses')
for it in items:
    print(' ', it['label'], 'c', it['cx_norm'], it['cy_norm'], 'r', it['rx_norm'], it['ry_norm'], 'ang', it['angle'])
