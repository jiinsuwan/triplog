package com.triplog.trip.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record CreateTripRequest(
        @NotBlank
        @Size(max = 100)
        String title,

        @NotNull
        LocalDate startDate,

        @NotNull
        LocalDate endDate,

        @NotBlank
        @Size(max = 100)
        String region,

        @NotBlank
        @Size(max = 50)
        String theme,

        @NotBlank
        @Size(max = 30)
        String status
) {
}
