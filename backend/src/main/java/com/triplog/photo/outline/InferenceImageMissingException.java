package com.triplog.photo.outline;

/**
 * 추론 서버에 해당 image_id 가 없을 때(404 'unknown image_id') (S4-LOG-01 #114).
 * 캐시 퇴출·서버 재시작으로 발생한다 — 보정 서비스가 이를 잡아 사진을 재등록해 복구한다(InferenceException 과 구분).
 */
public class InferenceImageMissingException extends InferenceException {

    public InferenceImageMissingException(String message) {
        super(message);
    }
}
