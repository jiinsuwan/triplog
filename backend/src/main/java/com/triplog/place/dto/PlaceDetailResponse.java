package com.triplog.place.dto;

import com.triplog.place.domain.Place;

import java.math.BigDecimal;

public record PlaceDetailResponse(
        Long id,
        String source,
        String sourceId,
        String placeType,
        String name,
        String category,
        String region1,
        String region2,
        String address,
        String roadAddress,
        BigDecimal latitude,
        BigDecimal longitude,
        String phone,
        String summary,
        String description,
        String facilities,
        String homepage,
        String imageUrl) {

    public static PlaceDetailResponse from(Place place) {
        return new PlaceDetailResponse(
                place.getId(),
                place.getSource(),
                place.getSourceId(),
                place.getPlaceType(),
                place.getName(),
                place.getCategory(),
                place.getRegion1(),
                place.getRegion2(),
                place.getAddress(),
                place.getRoadAddress(),
                place.getLatitude(),
                place.getLongitude(),
                place.getPhone(),
                place.getSummary(),
                place.getDescription(),
                place.getFacilities(),
                place.getHomepage(),
                place.getImageUrl());
    }
}
