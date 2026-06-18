package com.triplog.itinerary.dto;

import java.math.BigDecimal;

public record TravelRoutePointResponse(
        BigDecimal latitude,
        BigDecimal longitude
) {
}
