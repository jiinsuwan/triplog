# outline_module.py — 외곽선 CV 모듈 (LLM 도구 / 에디터 백엔드 공용 코어)
#
# 설계 원칙 (v4~v11 실험 결론 + 사용자 방향):
#   - 개별 객체 하나하나가 기본 단위. 묶음(group)은 그 위의 연산.
#   - 외곽선 정밀도 최우선: 타이트 박스(YOLO-World) -> SAM2 box-prompt
#     -> 마스크 bbox로 박스 재조임 후 재프롬프트(tight loop) -> CV 윤곽 후처리.
#   - 출력은 전부 poly_norm(0~1) 벡터 — 에디터 요소로 직결, 스타일은 렌더 파라미터.
#
# 인터페이스 (LLM 도구 관점):
#   Engine.candidates(img)            자동 초안 — 개별 객체 전부 + 메타
#   Engine.outline_at(img, (x,y))     탭 = 단일 객체 (v10)
#   Engine.outline_multitap(img, pts) 멀티탭 = 합집합 한 묶음 (v11)
#   Engine.outline_box(img, box)      박스 = 적응형 묶음 (v9: 단일 덩어리 or 격자 합집합)
#   Engine.group(masks, margin)       마스크 합집합 -> 느슨한 외곽 루프
#
# CLI (실험용):
#   .venv/bin/python outline_module.py auto IMG_0621 IMG_0956 ...   [--snap] [--morph=7] [--off=0.006]
#   .venv/bin/python outline_module.py tap IMG_0998 0.5 0.38
#   .venv/bin/python outline_module.py multitap IMG_0998 0.4 0.3 0.55 0.4 0.6 0.5
#   .venv/bin/python outline_module.py box IMG_0621 0.1 0.2 0.9 0.8
#   .venv/bin/python outline_module.py autogroup IMG_0621 0,1,2 0.02   (candidates 후 id 묶음)
import sys, json, time, os
import cv2
import numpy as np

PROC_MAX = 1280          # 처리 해상도 (SAM 내부 1024 고려)
OUT_DIR = 'out/v12'

VOCAB = ['iced coffee', 'coffee cup', 'drink', 'glass of beverage', 'dessert', 'cake',
         'soft serve ice cream', 'bread', 'plate of food', 'bowl of food', 'noodle bowl',
         'sashimi platter', 'korean savory pancake', 'abalone', 'side dish bowl',
         'sauce bowl', 'kimchi', 'lettuce', 'grilled meat',
         'barbecue grill with meat', 'grill pan', 'hot pot', 'tray of food',
         'statue', 'sculpture', 'stone monument', 'tower', 'pagoda', 'temple building',
         'lighthouse', 'flower', 'lantern', 'street sign', 'boat', 'dog', 'cat']


# ---------------- 기하 유틸 ----------------

def chaikin(pts, iters=2):
    p = pts
    for _ in range(iters):
        n = len(p); q = []
        for i in range(n):
            a, b = p[i], p[(i + 1) % n]
            q.append([a[0] * .75 + b[0] * .25, a[1] * .75 + b[1] * .25])
            q.append([a[0] * .25 + b[0] * .75, a[1] * .25 + b[1] * .75])
        p = q
    return p


def box_iou(a, b):
    ax1, ay1, ax2, ay2 = a; bx1, by1, bx2, by2 = b
    ix = max(0, min(ax2, bx2) - max(ax1, bx1))
    iy = max(0, min(ay2, by2) - max(ay1, by1))
    inter = ix * iy
    ua = (ax2 - ax1) * (ay2 - ay1) + (bx2 - bx1) * (by2 - by1) - inter
    return inter / ua if ua > 0 else 0


class Engine:
    """모델 1회 로드 후 재사용. 제품에선 업로드 전처리 워커/서버에 상주."""

    def __init__(self, morph=7, off_ratio=0.006, snap=False, tight=True):
        self.morph = morph
        self.off_ratio = off_ratio
        self.snap = snap
        self.tight = tight
        self._det = None
        self._sam = None
        self._sal = None

    # ---------- lazy 모델 ----------
    @property
    def det(self):
        if self._det is None:
            from ultralytics import YOLOWorld
            self._det = YOLOWorld('weights/yolov8s-worldv2.pt')
            self._det.set_classes(VOCAB)
        return self._det

    @property
    def sam(self):
        if self._sam is None:
            from ultralytics import SAM
            self._sam = SAM('weights/sam2.1_b.pt')
        return self._sam

    def saliency(self, img_s):
        if self._sal is None:
            from rembg import new_session
            self._sal = new_session('u2net')
        from rembg import remove
        from PIL import Image
        m = np.array(remove(Image.fromarray(cv2.cvtColor(img_s, cv2.COLOR_BGR2RGB)),
                            session=self._sal, only_mask=True))
        return m > 128

    # ---------- 마스크 공통 ----------
    def _to_masks(self, res, shape):
        Hs, Ws = shape
        out = []
        if res.masks is None:
            return out
        kk = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (self.morph, self.morph))
        for m in res.masks.data.cpu().numpy():
            mu = (m > 0.5).astype(np.uint8) * 255
            if mu.shape != (Hs, Ws):
                # LINEAR + threshold: NEAREST 계단 완화
                mu = cv2.resize(mu, (Ws, Hs), interpolation=cv2.INTER_LINEAR)
                mu = ((mu > 127).astype(np.uint8)) * 255
            mu = cv2.morphologyEx(mu, cv2.MORPH_CLOSE, kk)
            mu = cv2.morphologyEx(mu, cv2.MORPH_OPEN, kk)
            out.append(mu)
        return out

    # ---------- 윤곽 ----------
    def _snap_to_edges(self, mask, img_s, band=None):
        """마스크 경계를 이미지 그래디언트 최대점에 흡착(실험 토글)."""
        Hs, Ws = mask.shape
        band = band or max(3, int(0.004 * min(Hs, Ws)))
        gray = cv2.cvtColor(img_s, cv2.COLOR_BGR2GRAY)
        gray = cv2.bilateralFilter(gray, 5, 40, 40)
        gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
        gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
        grad = cv2.magnitude(gx, gy)
        thr = np.percentile(grad, 75)

        cnts, _ = cv2.findContours((mask > 127).astype(np.uint8),
                                   cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        snapped = np.zeros_like(mask)
        for cnt in cnts:
            pts = cnt.reshape(-1, 2).astype(np.float32)
            n = len(pts)
            if n < 12:
                cv2.drawContours(snapped, [cnt], -1, 255, -1)
                continue
            new_pts = pts.copy()
            for i in range(n):
                a, b = pts[(i - 2) % n], pts[(i + 2) % n]
                t = b - a
                norm = np.array([t[1], -t[0]])
                ln = np.linalg.norm(norm)
                if ln < 1e-6:
                    continue
                norm /= ln
                best, best_g = None, thr
                for d in range(-band, band + 1):
                    q = pts[i] + norm * d
                    xq, yq = int(round(q[0])), int(round(q[1]))
                    if 0 <= xq < Ws and 0 <= yq < Hs and grad[yq, xq] > best_g:
                        best, best_g = q, grad[yq, xq]
                if best is not None:
                    new_pts[i] = best
            cv2.fillPoly(snapped, [new_pts.astype(np.int32)], 255)
        return snapped if snapped.any() else mask

    def mask_to_loops(self, mask, img_s=None, off_px=None, min_area_frac=0.002,
                      eps_ratio=0.0018, chaikin_iters=2):
        """마스크 -> (옵션 스냅) -> 오프셋 팽창 -> 외곽 루프(들) -> DP -> Chaikin."""
        Hs, Ws = mask.shape
        if self.snap and img_s is not None:
            mask = self._snap_to_edges(mask, img_s)
        off = off_px if off_px is not None else max(4, int(self.off_ratio * min(Hs, Ws)))
        dil = cv2.dilate(mask, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (off | 1, off | 1)))
        cnts, _ = cv2.findContours((dil > 127).astype(np.uint8),
                                   cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        loops = []
        for cnt in cnts:
            if cv2.contourArea(cnt) < Hs * Ws * min_area_frac:
                continue
            eps = eps_ratio * cv2.arcLength(cnt, True)
            loops.append(chaikin(cv2.approxPolyDP(cnt, eps, True).reshape(-1, 2).astype(float).tolist(),
                                 chaikin_iters))
        return loops

    # ---------- 검출 (v6 R1~R3 + 라벨 무관 dedupe) ----------
    def detect(self, img_s):
        Hs, Ws = img_s.shape[:2]
        sal_fg = self.saliency(img_s)
        sal_mass = sal_fg.sum() / (Hs * Ws)

        r = self.det.predict(img_s, conf=0.15, iou=0.5, verbose=False)[0]
        cands = []
        for b, c, cf in zip(r.boxes.xyxy.cpu().numpy(), r.boxes.cls.cpu().numpy(),
                            r.boxes.conf.cpu().numpy()):
            x1, y1, x2, y2 = map(float, b)
            area = (x2 - x1) * (y2 - y1) / (Ws * Hs)
            if area < 0.005 or area > 0.9:
                continue
            cands.append({'xyxy': [x1, y1, x2, y2], 'label': VOCAB[int(c)], 'conf': float(cf)})

        kept, dropped = [], []
        for o in cands:
            if o['conf'] >= 0.30:
                o['src'] = 'det'; kept.append(o)                     # R1
            else:
                x1, y1, x2, y2 = map(int, o['xyxy'])
                box_fg = sal_fg[max(0, y1):y2, max(0, x1):x2]
                ratio = box_fg.mean() if box_fg.size else 0
                if ratio > 0.25:
                    o['src'] = 'det-weak'; kept.append(o)            # R2
                else:
                    dropped.append(o)

        # 라벨 무관 dedupe: IoU 중복 + 포함관계 중복(같은 객체 이중 박스) 제거
        kept.sort(key=lambda o: -o['conf'])
        dedup = []
        for o in kept:
            dup = False
            for p in dedup:
                if box_iou(o['xyxy'], p['xyxy']) > 0.65:
                    dup = True; break
                ax1, ay1, ax2, ay2 = o['xyxy']; bx1, by1, bx2, by2 = p['xyxy']
                ix = max(0, min(ax2, bx2) - max(ax1, bx1))
                iy = max(0, min(ay2, by2) - max(ay1, by1))
                a_o = (ax2 - ax1) * (ay2 - ay1); a_p = (bx2 - bx1) * (by2 - by1)
                small = min(a_o, a_p)
                # 한쪽이 다른 쪽에 거의 포함 + 크기 비슷 -> 같은 객체 (그릇 vs 내용물 류)
                if small > 0 and ix * iy / small > 0.9 and small / max(a_o, a_p) > 0.55:
                    dup = True; break
            if not dup:
                dedup.append(o)
        kept = dedup[:12]

        # 운반대 강등: 다른 채택 박스를 2개 이상 품는 박스는 개별 후보에서 제외(메타 보존)
        def contains(big, small_box):
            bx1, by1, bx2, by2 = big; sx1, sy1, sx2, sy2 = small_box
            ix = max(0, min(bx2, sx2) - max(bx1, sx1))
            iy = max(0, min(by2, sy2) - max(by1, sy1))
            sa = (sx2 - sx1) * (sy2 - sy1)
            return sa > 0 and ix * iy / sa > 0.8
        carriers = []
        non_carriers = []
        for o in kept:
            children = sum(1 for p in kept if p is not o and contains(o['xyxy'], p['xyxy']))
            (carriers if children >= 2 else non_carriers).append(o)
        kept = non_carriers

        # 운반대 내부 확대 재검출 (SAHI식): 강등으로 사라진 저신뢰 자식(아이스크림 류) 구제
        for c in carriers[:2]:
            cx1, cy1, cx2, cy2 = map(int, c['xyxy'])
            cw, ch = cx2 - cx1, cy2 - cy1
            if cw < 60 or ch < 60:
                continue
            crop = img_s[max(0, cy1):cy2, max(0, cx1):cx2]
            zoom = min(2.5, PROC_MAX / max(cw, ch))
            if zoom > 1.1:
                crop = cv2.resize(crop, (int(cw * zoom), int(ch * zoom)))
            else:
                zoom = 1.0
            rz = self.det.predict(crop, conf=0.20, iou=0.5, verbose=False)[0]
            for b, cls_i, cf in zip(rz.boxes.xyxy.cpu().numpy(), rz.boxes.cls.cpu().numpy(),
                                    rz.boxes.conf.cpu().numpy()):
                zx1, zy1, zx2, zy2 = [float(v) / zoom for v in b]
                box = [cx1 + zx1, cy1 + zy1, cx1 + zx2, cy1 + zy2]
                area = (box[2] - box[0]) * (box[3] - box[1]) / (Ws * Hs)
                if area < 0.004 or area > 0.6:
                    continue
                o = {'xyxy': box, 'label': VOCAB[int(cls_i)], 'conf': float(cf), 'src': 'det-zoom'}
                dup = any(box_iou(o['xyxy'], p['xyxy']) > 0.5 or
                          contains(p['xyxy'], o['xyxy']) and
                          min((box[2]-box[0])*(box[3]-box[1]),
                              (p['xyxy'][2]-p['xyxy'][0])*(p['xyxy'][3]-p['xyxy'][1])) /
                          max(1e-6, max((box[2]-box[0])*(box[3]-box[1]),
                              (p['xyxy'][2]-p['xyxy'][0])*(p['xyxy'][3]-p['xyxy'][1]))) > 0.55
                          for p in kept)
                if not dup:
                    kept.append(o)
        kept = kept[:12]

        # 운반대 내부 점-격자 구제 (어휘 무관): 검출이 이름 못 붙이는 내용물(생고기/나물 류)을
        # SAM 점 프롬프트로 직접 분할. v9 "잘게 따서 합치기"의 자동화 버전.
        grid_masks = []
        for c in carriers[:2]:
            cx1, cy1, cx2, cy2 = map(int, c['xyxy'])
            cw, ch = cx2 - cx1, cy2 - cy1
            if cw < 80 or ch < 80:
                continue
            covered = np.zeros((Hs, Ws), np.uint8)
            for o in kept:
                x1, y1, x2, y2 = map(int, o['xyxy'])
                covered[max(0, y1):y2, max(0, x1):x2] = 255
            pts = [(float(gx), float(gy))
                   for gy in np.linspace(cy1 + ch * 0.12, cy2 - ch * 0.12, 4)
                   for gx in np.linspace(cx1 + cw * 0.12, cx2 - cw * 0.12, 4)
                   if covered[int(gy), int(gx)] < 127]
                   # 참고: 5x5 실험(2026-06-12) — 탭 위치가 바뀌며 얻는 조각/잃는 조각이 교차,
                   # 단순 밀도 증가는 누락의 결정적 해법이 아님. 잔여 누락은 탭 보정 영역.
            carea = cw * ch
            inbox = np.zeros((Hs, Ws), bool); inbox[cy1:cy2, cx1:cx2] = True
            for px, py in pts[:16]:
                # 이미 찾은 조각 위의 점은 건너뛰기 (중복 탭 절약)
                if any(pv[int(py), int(px)] > 127 for pv in grid_masks):
                    continue
                res_g = self.sam(img_s, points=[[px, py]], labels=[1], verbose=False)[0]
                for mu in self._to_masks(res_g, (Hs, Ws)):
                    a = mu > 127
                    s = int(a.sum())
                    if s < carea * 0.01 or s > carea * 0.45:      # 부스러기/운반대 표면 통짜 기각
                        continue
                    if (a & inbox).sum() / s < 0.8:                # 운반대 밖으로 새는 마스크 기각
                        continue
                    if (a & (covered > 127)).sum() / s > 0.5:      # 기존 채택 객체와 중복 기각
                        continue
                    ys_p, xs_p = np.where(a)                       # 표면 조각 기각: 채택 박스 2개 이상 품으면 운반대 표면
                    pbox = [float(xs_p.min()), float(ys_p.min()), float(xs_p.max()), float(ys_p.max())]
                    if sum(1 for o in kept if contains(pbox, o['xyxy'])) >= 2:
                        continue
                    merged = False
                    for j, pv in enumerate(grid_masks):
                        pb = pv > 127
                        if (a & pb).sum() / min(s, int(pb.sum())) > 0.3:
                            grid_masks[j] = cv2.bitwise_or(pv, mu)   # 같은 객체 조각 합치기
                            merged = True; break
                    if not merged:
                        grid_masks.append(mu)

        # R3 일반화 = saliency 커버리지-갭 구제:
        #   채택 박스들이 못 덮은 saliency 전경의 큰 성분 -> 후보 추가 (거대 주인공 미검출 구제)
        fallback = False
        if 0.03 <= sal_mass <= 0.85:
            covered = np.zeros((Hs, Ws), np.uint8)
            for o in kept + carriers:
                x1, y1, x2, y2 = map(int, o['xyxy'])
                covered[max(0, y1):y2, max(0, x1):x2] = 255
            gap = (sal_fg & (covered < 127)).astype(np.uint8) * 255
            gap = cv2.morphologyEx(gap, cv2.MORPH_OPEN,
                                   cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (9, 9)))
            n_lbl, lbl, stats, _ = cv2.connectedComponentsWithStats((gap > 127).astype(np.uint8))
            comps = [(stats[i, cv2.CC_STAT_AREA], i) for i in range(1, n_lbl)
                     if stats[i, cv2.CC_STAT_AREA] / (Hs * Ws) > 0.04]
            for _, i in sorted(comps, reverse=True)[:2]:
                x, y, w, h = (stats[i, cv2.CC_STAT_LEFT], stats[i, cv2.CC_STAT_TOP],
                              stats[i, cv2.CC_STAT_WIDTH], stats[i, cv2.CC_STAT_HEIGHT])
                if w * h / (Hs * Ws) > 0.95:        # 프레임 전체급은 기각
                    continue
                fallback = True
                kept.append({'xyxy': [float(x), float(y), float(x + w), float(y + h)],
                             'label': 'subject', 'conf': 0.0, 'src': 'sal'})
        return kept, dropped, sal_mass, fallback, carriers, grid_masks

    # ---------- 타이트 박스 SAM ----------
    def sam_tight(self, img_s, boxes):
        """SAM 1차 -> 마스크 bbox로 박스 재조임 -> 재프롬프트. 면적 안정 시 채택."""
        Hs, Ws = img_s.shape[:2]
        res = self.sam(img_s, bboxes=boxes, verbose=False)[0]
        masks = self._to_masks(res, (Hs, Ws))
        if not self.tight or not masks:
            return masks, [False] * len(masks)

        refined_idx, refined_boxes = [], []
        for i, mu in enumerate(masks):
            if i >= len(boxes):
                break
            ys, xs = np.where(mu > 127)
            if len(xs) == 0:
                continue
            bx1, by1, bx2, by2 = boxes[i]
            tx1, tx2 = xs.min(), xs.max()
            ty1, ty2 = ys.min(), ys.max()
            barea = max(1, (bx2 - bx1) * (by2 - by1))
            tarea = (tx2 - tx1) * (ty2 - ty1)
            if tarea < 0.80 * barea:                      # 원 박스가 헐렁했음
                pad_x = 0.02 * (tx2 - tx1); pad_y = 0.02 * (ty2 - ty1)
                refined_idx.append(i)
                refined_boxes.append([max(0, tx1 - pad_x), max(0, ty1 - pad_y),
                                      min(Ws - 1, tx2 + pad_x), min(Hs - 1, ty2 + pad_y)])
        tightened = [False] * len(masks)
        if refined_boxes:
            res2 = self.sam(img_s, bboxes=refined_boxes, verbose=False)[0]
            masks2 = self._to_masks(res2, (Hs, Ws))
            for j, i in enumerate(refined_idx):
                if j >= len(masks2):
                    break
                a_old = (masks[i] > 127).sum()
                a_new = (masks2[j] > 127).sum()
                if a_old and abs(a_new - a_old) / a_old < 0.3:   # 면적 안정 -> 채택
                    masks[i] = masks2[j]
                    tightened[i] = True
        return masks, tightened

    # ---------- 공개 연산 ----------
    def candidates(self, img_s):
        """자동 초안: 개별 객체 전부. 반환 items + 진단 메타."""
        Hs, Ws = img_s.shape[:2]
        t0 = time.time()
        kept, dropped, sal_mass, fallback, carriers, grid_masks = self.detect(img_s)
        t1 = time.time()
        items = []
        tightened = []
        if kept:
            masks, tightened = self.sam_tight(img_s, [o['xyxy'] for o in kept])
            for i, mu in enumerate(masks):
                if i >= len(kept) or (mu > 127).sum() < Hs * Ws * 0.003:
                    continue
                loops = self.mask_to_loops(mu, img_s)
                if not loops:
                    continue
                ys, xs = np.where(mu > 127)
                items.append({
                    'id': len(items),
                    'label': kept[i]['label'], 'conf': round(kept[i]['conf'], 3),
                    'src': kept[i]['src'],
                    'tightened': bool(tightened[i]) if i < len(tightened) else False,
                    'bbox_norm': [round(xs.min() / Ws, 4), round(ys.min() / Hs, 4),
                                  round(xs.max() / Ws, 4), round(ys.max() / Hs, 4)],
                    'center_norm': [round(xs.mean() / Ws, 4), round(ys.mean() / Hs, 4)],
                    'area_frac': round((mu > 127).sum() / (Hs * Ws), 4),
                    'loops': loops, 'mask': mu,
                })
        # 이중 포커스 제거(그릇+내용물 동시 검출). 페어 2형:
        #   마스크 포함형(파편/내용물 ⊂ 전체) -> 전체(큰 쪽) 유지
        #   bbox 포함형(접시 고리 vs 내용물, 마스크 분리) -> 채움 밀도 높은 쪽(진짜 객체) 유지
        removed = set()
        for i in range(len(items)):
            for j in range(i + 1, len(items)):
                if i in removed or j in removed:
                    continue
                a = items[i]['mask'] > 127; b = items[j]['mask'] > 127
                sa, sb = int(a.sum()), int(b.sum())
                if sa == 0 or sb == 0:
                    continue
                small_i, big_i = (i, j) if sa <= sb else (j, i)
                s_small, s_big = min(sa, sb), max(sa, sb)
                inter = int((a & b).sum())
                if inter / s_small > 0.8 and s_small / s_big >= 0.25:
                    # 마스크 포함형: 작은 쪽 = 전체의 일부(내용물/파편) -> 전체(큰 쪽) 유지
                    removed.add(small_i)
                    continue
                bs, bb = items[small_i]['bbox_norm'], items[big_i]['bbox_norm']
                ix = max(0, min(bs[2], bb[2]) - max(bs[0], bb[0]))
                iy = max(0, min(bs[3], bb[3]) - max(bs[1], bb[1]))
                a_s = (bs[2] - bs[0]) * (bs[3] - bs[1])
                a_b = (bb[2] - bb[0]) * (bb[3] - bb[1])
                if a_s > 0 and (ix * iy) / a_s > 0.85 and a_s / max(a_b, 1e-6) >= 0.3:
                    # bbox 포함형(마스크는 분리 = 접시 고리 vs 내용물): 밀도 높은 쪽 유지
                    def density(it, s):
                        x1, y1, x2, y2 = it['bbox_norm']
                        area = max(1e-6, (x2 - x1) * (y2 - y1)) * Hs * Ws
                        return s / area
                    d_s = density(items[small_i], s_small)
                    d_b = density(items[big_i], s_big)
                    removed.add(big_i if d_s >= d_b else small_i)
        items = [it for k, it in enumerate(items) if k not in removed]
        for k, it in enumerate(items):
            it['id'] = k

        for mu in grid_masks:                       # 운반대 내부 격자 구제 항목
            if (mu > 127).sum() < Hs * Ws * 0.003:
                continue
            loops = self.mask_to_loops(mu, img_s)
            if not loops:
                continue
            ys, xs = np.where(mu > 127)
            items.append({
                'id': len(items), 'label': 'subject', 'conf': 0.0, 'src': 'grid',
                'tightened': False,
                'bbox_norm': [round(xs.min() / Ws, 4), round(ys.min() / Hs, 4),
                              round(xs.max() / Ws, 4), round(ys.max() / Hs, 4)],
                'center_norm': [round(xs.mean() / Ws, 4), round(ys.mean() / Hs, 4)],
                'area_frac': round((mu > 127).sum() / (Hs * Ws), 4),
                'loops': loops, 'mask': mu,
            })
        t2 = time.time()
        meta = {'sal_mass': round(float(sal_mass), 3), 'fallback': fallback,
                'dropped': len(dropped), 'dropped_boxes': [d['xyxy'] for d in dropped],
                'carriers': [{'label': c['label'], 'conf': round(c['conf'], 3),
                              'xyxy_norm': [round(c['xyxy'][0] / Ws, 4), round(c['xyxy'][1] / Hs, 4),
                                            round(c['xyxy'][2] / Ws, 4), round(c['xyxy'][3] / Hs, 4)]}
                             for c in carriers],
                't_detect': round(t1 - t0, 1), 't_sam': round(t2 - t1, 1)}
        return items, meta

    def outline_at(self, img_s, pt_norm):
        """탭 = 단일 객체 (v10)."""
        Hs, Ws = img_s.shape[:2]
        px, py = pt_norm[0] * Ws, pt_norm[1] * Hs
        res = self.sam(img_s, points=[[float(px), float(py)]], labels=[1], verbose=False)[0]
        masks = self._to_masks(res, (Hs, Ws))
        if not masks:
            return None
        return {'loops': self.mask_to_loops(masks[0], img_s), 'mask': masks[0]}

    def outline_multitap(self, img_s, pts_norm):
        """멀티탭 = 점들 합집합 한 묶음 (v11)."""
        Hs, Ws = img_s.shape[:2]
        union = np.zeros((Hs, Ws), np.uint8)
        for x, y in pts_norm:
            r = self.outline_at(img_s, (x, y))
            if r is not None:
                union = cv2.bitwise_or(union, r['mask'])
        if not union.any():
            return None
        return {'loops': self.mask_to_loops(union, img_s), 'mask': union}

    def outline_box(self, img_s, box_norm):
        """박스 = 적응형 묶음 (v9): 커버리지>=0.45 단일 / 미달 3x3 격자 합집합."""
        Hs, Ws = img_s.shape[:2]
        x1, y1, x2, y2 = (int(box_norm[0] * Ws), int(box_norm[1] * Hs),
                          int(box_norm[2] * Ws), int(box_norm[3] * Hs))
        x1, y1 = max(0, x1), max(0, y1); x2, y2 = min(Ws - 1, x2), min(Hs - 1, y2)
        barea = max(1, (x2 - x1) * (y2 - y1))
        inbox = np.zeros((Hs, Ws), np.uint8); inbox[y1:y2, x1:x2] = 255

        res = self.sam(img_s, bboxes=[[x1, y1, x2, y2]], verbose=False)[0]
        m_box = self._to_masks(res, (Hs, Ws))
        cov = ((m_box[0] > 127) & (inbox > 127)).sum() / barea if m_box else 0

        if cov >= 0.45:
            union = cv2.bitwise_and(m_box[0], inbox)
        else:
            pieces = []
            gx = np.linspace(x1 + (x2 - x1) * 0.15, x2 - (x2 - x1) * 0.15, 3)
            gy = np.linspace(y1 + (y2 - y1) * 0.15, y2 - (y2 - y1) * 0.15, 3)
            for px in gx:
                for py in gy:
                    res_p = self.sam(img_s, points=[[float(px), float(py)]], labels=[1],
                                     verbose=False)[0]
                    for mu in self._to_masks(res_p, (Hs, Ws)):
                        a = (mu > 127)
                        if a.sum() == 0 or (a & (inbox > 127)).sum() / a.sum() < 0.7:
                            continue
                        if a.sum() < barea * 0.01 or a.sum() > barea * 1.2:
                            continue
                        if any(((a & (pv > 127)).sum() / max(1, (a | (pv > 127)).sum())) > 0.8
                               for pv in pieces):
                            continue
                        pieces.append(mu)
            union = np.zeros((Hs, Ws), np.uint8)
            for mu in pieces:
                union = cv2.bitwise_or(union, mu)
            union = cv2.bitwise_and(union, inbox)
            if m_box and cov >= 0.15:
                union = cv2.bitwise_or(union, cv2.bitwise_and(m_box[0], inbox))
        if not union.any():
            return None
        return {'loops': self.mask_to_loops(union, img_s), 'mask': union, 'cov': round(float(cov), 2)}

    def text_anchors(self, img_s, items, k=3):
        """객체별 텍스트 배치 후보: 외곽선·객체와 안 겹치는 빈 공간 중
        (1) 여유 거리 (2) 어두움(흰 글씨 가독) (3) 해당 객체와의 근접을 점수화."""
        Hs, Ws = img_s.shape[:2]
        occ = np.zeros((Hs, Ws), np.uint8)
        stroke = max(3, int(0.01 * min(Hs, Ws)))
        for it in items:
            occ = cv2.bitwise_or(occ, it['mask'])
            for poly in it['loops']:
                cv2.polylines(occ, [np.array(poly, np.int32)], True, 255, stroke)
        pad = max(5, int(0.025 * min(Hs, Ws))) | 1
        occ = cv2.dilate(occ, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (pad, pad)))
        free = (occ < 127).astype(np.uint8)
        dist = cv2.distanceTransform(free, cv2.DIST_L2, 3)
        gray = cv2.cvtColor(img_s, cv2.COLOR_BGR2GRAY).astype(np.float32) / 255.0
        base = np.minimum(dist, 0.10 * min(Hs, Ws)) * (1.25 - 0.85 * gray)
        # 프레임 가장자리 배제
        mx, my = int(0.06 * Ws), int(0.05 * Hs)
        base[:my, :] = 0; base[-my:, :] = 0; base[:, :mx] = 0; base[:, -mx:] = 0

        min_r = 0.035 * min(Hs, Ws)                     # 최소 여유 반경 (텍스트 한 줄 가정)
        for it in items:
            cx, cy = it['center_norm'][0] * Ws, it['center_norm'][1] * Hs
            x1, y1, x2, y2 = (np.array(it['bbox_norm']) * [Ws, Hs, Ws, Hs])
            rad = 0.5 * max(x2 - x1, y2 - y1)
            cands = []
            for ang in np.linspace(0, 2 * np.pi, 24, endpoint=False):
                for rr in (rad + 0.06 * min(Hs, Ws), rad + 0.13 * min(Hs, Ws)):
                    px, py = cx + rr * np.cos(ang), cy + rr * np.sin(ang)
                    xi, yi = int(px), int(py)
                    if not (0 <= xi < Ws and 0 <= yi < Hs):
                        continue
                    if dist[yi, xi] < min_r or base[yi, xi] <= 0:
                        continue
                    cands.append((float(base[yi, xi]), px, py))
            cands.sort(reverse=True)
            chosen = []
            for s, px, py in cands:                     # 후보끼리 뭉침 방지
                if all((px - q[0]) ** 2 + (py - q[1]) ** 2 > (0.09 * min(Hs, Ws)) ** 2
                       for q in chosen):
                    chosen.append((px, py, s))
                if len(chosen) >= k:
                    break
            it['anchors'] = [[round(px / Ws, 4), round(py / Hs, 4), round(s, 1)]
                             for px, py, s in chosen]
        return items

    def group(self, masks, margin_norm=0.012, relax='hull'):
        """후보 마스크 합집합 -> margin 만큼 띄운 느슨한 외곽 루프.
        relax='hull'  : 연결성분별 convex hull 버블 — 떨어진 객체 묶음(컵들)에 적합.
        relax='smooth': 틈만 메우고 오목 유지 + 강한 단순화 — 한 덩어리 큰 객체(불판)에 적합.
                        (hull은 오목부를 직선으로 질러 옆 객체까지 품는 듯 보이는 부작용)
        relax=False   : 합집합 윤곽 그대로."""
        union = np.zeros_like(masks[0])
        for m in masks:
            union = cv2.bitwise_or(union, m)
        Hs, Ws = union.shape
        off = max(4, int(margin_norm * min(Hs, Ws)))
        if relax:
            k = max(9, int(0.03 * min(Hs, Ws)) | 1)
            union_r = cv2.morphologyEx(union, cv2.MORPH_CLOSE,
                                       cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (k, k)))
            if relax == 'smooth':
                return {'loops': self.mask_to_loops(union_r, None, off_px=off,
                                                    eps_ratio=0.004, chaikin_iters=3),
                        'mask': union}
            hulls = np.zeros_like(union_r)
            cnts, _ = cv2.findContours((union_r > 127).astype(np.uint8),
                                       cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            for cnt in cnts:
                if cv2.contourArea(cnt) < Hs * Ws * 0.002:
                    continue
                cv2.fillConvexPoly(hulls, cv2.convexHull(cnt), 255)
            return {'loops': self.mask_to_loops(hulls, None, off_px=off,
                                                eps_ratio=0.004, chaikin_iters=3),
                    'mask': union}
        return {'loops': self.mask_to_loops(union, None, off_px=off), 'mask': union}


# ---------------- 렌더/비교 (실험 평가용) ----------------

def render(img_s, all_loops, thickness=3):
    """흰 펜 + 소프트 섀도 — ref 질감 근사."""
    out = img_s.copy()
    shadow = np.zeros(img_s.shape[:2], np.uint8)
    for loops in all_loops:
        for poly in loops:
            cv2.polylines(shadow, [np.array(poly, np.int32)], True, 255, thickness + 3, cv2.LINE_AA)
    shadow = cv2.GaussianBlur(shadow, (9, 9), 0)
    out = (out.astype(np.float32) * (1 - 0.25 * (shadow[..., None] / 255.0))).astype(np.uint8)
    for loops in all_loops:
        for poly in loops:
            cv2.polylines(out, [np.array(poly, np.int32)], True, (245, 250, 255), thickness, cv2.LINE_AA)
    return out


def load_image(name):
    img = cv2.imread(f'images/{name}.jpg')
    assert img is not None, f'images/{name}.jpg 없음'
    H, W = img.shape[:2]
    scale = PROC_MAX / max(H, W)
    img_s = cv2.resize(img, (int(W * scale), int(H * scale))) if scale < 1 else img
    return img_s


def save_outputs(tag, name, img_s, items_or_loops, meta=None, extra_panel=None):
    os.makedirs(OUT_DIR, exist_ok=True)
    if isinstance(items_or_loops, list) and items_or_loops and isinstance(items_or_loops[0], dict):
        all_loops = [it['loops'] for it in items_or_loops]
        jitems = [{k: v for k, v in it.items() if k != 'mask'} for it in items_or_loops]
    else:
        all_loops = items_or_loops
        jitems = [{'loops': l} for l in all_loops]
    Hs, Ws = img_s.shape[:2]
    for it in jitems:
        it['poly_norm'] = [[[round(x / Ws, 4), round(y / Hs, 4)] for x, y in poly]
                           for poly in it.pop('loops')]
    rendered = render(img_s, all_loops)
    cv2.imwrite(f'{OUT_DIR}/{tag}_{name}.jpg', rendered, [cv2.IMWRITE_JPEG_QUALITY, 92])
    json.dump({'W': Ws, 'H': Hs, 'meta': meta or {}, 'items': jitems},
              open(f'{OUT_DIR}/{tag}_{name}.json', 'w'), ensure_ascii=False, indent=1)

    # ref 나란히 비교
    suffix = name.replace('IMG_', '')
    ref = cv2.imread(f'images/ref_{suffix}.png')
    panels = [rendered]
    if extra_panel is not None:
        panels.insert(0, extra_panel)
    if ref is not None:
        rh = rendered.shape[0]
        ref = cv2.resize(ref, (int(ref.shape[1] * rh / ref.shape[0]), rh))
        panels.append(ref)
    cmp_img = cv2.hconcat(panels)
    cv2.imwrite(f'{OUT_DIR}/cmp_{tag}_{name}.jpg', cmp_img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return rendered


# ---------------- CLI ----------------

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    flags = {a.split('=')[0].lstrip('-'): (a.split('=')[1] if '=' in a else True)
             for a in sys.argv[1:] if a.startswith('--')}
    mode = args[0] if args else 'auto'
    eng = Engine(morph=int(flags.get('morph', 7)),
                 off_ratio=float(flags.get('off', 0.006)),
                 snap=bool(flags.get('snap', False)),
                 tight=not flags.get('no-tight', False))

    if mode == 'auto':
        for name in args[1:]:
            img_s = load_image(name)
            t0 = time.time()
            items, meta = eng.candidates(img_s)
            items = eng.text_anchors(img_s, items)      # 텍스트 배치 후보 (외곽선 비겹침)
            meta['t_total'] = round(time.time() - t0, 1)
            # 진단 패널: 검출 박스 + 채택 정보
            diag = img_s.copy()
            for it in items:
                Hs, Ws = img_s.shape[:2]
                x1, y1, x2, y2 = (np.array(it['bbox_norm']) * [Ws, Hs, Ws, Hs]).astype(int)
                col = (90, 200, 120) if it['src'] == 'det' else \
                      (80, 200, 255) if it['src'] == 'det-weak' else (255, 180, 80)
                cv2.rectangle(diag, (x1, y1), (x2, y2), col, 2)
                tt = '+T' if it['tightened'] else ''
                cv2.putText(diag, f"{it['id']}:{it['label'][:14]}{tt}", (x1, max(14, y1 - 6)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.45, col, 1, cv2.LINE_AA)
            rendered = save_outputs('auto', name, img_s, items, meta, extra_panel=diag)
            anch = rendered.copy()                      # 앵커 후보 시각화
            Hs, Ws = img_s.shape[:2]
            for it in items:
                for j, (ax, ay, s) in enumerate(it.get('anchors', [])):
                    p = (int(ax * Ws), int(ay * Hs))
                    if j == 0:
                        cv2.circle(anch, p, 13, (30, 30, 30), -1)
                        cv2.circle(anch, p, 13, (90, 220, 255), 2)
                        cv2.putText(anch, str(it['id']), (p[0] - 7, p[1] + 6),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (255, 255, 255), 1, cv2.LINE_AA)
                    else:
                        cv2.circle(anch, p, 6, (90, 220, 255), 2)
            cv2.imwrite(f'{OUT_DIR}/anchors_{name}.jpg', anch, [cv2.IMWRITE_JPEG_QUALITY, 90])
            print(f"{name}: {len(items)} items | det {meta['t_detect']}s sam {meta['t_sam']}s "
                  f"| drop {meta['dropped']} fallback {meta['fallback']} "
                  f"| tight {[it['id'] for it in items if it['tightened']]}")

    elif mode == 'tap':
        name = args[1]
        pts = [(float(args[i]), float(args[i + 1])) for i in range(2, len(args), 2)]
        img_s = load_image(name)
        results = [eng.outline_at(img_s, p) for p in pts]
        loops = [r['loops'] for r in results if r]
        save_outputs('tap', name, img_s, loops)
        print(f'{name}: taps {len(pts)} -> {len(loops)} outlines')

    elif mode == 'multitap':
        name = args[1]
        pts = [(float(args[i]), float(args[i + 1])) for i in range(2, len(args), 2)]
        img_s = load_image(name)
        r = eng.outline_multitap(img_s, pts)
        if r and flags.get('relax'):                  # 버블 묶음 (group relax 경로)
            r = eng.group([r['mask']], float(flags.get('margin', 0.02)), relax=True)
        save_outputs('multitap', name, img_s, [r['loops']] if r else [])
        print(f'{name}: multitap {len(pts)} pts -> {len(r["loops"]) if r else 0} loops')

    elif mode == 'box':
        name = args[1]
        bs = [tuple(float(args[i + j]) for j in range(4)) for i in range(2, len(args), 4)]
        img_s = load_image(name)
        results = [eng.outline_box(img_s, b) for b in bs]
        loops = [r['loops'] for r in results if r]
        save_outputs('box', name, img_s, loops)
        print(f'{name}: boxes {len(bs)} -> {[r["cov"] for r in results if r]} cov')

    elif mode == 'autogroup':
        name = args[1]
        ids = [int(i) for i in args[2].split(',')]
        margin = float(args[3]) if len(args) > 3 else 0.012
        img_s = load_image(name)
        items, meta = eng.candidates(img_s)
        sel = [it['mask'] for it in items if it['id'] in ids]
        rest = [it['loops'] for it in items if it['id'] not in ids]
        g = eng.group(sel, margin)
        save_outputs('autogroup', name, img_s, [g['loops']] + rest)
        print(f'{name}: group({ids}, margin {margin}) -> {len(g["loops"])} loops')

    else:
        print(f'unknown mode: {mode}')
