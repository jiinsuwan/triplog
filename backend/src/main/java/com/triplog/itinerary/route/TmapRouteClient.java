package com.triplog.itinerary.route;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.external.ExternalApiClient;
import com.triplog.common.external.ExternalApiRequest;
import com.triplog.common.external.ExternalApiResponse;
import com.triplog.itinerary.domain.ItineraryStop;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.net.URI;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

@Component
public class TmapRouteClient {

    public static final String PROVIDER = "tmap";

    private final ExternalApiClient externalApiClient;
    private final TmapRouteProperties properties;
    private final ObjectMapper objectMapper;

    public TmapRouteClient(ExternalApiClient externalApiClient,
                           TmapRouteProperties properties,
                           ObjectMapper objectMapper) {
        this.externalApiClient = externalApiClient;
        this.properties = properties;
        this.objectMapper = objectMapper;
    }

    public boolean isConfigured() {
        return properties.hasAppKey();
    }

    public RouteEstimate estimateCar(ItineraryStop from, ItineraryStop to) {
        return estimate("/tmap/routes?version=1", carBody(from, to));
    }

    public RouteEstimate estimateWalk(ItineraryStop from, ItineraryStop to) {
        return estimate("/tmap/routes/pedestrian?version=1", walkBody(from, to));
    }

    private RouteEstimate estimate(String path, Map<String, Object> body) {
        ExternalApiResponse response = externalApiClient.exchange(ExternalApiRequest
                .post(PROVIDER, URI.create(stripTrailingSlash(properties.getRouteBaseUrl()) + path))
                .header("Accept", "application/json")
                .header("Content-Type", "application/json")
                .header("appKey", properties.getAppKey())
                .body(toJson(body))
                .build());

        return parseEstimate(response.body())
                .orElseThrow(() -> new IllegalStateException("TMAP route response has no total estimate."));
    }

    private Map<String, Object> carBody(ItineraryStop from, ItineraryStop to) {
        Map<String, Object> body = coordinateBody(from, to);
        body.put("reqCoordType", "WGS84GEO");
        body.put("resCoordType", "WGS84GEO");
        body.put("searchOption", "0");
        body.put("trafficInfo", "N");
        return body;
    }

    private Map<String, Object> walkBody(ItineraryStop from, ItineraryStop to) {
        Map<String, Object> body = coordinateBody(from, to);
        body.put("startName", encodedName(from, "start"));
        body.put("endName", encodedName(to, "end"));
        body.put("reqCoordType", "WGS84GEO");
        body.put("resCoordType", "WGS84GEO");
        body.put("searchOption", "0");
        body.put("sort", "index");
        return body;
    }

    private Map<String, Object> coordinateBody(ItineraryStop from, ItineraryStop to) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("startX", coordinate(from.getLongitude()));
        body.put("startY", coordinate(from.getLatitude()));
        body.put("endX", coordinate(to.getLongitude()));
        body.put("endY", coordinate(to.getLatitude()));
        return body;
    }

    private Optional<RouteEstimate> parseEstimate(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            return findEstimateNode(root)
                    .map(node -> new RouteEstimate(
                            positiveInt(node.get("totalTime")),
                            positiveInt(node.get("totalDistance")),
                            routeGeometryJson(root)));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("TMAP route response is not valid JSON.", e);
        }
    }

    private Optional<JsonNode> findEstimateNode(JsonNode node) {
        if (node == null || node.isNull()) {
            return Optional.empty();
        }
        if (node.has("totalTime") && node.has("totalDistance")) {
            return Optional.of(node);
        }
        if (node.isObject()) {
            Iterator<JsonNode> fields = node.elements();
            while (fields.hasNext()) {
                Optional<JsonNode> match = findEstimateNode(fields.next());
                if (match.isPresent()) {
                    return match;
                }
            }
        }
        if (node.isArray()) {
            for (JsonNode child : node) {
                Optional<JsonNode> match = findEstimateNode(child);
                if (match.isPresent()) {
                    return match;
                }
            }
        }
        return Optional.empty();
    }

    private String routeGeometryJson(JsonNode root) {
        List<List<BigDecimal>> points = new ArrayList<>();
        collectRouteGeometry(root, points);
        if (points.size() < 2) {
            return null;
        }
        try {
            return objectMapper.writeValueAsString(points);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize TMAP route geometry.", e);
        }
    }

    private void collectRouteGeometry(JsonNode node, List<List<BigDecimal>> points) {
        if (node == null || node.isNull()) {
            return;
        }
        if (node.isObject() && node.has("type") && node.has("coordinates")) {
            String type = node.get("type").asText();
            JsonNode coordinates = node.get("coordinates");
            if ("LineString".equals(type)) {
                appendLineString(coordinates, points);
                return;
            }
            if ("MultiLineString".equals(type) && coordinates.isArray()) {
                coordinates.forEach(line -> appendLineString(line, points));
                return;
            }
        }
        if (node.isObject() || node.isArray()) {
            node.elements().forEachRemaining(child -> collectRouteGeometry(child, points));
        }
    }

    private void appendLineString(JsonNode coordinates, List<List<BigDecimal>> points) {
        if (coordinates == null || !coordinates.isArray()) {
            return;
        }
        coordinates.forEach(coordinate -> appendCoordinate(coordinate, points));
    }

    private void appendCoordinate(JsonNode coordinate, List<List<BigDecimal>> points) {
        if (coordinate == null || !coordinate.isArray() || coordinate.size() < 2) {
            return;
        }
        BigDecimal longitude = coordinate.get(0).decimalValue();
        BigDecimal latitude = coordinate.get(1).decimalValue();
        List<BigDecimal> point = List.of(latitude, longitude);
        if (!points.isEmpty() && points.get(points.size() - 1).equals(point)) {
            return;
        }
        points.add(point);
    }

    private Integer positiveInt(JsonNode node) {
        if (node == null || node.isNull()) {
            return null;
        }
        int value = node.asInt();
        return value >= 0 ? value : null;
    }

    private String toJson(Map<String, Object> body) {
        try {
            return objectMapper.writeValueAsString(body);
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("Failed to serialize TMAP route request.", e);
        }
    }

    private String encodedName(ItineraryStop stop, String fallback) {
        String name = stop.getPlaceName();
        String value = name == null || name.isBlank() ? fallback : name;
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String coordinate(BigDecimal value) {
        return value.stripTrailingZeros().toPlainString();
    }

    private String stripTrailingSlash(String value) {
        if (value == null || value.isBlank()) {
            return "https://apis.openapi.sk.com";
        }
        return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
    }
}
