#!/usr/bin/env python3
# measure_caption.py — 카드 "짧은 문구" 생성의 토큰/비용/지연 실측 (H5/H6)
#   구조: LLM은 객체별 짧은 노트만 생성(전체 카드 JSON 아님). decisions/0004 D3 검증용.
#   키는 poc/card/.env 에 직접 넣는다 (gitignore, 코드가 키를 다루지 않음).
#
#   .env 변수:
#     PROVIDER=gms|openai|anthropic        # GMS는 OpenAI 호환으로 호출
#     LLM_API_KEY=...                       # 키 (직접 입력)
#     LLM_BASE_URL=https://.../v1           # openai/gms 엔드포인트 (anthropic은 무시)
#     LLM_MODEL=gpt-4o-mini                 # 모델명
#     PRICE_IN=0.15  PRICE_OUT=0.60         # USD per 1M tokens (모델에 맞게)
#
#   사용: python3 measure_caption.py        # 3개 카드 분 측정 후 평균 출력
import os, sys, json, time, urllib.request, urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))

def load_env():
    env = dict(os.environ)
    p = os.path.join(HERE, '.env')
    if os.path.exists(p):
        for line in open(p):
            line = line.strip()
            if not line or line.startswith('#') or '=' not in line:
                continue
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
    return env

# 입력: 검출된 객체 라벨 + 메타 (Vision/세그 결과에서 옴). 출력: 짧은 노트들.
CARDS = [
    {'place': '전주 객리단길', 'mood': '따뜻한 저녁, 여럿이 나눠 먹는 식탁',
     'objects': ['크림 파스타 접시', '감자 요리 접시', '감자튀김 그릇', '치킨 접시', '콜라']},
    {'place': '부산 자갈치시장', 'mood': '바다 앞, 지글지글 철판',
     'objects': ['야끼소바', '회', '밑반찬', '양념장']},
    {'place': '대구 서문시장', 'mood': '분식, 소소하지만 확실한 행복',
     'objects': ['치즈 떡볶이', '비빔밥', '꽈배기']},
]

def build_prompt(card):
    return (
        "다음 음식 사진의 객체별로 인스타 감성 손글씨 메모를 만들어줘. "
        "각 메모는 1~2줄, 짧고 감성적으로. JSON만 출력.\n"
        f"장소: {card['place']} / 분위기: {card['mood']}\n"
        f"객체: {', '.join(card['objects'])}\n"
        '형식: {"objects":[{"label":"...","note":"..."}], "closing":"..."}'
    )

def call_openai(env, prompt):
    url = env.get('LLM_BASE_URL', 'https://api.openai.com/v1').rstrip('/') + '/chat/completions'
    body = json.dumps({
        'model': env['LLM_MODEL'],
        'messages': [{'role': 'user', 'content': prompt}],
        'temperature': 0.8,
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        'Authorization': 'Bearer ' + env['LLM_API_KEY'], 'Content-Type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    u = r.get('usage', {})
    return r['choices'][0]['message']['content'], u.get('prompt_tokens', 0), u.get('completion_tokens', 0)

def call_anthropic(env, prompt):
    url = 'https://api.anthropic.com/v1/messages'
    body = json.dumps({
        'model': env['LLM_MODEL'], 'max_tokens': 400,
        'messages': [{'role': 'user', 'content': prompt}],
    }).encode()
    req = urllib.request.Request(url, data=body, headers={
        'x-api-key': env['LLM_API_KEY'], 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json'})
    r = json.load(urllib.request.urlopen(req, timeout=60))
    u = r.get('usage', {})
    return r['content'][0]['text'], u.get('input_tokens', 0), u.get('output_tokens', 0)

def main():
    env = load_env()
    if not env.get('LLM_API_KEY'):
        print('poc/card/.env 에 LLM_API_KEY 등을 먼저 채워주세요 (.env.example 안내 참고).'); sys.exit(1)
    provider = env.get('PROVIDER', 'openai').lower()
    caller = call_anthropic if provider == 'anthropic' else call_openai
    pin = float(env.get('PRICE_IN', 0.15)); pout = float(env.get('PRICE_OUT', 0.6))
    print(f'provider={provider} model={env.get("LLM_MODEL")}  (price in={pin} out={pout} /1M)')
    tin = tout = 0.0; tlat = 0.0
    for i, card in enumerate(CARDS):
        t0 = time.time()
        try:
            text, ci, co = caller(env, build_prompt(card))
        except urllib.error.HTTPError as e:
            print(f'  카드{i+1} 호출 실패: {e.code} {e.read().decode()[:200]}'); continue
        dt = time.time() - t0
        cost = ci * pin / 1e6 + co * pout / 1e6
        tin += ci; tout += co; tlat += dt
        print(f'  카드{i+1} [{card["place"]}] in={ci} out={co} tok · {dt:.2f}s · ${cost:.5f}')
    n = len(CARDS)
    avg_cost = (tin * pin + tout * pout) / 1e6 / n
    print(f'\n평균/카드: in={tin/n:.0f} out={tout/n:.0f} tok · {tlat/n:.2f}s · ${avg_cost:.5f}')
    print(f'(H5 목표 ≤$0.03, H6 ≤5s 대비)')

if __name__ == '__main__':
    main()
