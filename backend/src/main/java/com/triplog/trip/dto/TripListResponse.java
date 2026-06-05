package com.triplog.trip.dto;

import java.util.List;

public record TripListResponse(
        List<TripResponse> items,
        int page,
        long total
) {
}
