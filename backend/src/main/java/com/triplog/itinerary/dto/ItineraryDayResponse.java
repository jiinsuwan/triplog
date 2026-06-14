package com.triplog.itinerary.dto;

import java.time.LocalDate;
import java.util.List;

public record ItineraryDayResponse(
        Integer dayNumber,
        LocalDate date,
        List<ItineraryStopResponse> stops
) {
}
