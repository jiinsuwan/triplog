package com.triplog.photo.domain;

import java.time.LocalDateTime;

/**
 * 사진 1건의 윤곽선 전처리 결과 (S3-LOG-02 #70).
 * 추론 서버(inference/)가 계산한 items(폴리곤·앵커)의 정본(SoT). 추론 서버 캐시는 휘발성이므로 여기 영속한다.
 * 업로드 시 PENDING 으로 생성되고, 백그라운드 전처리가 READY(items 채움)/FAILED 로 갱신한다.
 */
public class PhotoOutline {

    private Long photoId;
    private OutlineStatus status;
    private String items;       // JSON 원문(객체별 폴리곤·앵커) — 완료 시에만, OUTLINE_API §1
    private String error;       // 실패 사유 요약(FAILED 시)
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;

    public Long getPhotoId() {
        return photoId;
    }

    public void setPhotoId(Long photoId) {
        this.photoId = photoId;
    }

    public OutlineStatus getStatus() {
        return status;
    }

    public void setStatus(OutlineStatus status) {
        this.status = status;
    }

    public String getItems() {
        return items;
    }

    public void setItems(String items) {
        this.items = items;
    }

    public String getError() {
        return error;
    }

    public void setError(String error) {
        this.error = error;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(LocalDateTime updatedAt) {
        this.updatedAt = updatedAt;
    }
}
