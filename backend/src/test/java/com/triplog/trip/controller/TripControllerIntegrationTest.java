package com.triplog.trip.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.trip.dto.CreateTripRequest;
import com.triplog.trip.dto.UpdateTripRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
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
                "PLANNED"), USER_ID)
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.userId").value(USER_ID))
                .andExpect(jsonPath("$.data.title").value("Seoul food trip"))
                .andReturnBody();

        long tripId = createBody.at("/data/id").asLong();

        mockMvc.perform(get("/trips")
                        .with(user(String.valueOf(USER_ID))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].id").value(tripId));

        mockMvc.perform(get("/trips/{id}", tripId)
                        .with(user(String.valueOf(USER_ID))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.id").value(tripId))
                .andExpect(jsonPath("$.data.title").value("Seoul food trip"));

        mockMvc.perform(put("/trips/{id}", tripId)
                        .with(user(String.valueOf(USER_ID)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateTripRequest(
                                "Busan sea trip",
                                LocalDate.of(2026, 8, 4),
                                LocalDate.of(2026, 8, 6),
                                "Busan",
                                "sea",
                                "CONFIRMED"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.title").value("Busan sea trip"))
                .andExpect(jsonPath("$.data.region").value("Busan"));

        mockMvc.perform(delete("/trips/{id}", tripId)
                        .with(user(String.valueOf(USER_ID))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        mockMvc.perform(get("/trips/{id}", tripId)
                        .with(user(String.valueOf(USER_ID))))
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
                "PLANNED"), USER_ID).andReturnBody();

        postTrip(new CreateTripRequest(
                "Other trip",
                LocalDate.of(2026, 9, 1),
                LocalDate.of(2026, 9, 3),
                "Jeju",
                "nature",
                "PLANNED"), OTHER_USER_ID);

        mockMvc.perform(get("/trips")
                        .with(user(String.valueOf(USER_ID))))
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
                "PLANNED"), USER_ID).andReturnBody().at("/data/id").asLong();

        mockMvc.perform(get("/trips/{id}", tripId)
                        .with(user(String.valueOf(OTHER_USER_ID))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));

        mockMvc.perform(put("/trips/{id}", tripId)
                        .with(user(String.valueOf(OTHER_USER_ID)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateTripRequest(
                                "Changed",
                                LocalDate.of(2026, 7, 1),
                                LocalDate.of(2026, 7, 3),
                                "Seoul",
                                "food",
                                "PLANNED"))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));

        mockMvc.perform(delete("/trips/{id}", tripId)
                        .with(user(String.valueOf(OTHER_USER_ID))))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.code").value("TRIP_002"));
    }

    @Test
    void create_rejects_missing_required_fields() throws Exception {
        mockMvc.perform(post("/trips")
                        .with(user(String.valueOf(USER_ID)))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "title": "",
                                  "startDate": "2026-07-01",
                                  "endDate": "2026-07-03",
                                  "region": "Seoul",
                                  "theme": "food",
                                  "status": "PLANNED"
                                }
                                """))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("COMMON_001"));
    }

    private ResultActionsWithBody postTrip(CreateTripRequest request, long userId) throws Exception {
        var resultActions = mockMvc.perform(post("/trips")
                .with(user(String.valueOf(userId)))
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(request)));
        return new ResultActionsWithBody(resultActions);
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
