package com.triplog.itinerary.dto;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.itinerary.domain.ItineraryStop;

import java.util.ArrayList;
import java.util.List;
import java.time.format.DateTimeFormatter;

public record TravelEstimateResponse(
        Long fromStopId,
        String mode,
        String provider,
        String status,
        Integer durationSeconds,
        Integer distanceMeters,
        List<TravelRoutePointResponse> routePath,
        String updatedAt
) {

    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ISO_LOCAL_DATE_TIME;
    private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper();

    public static TravelEstimateResponse from(ItineraryStop stop) {
        if (stop.getTravelStatus() == null) {
            return null;
        }
        return new TravelEstimateResponse(
                stop.getTravelFromStopId(),
                routeMode(stop),
                stop.getTravelProvider(),
                stop.getTravelStatus(),
                stop.getTravelDurationSeconds(),
                stop.getTravelDistanceMeters(),
                routePath(stop.getTravelGeometryJson()),
                stop.getTravelUpdatedAt() == null ? null : stop.getTravelUpdatedAt().format(DATE_TIME_FORMATTER));
    }

    private static String routeMode(ItineraryStop stop) {
        String routeKey = stop.getTravelRouteKey();
        if (routeKey == null || routeKey.isBlank()) {
            return stop.getTransport();
        }
        int separator = routeKey.indexOf(':');
        return separator > 0 ? routeKey.substring(0, separator) : stop.getTransport();
    }

    private static List<TravelRoutePointResponse> routePath(String geometryJson) {
        if (geometryJson == null || geometryJson.isBlank()) {
            return List.of();
        }
        try {
            JsonNode root = OBJECT_MAPPER.readTree(geometryJson);
            if (!root.isArray()) {
                return List.of();
            }
            List<TravelRoutePointResponse> points = new ArrayList<>();
            root.forEach(node -> {
                if (node.isArray() && node.size() >= 2) {
                    points.add(new TravelRoutePointResponse(
                            node.get(0).decimalValue(),
                            node.get(1).decimalValue()));
                }
            });
            return points;
        } catch (JsonProcessingException e) {
            return List.of();
        }
    }
}
