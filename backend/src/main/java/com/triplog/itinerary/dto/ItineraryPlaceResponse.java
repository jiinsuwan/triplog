package com.triplog.itinerary.dto;

import com.triplog.itinerary.domain.ItineraryStop;

import java.math.BigDecimal;

public record ItineraryPlaceResponse(
        String source,
        String provider,
        Long dbPlaceId,
        String sourcePlaceId,
        String placeType,
        String name,
        String category,
        String categoryGroup,
        String region1,
        String region2,
        String address,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String phone,
        String placeUrl
) {

    public static ItineraryPlaceResponse from(ItineraryStop stop) {
        return new ItineraryPlaceResponse(
                stop.getPlaceSource(),
                stop.getPlaceProvider(),
                stop.getDbPlaceId(),
                stop.getSourcePlaceId(),
                stop.getPlaceType(),
                stop.getPlaceName(),
                stop.getCategory(),
                stop.getCategoryGroup(),
                stop.getRegion1(),
                stop.getRegion2(),
                stop.getAddress(),
                stop.getRoadAddress(),
                stop.getLatitude(),
                stop.getLongitude(),
                stop.getPhone(),
                stop.getPlaceUrl());
    }
}
