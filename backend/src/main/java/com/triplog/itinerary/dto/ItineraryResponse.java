package com.triplog.itinerary.dto;

import java.util.List;

public record ItineraryResponse(
        ItineraryTripResponse trip,
        Integer dayCount,
        List<ItineraryDayResponse> days
) {
}
