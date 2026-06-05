package com.triplog.trip.dto;

import com.triplog.trip.domain.Trip;

import java.time.LocalDate;
import java.time.LocalDateTime;

public record TripResponse(
        Long id,
        Long userId,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        String region,
        String theme,
        String status,
        LocalDateTime createdAt
) {

    public static TripResponse from(Trip trip) {
        return new TripResponse(
                trip.getId(),
                trip.getUserId(),
                trip.getTitle(),
                trip.getStartDate(),
                trip.getEndDate(),
                trip.getRegion(),
                trip.getTheme(),
                trip.getStatus(),
                trip.getCreatedAt());
    }
}
