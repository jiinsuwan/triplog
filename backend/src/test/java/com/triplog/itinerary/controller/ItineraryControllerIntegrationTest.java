package com.triplog.itinerary.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.auth.jwt.JwtTokenProvider;
import com.triplog.itinerary.dto.CreateItineraryStopRequest;
import com.triplog.itinerary.dto.ItineraryPlaceRequest;
import com.triplog.itinerary.dto.ReorderItineraryStopsRequest;
import com.triplog.itinerary.dto.UpdateItineraryStopRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class ItineraryControllerIntegrationTest {

    private static final long USER_ID = 3101L;
    private static final long OTHER_USER_ID = 3102L;
    private static final long TRIP_ID = 3201L;

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private JwtTokenProvider tokenProvider;

    @BeforeEach
    void setUp() {
        insertUser(USER_ID, "itinerary-owner@example.com");
        insertUser(OTHER_USER_ID, "itinerary-other@example.com");
        insertTrip(TRIP_ID, USER_ID);
    }

    @Test
    void owner_can_create_read_update_reorder_and_delete_stops() throws Exception {
        Long dbPlaceId = firstSeededPlaceId();

        mockMvc.perform(get("/trips/{tripId}/itinerary", TRIP_ID)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.trip.id").value(TRIP_ID))
                .andExpect(jsonPath("$.data.dayCount").value(3))
                .andExpect(jsonPath("$.data.days.length()").value(3))
                .andExpect(jsonPath("$.data.days[0].date").value("2026-07-01"))
                .andExpect(jsonPath("$.data.days[0].stops").isEmpty());

        JsonNode dbStopBody = createStop(1, dbPlaceRequest(dbPlaceId), "walk")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sortOrder").value(1))
                .andExpect(jsonPath("$.data.selectedTime").value("10:30"))
                .andExpect(jsonPath("$.data.transport").value("walk"))
                .andExpect(jsonPath("$.data.place.source").value("DB"))
                .andExpect(jsonPath("$.data.place.dbPlaceId").value(dbPlaceId))
                .andReturnBody();
        long dbStopId = dbStopBody.at("/data/id").asLong();

        JsonNode kakaoStopBody = createStop(1, kakaoPlaceRequest(), "car")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.data.sortOrder").value(2))
                .andExpect(jsonPath("$.data.place.source").value("KAKAO"))
                .andExpect(jsonPath("$.data.place.sourcePlaceId").value("27557389"))
                .andExpect(jsonPath("$.data.place.name").value("풍년제과 전주역전점"))
                .andReturnBody();
        long kakaoStopId = kakaoStopBody.at("/data/id").asLong();

        mockMvc.perform(get("/trips/{tripId}/itinerary", TRIP_ID)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.days[0].stops.length()").value(2))
                .andExpect(jsonPath("$.data.days[0].stops[0].id").value(dbStopId))
                .andExpect(jsonPath("$.data.days[0].stops[1].id").value(kakaoStopId));

        mockMvc.perform(put("/trips/{tripId}/itinerary/days/{dayNumber}/stops/{stopId}",
                        TRIP_ID, 1, dbStopId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateItineraryStopRequest(
                                "11:00", "점심 전 방문", "public_transit"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.selectedTime").value("11:00"))
                .andExpect(jsonPath("$.data.memo").value("점심 전 방문"))
                .andExpect(jsonPath("$.data.transport").value("public_transit"));

        mockMvc.perform(put("/trips/{tripId}/itinerary/days/{dayNumber}/stops/order", TRIP_ID, 1)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ReorderItineraryStopsRequest(
                                List.of(kakaoStopId, dbStopId)))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.days[0].stops[0].id").value(kakaoStopId))
                .andExpect(jsonPath("$.data.days[0].stops[0].sortOrder").value(1))
                .andExpect(jsonPath("$.data.days[0].stops[1].id").value(dbStopId))
                .andExpect(jsonPath("$.data.days[0].stops[1].sortOrder").value(2));

        mockMvc.perform(delete("/trips/{tripId}/itinerary/days/{dayNumber}/stops/{stopId}",
                        TRIP_ID, 1, kakaoStopId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        mockMvc.perform(get("/trips/{tripId}/itinerary", TRIP_ID)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.days[0].stops.length()").value(1))
                .andExpect(jsonPath("$.data.days[0].stops[0].id").value(dbStopId))
                .andExpect(jsonPath("$.data.days[0].stops[0].sortOrder").value(1));
    }

    @Test
    void itinerary_api_rejects_unauthenticated_and_other_user_access() throws Exception {
        mockMvc.perform(get("/trips/{tripId}/itinerary", TRIP_ID))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_001"));

        mockMvc.perform(get("/trips/{tripId}/itinerary", TRIP_ID)
                        .header(HttpHeaders.AUTHORIZATION, bearer(OTHER_USER_ID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));
    }

    @Test
    void create_rejects_invalid_body_day_and_transport() throws Exception {
        mockMvc.perform(post("/trips/{tripId}/itinerary/days/{dayNumber}/stops", TRIP_ID, 1)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "selectedTime": "10:30",
                                  "memo": "transport missing",
                                  "place": { "source": "KAKAO" }
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_001"));

        mockMvc.perform(post("/trips/{tripId}/itinerary/days/{dayNumber}/stops", TRIP_ID, 9)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateItineraryStopRequest(
                                "10:30", null, "walk", kakaoPlaceRequest()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITIN_002"));

        mockMvc.perform(post("/trips/{tripId}/itinerary/days/{dayNumber}/stops", TRIP_ID, 1)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new CreateItineraryStopRequest(
                                "10:30", null, "taxi", kakaoPlaceRequest()))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITIN_002"));
    }

    @Test
    void reorder_rejects_missing_duplicate_or_other_day_stop_ids() throws Exception {
        Long dbPlaceId = firstSeededPlaceId();
        long dayOneStopId = createStop(1, dbPlaceRequest(dbPlaceId), "walk")
                .andReturnBody().at("/data/id").asLong();
        long dayTwoStopId = createStop(2, kakaoPlaceRequest(), "car")
                .andReturnBody().at("/data/id").asLong();

        mockMvc.perform(put("/trips/{tripId}/itinerary/days/{dayNumber}/stops/order", TRIP_ID, 1)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ReorderItineraryStopsRequest(
                                List.of(dayOneStopId, dayOneStopId)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITIN_003"));

        mockMvc.perform(put("/trips/{tripId}/itinerary/days/{dayNumber}/stops/order", TRIP_ID, 1)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new ReorderItineraryStopsRequest(
                                List.of(dayTwoStopId)))))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("ITIN_003"));
    }

    @Test
    void openapi_exposes_itinerary_paths() throws Exception {
        String body = mockMvc.perform(get("/v3/api-docs"))
                .andExpect(status().isOk())
                .andReturn()
                .getResponse()
                .getContentAsString();

        assertThat(body).contains("/trips/{tripId}/itinerary");
        assertThat(body).contains("/trips/{tripId}/itinerary/days/{dayNumber}/stops");
    }

    private ResultActionsWithBody createStop(int dayNumber, ItineraryPlaceRequest place, String transport)
            throws Exception {
        return new ResultActionsWithBody(mockMvc.perform(post(
                        "/trips/{tripId}/itinerary/days/{dayNumber}/stops", TRIP_ID, dayNumber)
                .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new CreateItineraryStopRequest(
                        "10:30", "메모", transport, place)))));
    }

    private ItineraryPlaceRequest dbPlaceRequest(Long dbPlaceId) {
        return new ItineraryPlaceRequest(
                "DB", dbPlaceId, null, null, null, null, null,
                null, null, null, null, null, null, null, null);
    }

    private ItineraryPlaceRequest kakaoPlaceRequest() {
        return new ItineraryPlaceRequest(
                "KAKAO",
                null,
                "27557389",
                "RESTAURANT",
                "풍년제과 전주역전점",
                "음식점 > 제과,베이커리",
                "음식점",
                "전라북도",
                "전주시",
                "전북 전주시 덕진구 우아동3가 752-48",
                "전북 전주시 덕진구 백제대로 838",
                new BigDecimal("35.84900000"),
                new BigDecimal("127.16100000"),
                "063-245-0946",
                "https://place.map.kakao.com/27557389");
    }

    private Long firstSeededPlaceId() {
        return jdbcTemplate.queryForObject("""
                        SELECT id
                        FROM places
                        WHERE source = 'PUBLIC_TOURIST_STANDARD'
                        ORDER BY id
                        LIMIT 1
                        """,
                Long.class);
    }

    private String bearer(long userId) {
        return "Bearer " + tokenProvider.createAccessToken(userId);
    }

    private void insertUser(long id, String email) {
        jdbcTemplate.update("""
                        INSERT INTO users (id, email, password, nickname)
                        VALUES (?, ?, ?, ?)
                        """,
                id, email, "{noop}password", "tester");
    }

    private void insertTrip(long id, long userId) {
        jdbcTemplate.update("""
                        INSERT INTO trips (id, user_id, title, start_date, end_date, region, theme, status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                id, userId, "전주 여행", LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 3), "전주", "미식", "planning");
    }

    private final class ResultActionsWithBody {
        private final org.springframework.test.web.servlet.ResultActions delegate;

        private ResultActionsWithBody(org.springframework.test.web.servlet.ResultActions delegate) {
            this.delegate = delegate;
        }

        ResultActionsWithBody andExpect(org.springframework.test.web.servlet.ResultMatcher matcher) throws Exception {
            delegate.andExpect(matcher);
            return this;
        }

        JsonNode andReturnBody() throws Exception {
            return objectMapper.readTree(delegate.andReturn().getResponse().getContentAsString());
        }
    }
}
