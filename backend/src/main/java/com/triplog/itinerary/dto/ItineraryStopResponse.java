package com.triplog.itinerary.dto;

import com.triplog.itinerary.domain.ItineraryStop;

import java.time.format.DateTimeFormatter;

public record ItineraryStopResponse(
        Long id,
        Integer dayNumber,
        Integer sortOrder,
        String selectedTime,
        String memo,
        String transport,
        TravelEstimateResponse travelFromPrevious,
        ItineraryPlaceResponse place
) {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");

    public static ItineraryStopResponse from(ItineraryStop stop) {
        return new ItineraryStopResponse(
                stop.getId(),
                stop.getDayNumber(),
                stop.getSortOrder(),
                stop.getSelectedTime() == null ? null : stop.getSelectedTime().format(TIME_FORMATTER),
                stop.getMemo(),
                stop.getTransport(),
                TravelEstimateResponse.from(stop),
                ItineraryPlaceResponse.from(stop));
    }
}
