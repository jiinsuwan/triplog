package com.triplog.itinerary.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.itinerary.domain.ItineraryStop;
import com.triplog.itinerary.dto.CreateItineraryStopRequest;
import com.triplog.itinerary.dto.ItineraryPlaceRequest;
import com.triplog.itinerary.dto.ReorderItineraryStopsRequest;
import com.triplog.itinerary.mapper.ItineraryStopMapper;
import com.triplog.place.domain.Place;
import com.triplog.place.mapper.PlaceMapper;
import com.triplog.trip.domain.Trip;
import com.triplog.trip.mapper.TripMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItineraryServiceTest {

    @Mock
    private TripMapper tripMapper;
    @Mock
    private PlaceMapper placeMapper;
    @Mock
    private ItineraryStopMapper itineraryStopMapper;

    private ItineraryService itineraryService;

    @BeforeEach
    void setUp() {
        itineraryService = new ItineraryService(tripMapper, placeMapper, itineraryStopMapper);
    }

    @Test
    void createStop_storesDbPlaceSnapshotWithRequiredTransport() {
        Trip trip = trip(10L, 1L);
        Place place = place(20L);
        when(tripMapper.findById(10L)).thenReturn(trip);
        when(placeMapper.findById(20L)).thenReturn(place);
        when(itineraryStopMapper.findMaxSortOrder(10L, 1)).thenReturn(0);
        when(itineraryStopMapper.findByIdAndTripAndDay(100L, 10L, 1)).thenReturn(insertedStop(100L));

        ArgumentCaptor<ItineraryStop> captor = ArgumentCaptor.forClass(ItineraryStop.class);
        org.mockito.Mockito.doAnswer(invocation -> {
            ItineraryStop stop = invocation.getArgument(0);
            stop.setId(100L);
            return 1;
        }).when(itineraryStopMapper).insert(any());

        itineraryService.createStop(1L, 10L, 1, new CreateItineraryStopRequest(
                "10:30",
                "오픈 직후",
                "walk",
                new ItineraryPlaceRequest(
                        "DB", 20L, null, null, null, null, null,
                        null, null, null, null, null, null, null, null)));

        verify(itineraryStopMapper).insert(captor.capture());
        ItineraryStop saved = captor.getValue();
        assertThat(saved.getTripId()).isEqualTo(10L);
        assertThat(saved.getDayNumber()).isEqualTo(1);
        assertThat(saved.getSortOrder()).isEqualTo(1);
        assertThat(saved.getTransport()).isEqualTo("walk");
        assertThat(saved.getPlaceSource()).isEqualTo("DB");
        assertThat(saved.getPlaceProvider()).isEqualTo("PUBLIC_TOURIST_STANDARD");
        assertThat(saved.getDbPlaceId()).isEqualTo(20L);
        assertThat(saved.getPlaceName()).isEqualTo("전주한옥마을");
    }

    @Test
    void createStop_rejectsUnsupportedTransport() {
        when(tripMapper.findById(10L)).thenReturn(trip(10L, 1L));

        assertThatThrownBy(() -> itineraryService.createStop(1L, 10L, 1, new CreateItineraryStopRequest(
                null,
                null,
                "taxi",
                kakaoPlaceRequest())))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ITIN_INVALID_INPUT));

        verify(itineraryStopMapper, never()).insert(any());
    }

    @Test
    void get_rejectsOtherUserTrip() {
        when(tripMapper.findById(10L)).thenReturn(trip(10L, 2L));

        assertThatThrownBy(() -> itineraryService.get(1L, 10L))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TRIP_ACCESS_DENIED));
    }

    @Test
    void reorder_rejectsMissingOrDuplicatedStopIds() {
        when(tripMapper.findById(10L)).thenReturn(trip(10L, 1L));
        ItineraryStop first = stopWithId(100L);
        ItineraryStop second = stopWithId(101L);
        when(itineraryStopMapper.findByTripIdAndDay(10L, 1)).thenReturn(List.of(first, second));

        assertThatThrownBy(() -> itineraryService.reorderStops(1L, 10L, 1,
                new ReorderItineraryStopsRequest(List.of(100L, 100L))))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.ITIN_INVALID_REORDER));

        verify(itineraryStopMapper, never()).bumpSortOrders(any(), any(), any());
    }

    private Trip trip(Long id, Long userId) {
        Trip trip = new Trip();
        trip.setId(id);
        trip.setUserId(userId);
        trip.setTitle("전주 여행");
        trip.setStartDate(LocalDate.of(2026, 7, 1));
        trip.setEndDate(LocalDate.of(2026, 7, 3));
        trip.setRegion("전주");
        trip.setTheme("미식");
        trip.setStatus("planning");
        return trip;
    }

    private Place place(Long id) {
        Place place = new Place();
        place.setId(id);
        place.setSource("PUBLIC_TOURIST_STANDARD");
        place.setSourceId("mock-jeonju-hanok");
        place.setPlaceType("ATTRACTION");
        place.setName("전주한옥마을");
        place.setCategory("관광지");
        place.setRegion1("전라북도");
        place.setRegion2("전주시");
        place.setAddress("전북 전주시 완산구");
        place.setRoadAddress("전북 전주시 완산구 기린대로");
        place.setLatitude(new BigDecimal("35.81500000"));
        place.setLongitude(new BigDecimal("127.15300000"));
        place.setPhone("063-000-0000");
        place.setHomepage("https://example.com");
        return place;
    }

    private ItineraryStop insertedStop(Long id) {
        ItineraryStop stop = stopWithId(id);
        stop.setTripId(10L);
        stop.setDayNumber(1);
        stop.setSortOrder(1);
        stop.setTransport("walk");
        stop.setPlaceSource("DB");
        stop.setPlaceProvider("PUBLIC_TOURIST_STANDARD");
        stop.setDbPlaceId(20L);
        stop.setSourcePlaceId("mock-jeonju-hanok");
        stop.setPlaceType("ATTRACTION");
        stop.setPlaceName("전주한옥마을");
        stop.setLatitude(new BigDecimal("35.81500000"));
        stop.setLongitude(new BigDecimal("127.15300000"));
        return stop;
    }

    private ItineraryStop stopWithId(Long id) {
        ItineraryStop stop = new ItineraryStop();
        stop.setId(id);
        return stop;
    }

    private ItineraryPlaceRequest kakaoPlaceRequest() {
        return new ItineraryPlaceRequest(
                "KAKAO",
                null,
                "27557389",
                "RESTAURANT",
                "풍년제과",
                "음식점 > 카페",
                "음식점",
                "전라북도",
                "전주시",
                "전북 전주시 덕진구",
                "전북 전주시 덕진구 백제대로",
                new BigDecimal("35.84900000"),
                new BigDecimal("127.16100000"),
                "063-000-0000",
                "https://place.map.kakao.com/27557389");
    }
}
