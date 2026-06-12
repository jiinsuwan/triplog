package com.triplog.trip.domain;

import java.util.Arrays;
import java.util.Optional;

public enum TripStatus {
    PLANNING("planning"),
    UPCOMING("upcoming"),
    PAST("past");

    private final String value;

    TripStatus(String value) {
        this.value = value;
    }

    public String value() {
        return value;
    }

    public static Optional<TripStatus> from(String value) {
        if (value == null) {
            return Optional.empty();
        }
        String canonical = value.trim();
        return Arrays.stream(values())
                .filter(status -> status.value.equals(canonical))
                .findFirst();
    }

    public static boolean isSupported(String value) {
        return from(value).isPresent();
    }
}
