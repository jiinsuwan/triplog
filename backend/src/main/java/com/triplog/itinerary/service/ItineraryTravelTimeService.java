package com.triplog.itinerary.service;

import com.triplog.itinerary.domain.ItineraryStop;
import com.triplog.itinerary.domain.TransportMode;
import com.triplog.itinerary.mapper.ItineraryStopMapper;
import com.triplog.itinerary.route.RouteEstimate;
import com.triplog.itinerary.route.TmapRouteClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class ItineraryTravelTimeService {

    private static final Logger log = LoggerFactory.getLogger(ItineraryTravelTimeService.class);

    private static final String STATUS_ESTIMATED = "estimated";
    private static final String STATUS_FAILED = "failed";
    private static final String STATUS_MANUAL = "manual";
    private static final String STATUS_MANUAL_REQUIRED = "manual_required";
    private static final String STATUS_MISSING_COORDINATES = "missing_coordinates";
    private static final String STATUS_NOT_CONFIGURED = "not_configured";

    private final ItineraryStopMapper itineraryStopMapper;
    private final TmapRouteClient tmapRouteClient;

    public ItineraryTravelTimeService(ItineraryStopMapper itineraryStopMapper,
                                      TmapRouteClient tmapRouteClient) {
        this.itineraryStopMapper = itineraryStopMapper;
        this.tmapRouteClient = tmapRouteClient;
    }

    public void refreshDayTravelTimes(Long tripId, Integer dayNumber, List<ItineraryStop> stops) {
        if (stops == null || stops.isEmpty()) {
            return;
        }

        clearFirstStopIfNeeded(stops.get(0));
        for (int index = 1; index < stops.size(); index++) {
            refreshLeg(stops.get(index - 1), stops.get(index));
        }
    }

    public void applyManualTravelDuration(Long tripId, Integer dayNumber, List<ItineraryStop> stops,
                                          Long toStopId, Integer durationSeconds) {
        if (stops == null || durationSeconds == null || durationSeconds <= 0) {
            return;
        }

        for (int index = 1; index < stops.size(); index++) {
            ItineraryStop to = stops.get(index);
            if (!to.getId().equals(toStopId)) {
                continue;
            }
            ItineraryStop from = stops.get(index - 1);
            TransportMode mode = TransportMode.from(from.getTransport()).orElse(TransportMode.OTHER);
            if (mode != TransportMode.PUBLIC_TRANSIT) {
                return;
            }
            to.setTravelFromStopId(from.getId());
            to.setTravelRouteKey(routeKey(from, to));
            to.setTravelProvider(null);
            to.setTravelStatus(STATUS_MANUAL);
            to.setTravelDurationSeconds(durationSeconds);
            to.setTravelDistanceMeters(null);
            to.setTravelGeometryJson(null);
            to.setTravelUpdatedAt(LocalDateTime.now());
            itineraryStopMapper.updateTravelEstimate(to);
            return;
        }
    }

    private void clearFirstStopIfNeeded(ItineraryStop stop) {
        if (stop.getTravelStatus() == null
                && stop.getTravelRouteKey() == null
                && stop.getTravelFromStopId() == null) {
            return;
        }
        stop.setTravelFromStopId(null);
        stop.setTravelRouteKey(null);
        stop.setTravelProvider(null);
        stop.setTravelStatus(null);
        stop.setTravelDurationSeconds(null);
        stop.setTravelDistanceMeters(null);
        stop.setTravelGeometryJson(null);
        stop.setTravelUpdatedAt(null);
        itineraryStopMapper.updateTravelEstimate(stop);
    }

    private void refreshLeg(ItineraryStop from, ItineraryStop to) {
        String routeKey = routeKey(from, to);
        TransportMode mode = TransportMode.from(from.getTransport()).orElse(TransportMode.OTHER);
        if (canReuseTravelEstimate(to, routeKey, mode)) {
            return;
        }

        to.setTravelFromStopId(from.getId());
        to.setTravelRouteKey(routeKey);
        to.setTravelProvider(null);
        to.setTravelStatus(null);
        to.setTravelDurationSeconds(null);
        to.setTravelDistanceMeters(null);
        to.setTravelGeometryJson(null);
        to.setTravelUpdatedAt(LocalDateTime.now());

        if (!hasCoordinates(from) || !hasCoordinates(to)) {
            to.setTravelStatus(STATUS_MISSING_COORDINATES);
            itineraryStopMapper.updateTravelEstimate(to);
            return;
        }
        if (mode == TransportMode.PUBLIC_TRANSIT || mode == TransportMode.OTHER) {
            to.setTravelStatus(STATUS_MANUAL_REQUIRED);
            itineraryStopMapper.updateTravelEstimate(to);
            return;
        }
        if (!tmapRouteClient.isConfigured()) {
            to.setTravelProvider(TmapRouteClient.PROVIDER);
            to.setTravelStatus(STATUS_NOT_CONFIGURED);
            itineraryStopMapper.updateTravelEstimate(to);
            return;
        }

        try {
            log.info("TMAP route estimate request mode={} fromStopId={} toStopId={}",
                    mode.value(), from.getId(), to.getId());
            RouteEstimate estimate = mode == TransportMode.CAR
                    ? tmapRouteClient.estimateCar(from, to)
                    : tmapRouteClient.estimateWalk(from, to);
            to.setTravelProvider(TmapRouteClient.PROVIDER);
            to.setTravelStatus(STATUS_ESTIMATED);
            to.setTravelDurationSeconds(estimate.durationSeconds());
            to.setTravelDistanceMeters(estimate.distanceMeters());
            to.setTravelGeometryJson(estimate.geometryJson());
            log.info("TMAP route estimate success mode={} fromStopId={} toStopId={} durationSeconds={} distanceMeters={}",
                    mode.value(), from.getId(), to.getId(), estimate.durationSeconds(), estimate.distanceMeters());
        } catch (RuntimeException e) {
            log.warn("Travel estimate failed provider={} mode={} fromStopId={} toStopId={} cause={}",
                    TmapRouteClient.PROVIDER, mode.value(), from.getId(), to.getId(), e.getClass().getSimpleName());
            to.setTravelProvider(TmapRouteClient.PROVIDER);
            to.setTravelStatus(STATUS_FAILED);
        }
        itineraryStopMapper.updateTravelEstimate(to);
    }

    private boolean canReuseTravelEstimate(ItineraryStop stop, String routeKey, TransportMode mode) {
        if (!routeKey.equals(stop.getTravelRouteKey()) || stop.getTravelStatus() == null) {
            return false;
        }
        if ((mode == TransportMode.CAR || mode == TransportMode.WALK)
                && TmapRouteClient.PROVIDER.equals(stop.getTravelProvider())
                && STATUS_ESTIMATED.equals(stop.getTravelStatus())
                && isBlank(stop.getTravelGeometryJson())) {
            return false;
        }
        return true;
    }

    private boolean hasCoordinates(ItineraryStop stop) {
        return stop.getLatitude() != null && stop.getLongitude() != null;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private String routeKey(ItineraryStop from, ItineraryStop to) {
        return String.join(":",
                from.getTransport() == null ? TransportMode.OTHER.value() : from.getTransport(),
                coordinateKey(from.getLatitude()),
                coordinateKey(from.getLongitude()),
                coordinateKey(to.getLatitude()),
                coordinateKey(to.getLongitude()));
    }

    private String coordinateKey(BigDecimal value) {
        if (value == null) {
            return "null";
        }
        return value.setScale(6, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }
}
