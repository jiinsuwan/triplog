package com.triplog.place.dto;

import com.triplog.place.domain.PlaceRegion;

public record PlaceRegionResponse(String region1, String region2, long count) {

    public static PlaceRegionResponse from(PlaceRegion region) {
        return new PlaceRegionResponse(region.getRegion1(), region.getRegion2(), region.getCount());
    }
}
