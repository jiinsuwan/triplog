package com.triplog.card.dto;

import com.triplog.card.domain.MemorySummary;

import java.time.LocalDate;

public record MemorySummaryResponse(
        Long tripId,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        String region,
        String theme,
        long cardCount,
        boolean completed,
        Long coverCardId,
        Integer coverWidth,
        Integer coverHeight,
        String coverImageUrl) {

    public static MemorySummaryResponse from(MemorySummary memory) {
        Long coverCardId = memory.getCoverCardId();
        return new MemorySummaryResponse(
                memory.getTripId(),
                memory.getTitle(),
                memory.getStartDate(),
                memory.getEndDate(),
                memory.getRegion(),
                memory.getTheme(),
                memory.getCardCount(),
                memory.getCardCount() > 0,
                coverCardId,
                memory.getCoverWidth(),
                memory.getCoverHeight(),
                coverCardId == null ? null : "/cards/" + coverCardId + "/image");
    }
}
