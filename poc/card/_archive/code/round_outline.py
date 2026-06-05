# round_outline.py — 저장된 음식 마스크(out/seg_{name}_*.png)에서 외곽선을 다시 뽑는다.
# SAM 재실행 없이 "뭉툭 정도(smooth)"와 "여유(expand)"만 즉시 조절 → segments_{name}.json 갱신.
#
# 사용: python3 round_outline.py IMG_9717 [smooth=6] [expand=1.0]
#   smooth: 외곽 둥글기(이동평균 반복). 0=원본, 클수록 뭉툭
#   expand: 1.0=윤곽에 딱, 1.03=살짝 여유 (1.0 권장 — 그 이상은 접시 밖으로 뜸)
import sys, json, glob
import cv2
import numpy as np

name = sys.argv[1] if len(sys.argv) > 1 else 'IMG_9717'
smooth = int(sys.argv[2]) if len(sys.argv) > 2 else 6
expand = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0

im = cv2.imread(f'images/{name}.jpg'); H, W = im.shape[:2]

def smooth_closed(p, it):
    for _ in range(it):
        n = len(p)
        p = np.array([[(p[(i-1) % n, 0] + 2*p[i, 0] + p[(i+1) % n, 0]) / 4,
                       (p[(i-1) % n, 1] + 2*p[i, 1] + p[(i+1) % n, 1]) / 4] for i in range(n)])
    return p

items = []
for f in sorted(glob.glob(f'out/seg_{name}_*.png')):
    m = cv2.imread(f, 0)
    cnts, _ = cv2.findContours((m > 127).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not cnts:
        continue
    cnt = max(cnts, key=cv2.contourArea)
    eps = 0.004 * cv2.arcLength(cnt, True)
    poly = cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2).astype(float)
    if smooth:
        poly = smooth_closed(poly, smooth)
    if expand != 1.0:
        c = poly.mean(0); poly = c + (poly - c) * expand
    x, y, w, h = cv2.boundingRect(cnt)
    items.append({'poly_norm': [[round(float(px)/W, 4), round(float(py)/H, 4)] for px, py in poly],
                  'cx_norm': round((x + w/2)/W, 4), 'cy_norm': round((y + h/2)/H, 4)})

json.dump({'W': W, 'H': H, 'items': items}, open(f'out/segments_{name}.json', 'w'), ensure_ascii=False, indent=1)
print(f'{name}: {len(items)} outlines | smooth={smooth} expand={expand}')
