package com.triplog.itinerary.dto;

import com.triplog.trip.domain.Trip;

import java.time.LocalDate;

public record ItineraryTripResponse(
        Long id,
        String title,
        LocalDate startDate,
        LocalDate endDate,
        String status
) {

    public static ItineraryTripResponse from(Trip trip) {
        return new ItineraryTripResponse(
                trip.getId(),
                trip.getTitle(),
                trip.getStartDate(),
                trip.getEndDate(),
                trip.getStatus());
    }
}
