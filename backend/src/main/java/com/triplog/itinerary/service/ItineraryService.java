package com.triplog.itinerary.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.itinerary.domain.ItineraryPlaceSource;
import com.triplog.itinerary.domain.ItineraryStop;
import com.triplog.itinerary.domain.TransportMode;
import com.triplog.itinerary.dto.CreateItineraryStopRequest;
import com.triplog.itinerary.dto.ItineraryDayResponse;
import com.triplog.itinerary.dto.ItineraryPlaceRequest;
import com.triplog.itinerary.dto.ItineraryResponse;
import com.triplog.itinerary.dto.ItineraryStopResponse;
import com.triplog.itinerary.dto.ItineraryTripResponse;
import com.triplog.itinerary.dto.ReorderItineraryStopsRequest;
import com.triplog.itinerary.dto.UpdateItineraryStopRequest;
import com.triplog.itinerary.mapper.ItineraryStopMapper;
import com.triplog.place.domain.Place;
import com.triplog.place.mapper.PlaceMapper;
import com.triplog.trip.domain.Trip;
import com.triplog.trip.mapper.TripMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.time.temporal.ChronoUnit;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

@Service
public class ItineraryService {

    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm");
    private static final int REORDER_OFFSET_BASE = 1000;

    private final TripMapper tripMapper;
    private final PlaceMapper placeMapper;
    private final ItineraryStopMapper itineraryStopMapper;

    public ItineraryService(TripMapper tripMapper,
                            PlaceMapper placeMapper,
                            ItineraryStopMapper itineraryStopMapper) {
        this.tripMapper = tripMapper;
        this.placeMapper = placeMapper;
        this.itineraryStopMapper = itineraryStopMapper;
    }

    @Transactional(readOnly = true)
    public ItineraryResponse get(Long userId, Long tripId) {
        Trip trip = requireOwnedTrip(userId, tripId);
        return buildResponse(trip, itineraryStopMapper.findByTripId(trip.getId()));
    }

    @Transactional
    public ItineraryStopResponse createStop(Long userId, Long tripId, Integer dayNumber,
                                            CreateItineraryStopRequest request) {
        Trip trip = requireOwnedTrip(userId, tripId);
        validateDayNumber(trip, dayNumber);

        ItineraryStop stop = toNewStop(trip.getId(), dayNumber, request);
        int maxSortOrder = itineraryStopMapper.findMaxSortOrder(trip.getId(), dayNumber);
        stop.setSortOrder(maxSortOrder + 1);
        itineraryStopMapper.insert(stop);

        return ItineraryStopResponse.from(requireStop(trip.getId(), dayNumber, stop.getId()));
    }

    @Transactional
    public ItineraryStopResponse updateStop(Long userId, Long tripId, Integer dayNumber, Long stopId,
                                            UpdateItineraryStopRequest request) {
        Trip trip = requireOwnedTrip(userId, tripId);
        validateDayNumber(trip, dayNumber);

        ItineraryStop stop = requireStop(trip.getId(), dayNumber, stopId);
        stop.setSelectedTime(parseSelectedTime(request.selectedTime()));
        stop.setMemo(trimToNull(request.memo()));
        stop.setTransport(canonicalTransport(request.transport()));

        itineraryStopMapper.updateDetails(stop);
        return ItineraryStopResponse.from(requireStop(trip.getId(), dayNumber, stopId));
    }

    @Transactional
    public void deleteStop(Long userId, Long tripId, Integer dayNumber, Long stopId) {
        Trip trip = requireOwnedTrip(userId, tripId);
        validateDayNumber(trip, dayNumber);

        ItineraryStop stop = requireStop(trip.getId(), dayNumber, stopId);
        itineraryStopMapper.deleteById(stop.getId(), trip.getId(), dayNumber);
        itineraryStopMapper.decrementSortOrdersAfter(trip.getId(), dayNumber, stop.getSortOrder());
    }

    @Transactional
    public ItineraryResponse reorderStops(Long userId, Long tripId, Integer dayNumber,
                                          ReorderItineraryStopsRequest request) {
        Trip trip = requireOwnedTrip(userId, tripId);
        validateDayNumber(trip, dayNumber);

        List<ItineraryStop> currentStops = itineraryStopMapper.findByTripIdAndDay(trip.getId(), dayNumber);
        validateReorderRequest(currentStops, request.stopIds());

        int offset = currentStops.size() + REORDER_OFFSET_BASE;
        itineraryStopMapper.bumpSortOrders(trip.getId(), dayNumber, offset);
        for (int index = 0; index < request.stopIds().size(); index++) {
            int updated = itineraryStopMapper.updateSortOrder(request.stopIds().get(index), trip.getId(), dayNumber, index + 1);
            if (updated != 1) {
                throw new BusinessException(ErrorCode.ITIN_INVALID_REORDER);
            }
        }

        return buildResponse(trip, itineraryStopMapper.findByTripId(trip.getId()));
    }

    private ItineraryResponse buildResponse(Trip trip, List<ItineraryStop> stops) {
        Map<Integer, List<ItineraryStopResponse>> stopsByDay = stops.stream()
                .collect(Collectors.groupingBy(
                        ItineraryStop::getDayNumber,
                        Collectors.mapping(ItineraryStopResponse::from, Collectors.toList())));

        int dayCount = dayCount(trip);
        List<ItineraryDayResponse> days = IntStream.rangeClosed(1, dayCount)
                .mapToObj(dayNumber -> new ItineraryDayResponse(
                        dayNumber,
                        trip.getStartDate().plusDays(dayNumber - 1L),
                        stopsByDay.getOrDefault(dayNumber, List.of())))
                .toList();

        return new ItineraryResponse(ItineraryTripResponse.from(trip), dayCount, days);
    }

    private ItineraryStop toNewStop(Long tripId, Integer dayNumber, CreateItineraryStopRequest request) {
        ItineraryStop stop = new ItineraryStop();
        stop.setTripId(tripId);
        stop.setDayNumber(dayNumber);
        stop.setSelectedTime(parseSelectedTime(request.selectedTime()));
        stop.setMemo(trimToNull(request.memo()));
        stop.setTransport(canonicalTransport(request.transport()));
        applyPlaceSnapshot(stop, request.place());
        return stop;
    }

    private void applyPlaceSnapshot(ItineraryStop stop, ItineraryPlaceRequest placeRequest) {
        ItineraryPlaceSource source = ItineraryPlaceSource.from(placeRequest.source())
                .orElseThrow(() -> new BusinessException(ErrorCode.ITIN_INVALID_INPUT));
        if (source == ItineraryPlaceSource.DB) {
            applyDbPlaceSnapshot(stop, placeRequest.dbPlaceId());
            return;
        }
        applyKakaoPlaceSnapshot(stop, placeRequest);
    }

    private void applyDbPlaceSnapshot(ItineraryStop stop, Long dbPlaceId) {
        if (dbPlaceId == null || dbPlaceId <= 0) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_INPUT);
        }
        Place place = placeMapper.findById(dbPlaceId);
        if (place == null) {
            throw new BusinessException(ErrorCode.PLACE_NOT_FOUND);
        }

        stop.setPlaceSource(ItineraryPlaceSource.DB.name());
        stop.setPlaceProvider(place.getSource());
        stop.setDbPlaceId(place.getId());
        stop.setSourcePlaceId(place.getSourceId());
        stop.setPlaceType(place.getPlaceType());
        stop.setPlaceName(place.getName());
        stop.setCategory(place.getCategory());
        stop.setCategoryGroup(place.getCategory());
        stop.setRegion1(place.getRegion1());
        stop.setRegion2(place.getRegion2());
        stop.setAddress(place.getAddress());
        stop.setRoadAddress(place.getRoadAddress());
        stop.setLatitude(place.getLatitude());
        stop.setLongitude(place.getLongitude());
        stop.setPhone(place.getPhone());
        stop.setPlaceUrl(place.getHomepage());
    }

    private void applyKakaoPlaceSnapshot(ItineraryStop stop, ItineraryPlaceRequest placeRequest) {
        String sourcePlaceId = requireText(placeRequest.sourcePlaceId());
        String placeType = requireText(placeRequest.placeType());
        String name = requireText(placeRequest.name());
        BigDecimal latitude = requireCoordinate(placeRequest.latitude());
        BigDecimal longitude = requireCoordinate(placeRequest.longitude());

        stop.setPlaceSource(ItineraryPlaceSource.KAKAO.name());
        stop.setPlaceProvider(ItineraryPlaceSource.KAKAO.name());
        stop.setDbPlaceId(null);
        stop.setSourcePlaceId(sourcePlaceId);
        stop.setPlaceType(placeType);
        stop.setPlaceName(name);
        stop.setCategory(trimToNull(placeRequest.category()));
        stop.setCategoryGroup(trimToNull(placeRequest.categoryGroup()));
        stop.setRegion1(trimToNull(placeRequest.region1()));
        stop.setRegion2(trimToNull(placeRequest.region2()));
        stop.setAddress(trimToNull(placeRequest.address()));
        stop.setRoadAddress(trimToNull(placeRequest.roadAddress()));
        stop.setLatitude(latitude);
        stop.setLongitude(longitude);
        stop.setPhone(trimToNull(placeRequest.phone()));
        stop.setPlaceUrl(trimToNull(placeRequest.placeUrl()));
    }

    private void validateReorderRequest(List<ItineraryStop> currentStops, List<Long> requestedStopIds) {
        if (requestedStopIds == null || requestedStopIds.isEmpty()) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_REORDER);
        }
        Set<Long> requestedSet = new HashSet<>(requestedStopIds);
        if (requestedSet.size() != requestedStopIds.size()) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_REORDER);
        }

        Set<Long> currentSet = currentStops.stream()
                .map(ItineraryStop::getId)
                .collect(Collectors.toSet());
        if (!currentSet.equals(requestedSet)) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_REORDER);
        }
    }

    private ItineraryStop requireStop(Long tripId, Integer dayNumber, Long stopId) {
        if (stopId == null || stopId <= 0) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_INPUT);
        }
        ItineraryStop stop = itineraryStopMapper.findByIdAndTripAndDay(stopId, tripId, dayNumber);
        if (stop == null) {
            throw new BusinessException(ErrorCode.ITIN_STOP_NOT_FOUND);
        }
        return stop;
    }

    private Trip requireOwnedTrip(Long userId, Long tripId) {
        validateUserId(userId);
        if (tripId == null || tripId <= 0) {
            throw new BusinessException(ErrorCode.TRIP_INVALID_INPUT);
        }

        Trip trip = tripMapper.findById(tripId);
        if (trip == null) {
            throw new BusinessException(ErrorCode.TRIP_NOT_FOUND);
        }
        if (!userId.equals(trip.getUserId())) {
            throw new BusinessException(ErrorCode.TRIP_ACCESS_DENIED);
        }
        return trip;
    }

    private void validateDayNumber(Trip trip, Integer dayNumber) {
        if (dayNumber == null || dayNumber < 1 || dayNumber > dayCount(trip)) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_INPUT);
        }
    }

    private int dayCount(Trip trip) {
        return Math.toIntExact(ChronoUnit.DAYS.between(trip.getStartDate(), trip.getEndDate()) + 1);
    }

    private String canonicalTransport(String transport) {
        return TransportMode.from(transport)
                .map(TransportMode::value)
                .orElseThrow(() -> new BusinessException(ErrorCode.ITIN_INVALID_INPUT));
    }

    private LocalTime parseSelectedTime(String selectedTime) {
        String value = trimToNull(selectedTime);
        if (value == null) {
            return null;
        }
        try {
            return LocalTime.parse(value, TIME_FORMATTER);
        } catch (DateTimeParseException e) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_INPUT);
        }
    }

    private String requireText(String value) {
        if (!StringUtils.hasText(value)) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_INPUT);
        }
        return value.trim();
    }

    private BigDecimal requireCoordinate(BigDecimal coordinate) {
        if (coordinate == null) {
            throw new BusinessException(ErrorCode.ITIN_INVALID_INPUT);
        }
        return coordinate;
    }

    private String trimToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private void validateUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
    }
}
