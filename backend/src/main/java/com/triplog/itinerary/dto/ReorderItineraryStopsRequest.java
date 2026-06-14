package com.triplog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;

import java.util.List;

@Schema(description = "날짜별 stop 순서 변경 요청")
public record ReorderItineraryStopsRequest(
        @Schema(description = "해당 day의 현재 stop id 전체를 원하는 순서대로 전달", example = "[3, 1, 2]")
        @NotEmpty(message = "stopIds is required")
        List<Long> stopIds
) {
}
