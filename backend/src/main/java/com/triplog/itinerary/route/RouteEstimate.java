package com.triplog.itinerary.route;

public record RouteEstimate(
        Integer durationSeconds,
        Integer distanceMeters,
        String geometryJson
) {
}
