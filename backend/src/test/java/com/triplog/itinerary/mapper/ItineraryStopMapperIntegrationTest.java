package com.triplog.itinerary.mapper;

import com.triplog.itinerary.domain.ItineraryStop;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
class ItineraryStopMapperIntegrationTest {

    private static final long USER_ID = 2101L;
    private static final long TRIP_ID = 2201L;

    @Autowired
    private ItineraryStopMapper itineraryStopMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @BeforeEach
    void setUp() {
        jdbcTemplate.update("""
                        INSERT INTO users (id, email, password, nickname)
                        VALUES (?, ?, ?, ?)
                        """,
                USER_ID, "itinerary-mapper@example.com", "{noop}password", "mapper");
        jdbcTemplate.update("""
                        INSERT INTO trips (id, user_id, title, start_date, end_date, region, theme, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                TRIP_ID, USER_ID, "전주 여행", LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 3), "전주", "미식", "planning");
    }

    @Test
    void insert_find_reorder_and_delete_stop() {
        ItineraryStop first = kakaoStop(1);
        itineraryStopMapper.insert(first);
        ItineraryStop second = kakaoStop(2);
        itineraryStopMapper.insert(second);

        List<ItineraryStop> stops = itineraryStopMapper.findByTripIdAndDay(TRIP_ID, 1);
        assertThat(stops).extracting(ItineraryStop::getSortOrder).containsExactly(1, 2);
        assertThat(stops.get(0).getPlaceName()).isEqualTo("테스트 장소 1");

        itineraryStopMapper.bumpSortOrders(TRIP_ID, 1, 1000);
        itineraryStopMapper.updateSortOrder(second.getId(), TRIP_ID, 1, 1);
        itineraryStopMapper.updateSortOrder(first.getId(), TRIP_ID, 1, 2);

        stops = itineraryStopMapper.findByTripIdAndDay(TRIP_ID, 1);
        assertThat(stops).extracting(ItineraryStop::getId).containsExactly(second.getId(), first.getId());

        itineraryStopMapper.deleteById(second.getId(), TRIP_ID, 1);
        itineraryStopMapper.decrementSortOrdersAfter(TRIP_ID, 1, 1);

        stops = itineraryStopMapper.findByTripIdAndDay(TRIP_ID, 1);
        assertThat(stops).hasSize(1);
        assertThat(stops.get(0).getId()).isEqualTo(first.getId());
        assertThat(stops.get(0).getSortOrder()).isEqualTo(1);
    }

    private ItineraryStop kakaoStop(int order) {
        ItineraryStop stop = new ItineraryStop();
        stop.setTripId(TRIP_ID);
        stop.setDayNumber(1);
        stop.setSortOrder(order);
        stop.setPlaceSource("KAKAO");
        stop.setPlaceProvider("KAKAO");
        stop.setSourcePlaceId("kakao-" + order);
        stop.setPlaceType("RESTAURANT");
        stop.setPlaceName("테스트 장소 " + order);
        stop.setCategory("음식점");
        stop.setCategoryGroup("음식점");
        stop.setLatitude(new BigDecimal("35.84900000"));
        stop.setLongitude(new BigDecimal("127.16100000"));
        stop.setTransport("walk");
        return stop;
    }
}
