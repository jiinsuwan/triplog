package com.triplog.card.domain;

import java.time.LocalDate;

/** /logs 폴라로이드용 추억 요약. 추억 단위는 여행 1개다. */
public class MemorySummary {

    private Long tripId;
    private String title;
    private LocalDate startDate;
    private LocalDate endDate;
    private String region;
    private String theme;
    private long cardCount;
    private Long coverCardId;
    private Integer coverWidth;
    private Integer coverHeight;

    public Long getTripId() {
        return tripId;
    }

    public void setTripId(Long tripId) {
        this.tripId = tripId;
    }

    public String getTitle() {
        return title;
    }

    public void setTitle(String title) {
        this.title = title;
    }

    public LocalDate getStartDate() {
        return startDate;
    }

    public void setStartDate(LocalDate startDate) {
        this.startDate = startDate;
    }

    public LocalDate getEndDate() {
        return endDate;
    }

    public void setEndDate(LocalDate endDate) {
        this.endDate = endDate;
    }

    public String getRegion() {
        return region;
    }

    public void setRegion(String region) {
        this.region = region;
    }

    public String getTheme() {
        return theme;
    }

    public void setTheme(String theme) {
        this.theme = theme;
    }

    public long getCardCount() {
        return cardCount;
    }

    public void setCardCount(long cardCount) {
        this.cardCount = cardCount;
    }

    public Long getCoverCardId() {
        return coverCardId;
    }

    public void setCoverCardId(Long coverCardId) {
        this.coverCardId = coverCardId;
    }

    public Integer getCoverWidth() {
        return coverWidth;
    }

    public void setCoverWidth(Integer coverWidth) {
        this.coverWidth = coverWidth;
    }

    public Integer getCoverHeight() {
        return coverHeight;
    }

    public void setCoverHeight(Integer coverHeight) {
        this.coverHeight = coverHeight;
    }
}
