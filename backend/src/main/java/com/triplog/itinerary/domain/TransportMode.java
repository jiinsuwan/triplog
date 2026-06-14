package com.triplog.itinerary.domain;

import java.util.Arrays;
import java.util.Optional;

public enum TransportMode {

    WALK("walk"),
    CAR("car"),
    PUBLIC_TRANSIT("public_transit"),
    OTHER("other");

    private final String value;

    TransportMode(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static Optional<TransportMode> from(String value) {
        return Arrays.stream(values())
                .filter(mode -> mode.value.equals(value))
                .findFirst();
    }
}
