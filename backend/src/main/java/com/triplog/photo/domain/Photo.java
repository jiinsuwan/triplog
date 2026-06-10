package com.triplog.photo.domain;

import java.time.LocalDateTime;

/**
 * 업로드된 사진의 메타.
 * EXIF(taken_at/lat/lng)는 S2-LOG-02(#36)에서 채운다. 여행 연결(trip_id)은 S2-LOG-03(#37).
 */
public class Photo {

    private Long id;
    private Long userId;
    private String originalFilename;
    private String storedFilename;
    private String contentType;
    private long sizeBytes;
    private LocalDateTime createdAt;
    // EXIF(S2-LOG-02 #36) — 없는 사진은 null. 위도·경도는 항상 세트(둘 다 있거나 둘 다 null).
    private LocalDateTime takenAt;
    private Double latitude;
    private Double longitude;
    // 여행 연결(S2-LOG-03 #37) — 연결 안 된 사진은 null
    private Long tripId;

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

    public LocalDateTime getTakenAt() {
        return takenAt;
    }

    public void setTakenAt(LocalDateTime takenAt) {
        this.takenAt = takenAt;
    }

    public Double getLatitude() {
        return latitude;
    }

    public void setLatitude(Double latitude) {
        this.latitude = latitude;
    }

    public Double getLongitude() {
        return longitude;
    }

    public void setLongitude(Double longitude) {
        this.longitude = longitude;
    }

    public Long getTripId() {
        return tripId;
    }

    public void setTripId(Long tripId) {
        this.tripId = tripId;
    }
}
