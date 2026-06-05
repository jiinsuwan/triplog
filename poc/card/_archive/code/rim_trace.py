# rim_trace.py — 색 차이 기반 접시 림 추적
#   SAM 마스크 중심에서 각도별로 바깥으로 걸으며, "테이블 색"으로 바뀌는 지점(=접시 외곽)을 찾는다.
#   → 음식 굴곡을 안 따라가고 실제 접시 림에 바짝 붙는 깔끔한 외곽선.
#   사용: .venv/bin/python rim_trace.py IMG_9717
import sys, json
import cv2
import numpy as np

name = sys.argv[1] if len(sys.argv) > 1 else 'IMG_9717'
img = cv2.imread(f'images/{name}.jpg')
H, W = img.shape[:2]
lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
seg = json.load(open(f'out/segments_{name}.json'))

# 전역 테이블 색 — 하단 가장자리 스트립(대개 깨끗한 식탁보)의 중앙값
_strip = lab[int(0.86 * H):, int(0.15 * W):int(0.85 * W)].reshape(-1, 3)
TABLE = np.median(_strip, axis=0)

def is_table(x, y, thr=15.0):
    if not (0 <= x < W and 0 <= y < H):
        return True
    return np.linalg.norm(lab[y, x] - TABLE) < thr

def smooth_circular(arr, iters=2):
    a = np.array(arr, np.float32)
    for _ in range(iters):
        a = (np.roll(a, 1) + 2 * a + np.roll(a, -1)) / 4
    return a

rims = []
for it in seg['items']:
    cx, cy = it['cx_norm'] * W, it['cy_norm'] * H
    poly = np.array(it['poly_norm']) * [W, H]
    maxr = float(np.max(np.hypot(poly[:, 0] - cx, poly[:, 1] - cy)))
    N = 72
    radii = []
    for k in range(N):
        a = -np.pi + (k + 0.5) / N * 2 * np.pi
        dx, dy = np.cos(a), np.sin(a)
        # 안(접시)에서 밖으로 걸으며 "테이블이 연속 4스텝" 처음 나오는 곳 = 접시 끝
        rim_r = maxr
        r, consec = maxr * 0.5, 0
        while r < maxr * 1.22:
            if is_table(int(cx + dx * r), int(cy + dy * r)):
                consec += 1
                if consec >= 4:
                    rim_r = r - 4 * 2.0
                    break
            else:
                consec = 0
            r += 2.0
        radii.append(rim_r)
    radii = smooth_circular(radii, 3)   # 들쭉날쭉 ray 완화
    pts = []
    for k in range(N):
        a = -np.pi + (k + 0.5) / N * 2 * np.pi
        rr = radii[k] + 4   # 접시 색 끝 살짝 바깥(테이블 쪽 4px)
        pts.append([round((cx + np.cos(a) * rr) / W, 4), round((cy + np.sin(a) * rr) / H, 4)])
    rims.append({'label': it['label'], 'cx_norm': it['cx_norm'], 'cy_norm': it['cy_norm'], 'poly_norm': pts})

json.dump({'W': W, 'H': H, 'items': rims}, open(f'out/rims_{name}.json', 'w'), ensure_ascii=False)
print(f'{name}: {len(rims)} rims (color-edge)')
