package com.triplog.photo.domain;

import java.time.LocalDateTime;

/**
 * 업로드된 사진의 메타. S2-LOG-01(#35)이 다루는 칸만 모델링한다.
 * EXIF(taken_at/lat/lng, #36)·여행 연결(trip_id, #37) 칸은 해당 이슈에서 도메인에 추가한다.
 */
public class Photo {

    private Long id;
    private Long userId;
    private String originalFilename;
    private String storedFilename;
    private String contentType;
    private long sizeBytes;
    private LocalDateTime createdAt;

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Long getUserId() {
        return userId;
    }

    public void setUserId(Long userId) {
        this.userId = userId;
    }

    public String getOriginalFilename() {
        return originalFilename;
    }

    public void setOriginalFilename(String originalFilename) {
        this.originalFilename = originalFilename;
    }

    public String getStoredFilename() {
        return storedFilename;
    }

    public void setStoredFilename(String storedFilename) {
        this.storedFilename = storedFilename;
    }

    public String getContentType() {
        return contentType;
    }

    public void setContentType(String contentType) {
        this.contentType = contentType;
    }

    public long getSizeBytes() {
        return sizeBytes;
    }

    public void setSizeBytes(long sizeBytes) {
        this.sizeBytes = sizeBytes;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(LocalDateTime createdAt) {
        this.createdAt = createdAt;
    }
}
