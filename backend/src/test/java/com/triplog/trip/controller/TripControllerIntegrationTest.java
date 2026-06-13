package com.triplog.trip.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.auth.jwt.JwtTokenProvider;
import com.triplog.trip.dto.CreateTripRequest;
import com.triplog.trip.dto.UpdateTripRequest;
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

import java.time.LocalDate;

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
class TripControllerIntegrationTest {

    private static final long USER_ID = 1001L;
    private static final long OTHER_USER_ID = 1002L;

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
        insertUser(USER_ID, "trip-owner@example.com");
        insertUser(OTHER_USER_ID, "trip-other@example.com");
    }

    @Test
    void crud_flow_for_authenticated_owner() throws Exception {
        JsonNode createBody = postTrip(new CreateTripRequest(
                "Seoul food trip",
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 3),
                "Seoul",
                "food",
                "planning"), USER_ID)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.userId").value(USER_ID))
                .andExpect(jsonPath("$.data.title").value("Seoul food trip"))
                .andExpect(jsonPath("$.data.status").value("planning"))
                .andReturnBody();

        long tripId = createBody.at("/data/id").asLong();

        mockMvc.perform(get("/trips")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.size").value(20))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(tripId));

        mockMvc.perform(get("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(tripId))
                .andExpect(jsonPath("$.data.title").value("Seoul food trip"));

        mockMvc.perform(put("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateTripRequest(
                                "Busan sea trip",
                                LocalDate.of(2026, 8, 4),
                                LocalDate.of(2026, 8, 6),
                                "Busan",
                                "sea",
                                "upcoming"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Busan sea trip"))
                .andExpect(jsonPath("$.data.region").value("Busan"))
                .andExpect(jsonPath("$.data.status").value("upcoming"));

        mockMvc.perform(delete("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        mockMvc.perform(get("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("TRIP_001"));
    }

    @Test
    void list_returns_only_current_user_trips() throws Exception {
        JsonNode ownerTrip = postTrip(new CreateTripRequest(
                "Owner trip",
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 3),
                "Seoul",
                "food",
                "planning"), USER_ID).andReturnBody();

        postTrip(new CreateTripRequest(
                "Other trip",
                LocalDate.of(2026, 9, 1),
                LocalDate.of(2026, 9, 3),
                "Jeju",
                "nature",
                "planning"), OTHER_USER_ID);

        mockMvc.perform(get("/trips")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(ownerTrip.at("/data/id").asLong()))
                .andExpect(jsonPath("$.data.items[0].title").value("Owner trip"));
    }

    @Test
    void other_user_cannot_read_update_or_delete_trip() throws Exception {
        long tripId = postTrip(new CreateTripRequest(
                "Private trip",
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 3),
                "Seoul",
                "food",
                "planning"), USER_ID).andReturnBody().at("/data/id").asLong();

        mockMvc.perform(get("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(OTHER_USER_ID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));

        mockMvc.perform(put("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(OTHER_USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateTripRequest(
                                "Changed",
                                LocalDate.of(2026, 7, 1),
                                LocalDate.of(2026, 7, 3),
                                "Seoul",
                                "food",
                                "planning"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));

        mockMvc.perform(delete("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(OTHER_USER_ID)))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));
    }

    @Test
    void create_rejects_missing_required_fields() throws Exception {
        mockMvc.perform(post("/trips")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "",
                                  "startDate": "2026-07-01",
                                  "endDate": "2026-07-03",
                                  "region": "Seoul",
                                  "theme": "food",
                                  "status": "planning"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_001"));
    }

    @Test
    void create_rejects_unsupported_status() throws Exception {
        mockMvc.perform(post("/trips")
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "Unsupported status trip",
                                  "startDate": "2026-07-01",
                                  "endDate": "2026-07-03",
                                  "region": "Seoul",
                                  "theme": "food",
                                  "status": "PLANNED"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TRIP_003"));
    }

    @Test
    void update_rejects_unsupported_status() throws Exception {
        long tripId = postTrip(new CreateTripRequest(
                "Owner trip",
                LocalDate.of(2026, 7, 1),
                LocalDate.of(2026, 7, 3),
                "Seoul",
                "food",
                "planning"), USER_ID).andReturnBody().at("/data/id").asLong();

        mockMvc.perform(put("/trips/{id}", tripId)
                        .header(HttpHeaders.AUTHORIZATION, bearer(USER_ID))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "Unsupported status trip",
                                  "startDate": "2026-07-01",
                                  "endDate": "2026-07-03",
                                  "region": "Seoul",
                                  "theme": "food",
                                  "status": "PLANNED"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("TRIP_003"));
    }

    private ResultActionsWithBody postTrip(CreateTripRequest request, long userId) throws Exception {
        var resultActions = mockMvc.perform(post("/trips")
                .header(HttpHeaders.AUTHORIZATION, bearer(userId))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)));
        return new ResultActionsWithBody(resultActions);
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
