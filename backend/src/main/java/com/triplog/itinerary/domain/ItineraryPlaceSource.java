package com.triplog.itinerary.domain;

import java.util.Arrays;
import java.util.Optional;

public enum ItineraryPlaceSource {

    DB,
    KAKAO;

    public static Optional<ItineraryPlaceSource> from(String value) {
        return Arrays.stream(values())
                .filter(source -> source.name().equals(value))
                .findFirst();
    }
}
