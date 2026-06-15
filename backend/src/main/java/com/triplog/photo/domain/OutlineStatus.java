package com.triplog.photo.domain;

/**
 * 사진 윤곽선 전처리 상태 (S3-LOG-02 #70).
 * 업로드 시 PENDING 으로 생성되고, 백그라운드 전처리가 READY(성공) / FAILED(실패)로 갱신한다.
 */
public enum OutlineStatus {
    PENDING,
    READY,
    FAILED
}
