package com.triplog.place.controller;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.greaterThan;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class PlaceControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void flyway_seed_loads_public_tourist_places() {
        Long total = jdbcTemplate.queryForObject("""
                        SELECT COUNT(*)
                        FROM places
                        WHERE source = 'PUBLIC_TOURIST_STANDARD'
                        """,
                Long.class);

        assertThat(total).isNotNull();
        assertThat(total).isGreaterThan(800);
    }

    @Test
    void flyway_seed_loads_tourapi_content_types_and_detail_documents() {
        assertThat(tourApiPlaceCount("LODGING")).isGreaterThan(0);
        assertThat(tourApiPlaceCount("CULTURE")).isGreaterThan(0);
        assertThat(tourApiPlaceCount("EVENT")).isGreaterThan(0);
        assertThat(tourApiPlaceCount("TRAVEL_COURSE")).isGreaterThan(0);
        assertThat(tourApiPlaceCount("SHOPPING")).isGreaterThan(0);
        assertThat(tourApiPlaceCount("RESTAURANT")).isGreaterThan(0);

        Long documentCount = jdbcTemplate.queryForObject("""
                        SELECT COUNT(*)
                        FROM place_documents
                        WHERE source = 'TOUR_API'
                          AND document_type = 'TOURAPI_DETAIL'
                        """,
                Long.class);
        Long emptyDocumentTextCount = jdbcTemplate.queryForObject("""
                        SELECT COUNT(*)
                        FROM place_documents
                        WHERE source = 'TOUR_API'
                          AND document_type = 'TOURAPI_DETAIL'
                          AND (document_text IS NULL OR document_text = '')
                        """,
                Long.class);

        assertThat(documentCount).isEqualTo(297);
        assertThat(emptyDocumentTextCount).isZero();
    }

    @Test
    void list_places_without_auth_and_filter_by_region_category_keyword() throws Exception {
        mockMvc.perform(get("/places")
                        .param("region1", "서울특별시")
                        .param("region2", "용산구")
                        .param("category", "관광지")
                        .param("keyword", "전쟁기념관")
                        .param("size", "5"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.page").value(0))
                .andExpect(jsonPath("$.data.total").value(1))
                .andExpect(jsonPath("$.data.items[0].name").value("전쟁기념관"))
                .andExpect(jsonPath("$.data.items[0].source").value("PUBLIC_TOURIST_STANDARD"))
                .andExpect(jsonPath("$.data.items[0].placeType").value("ATTRACTION"))
                .andExpect(jsonPath("$.data.items[0].region1").value("서울특별시"))
                .andExpect(jsonPath("$.data.items[0].region2").value("용산구"));
    }

    @Test
    void list_places_filters_by_place_type() throws Exception {
        mockMvc.perform(get("/places")
                        .param("placeType", "lodging")
                        .param("size", "3"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.total").value(greaterThan(0)))
                .andExpect(jsonPath("$.data.items[0].source").value("TOUR_API"))
                .andExpect(jsonPath("$.data.items[0].placeType").value("LODGING"))
                .andExpect(jsonPath("$.data.items[0].category").value("숙박"));
    }

    @Test
    void list_places_without_place_type_keeps_public_tourist_catalog() throws Exception {
        Long expectedDefaultTotal = jdbcTemplate.queryForObject("""
                        SELECT COUNT(*)
                        FROM places
                        WHERE place_type IN ('ATTRACTION', 'TOURIST_COMPLEX')
                        """,
                Long.class);
        Long allPlaceTotal = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM places", Long.class);

        assertThat(expectedDefaultTotal).isNotNull();
        assertThat(allPlaceTotal).isNotNull();
        assertThat(expectedDefaultTotal).isLessThan(allPlaceTotal);

        mockMvc.perform(get("/places")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.total").value(expectedDefaultTotal.intValue()));
    }

    @Test
    void list_places_returns_empty_result_for_unknown_place_type() throws Exception {
        mockMvc.perform(get("/places")
                        .param("placeType", "UNKNOWN_TYPE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.total").value(0))
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items").isEmpty());
    }

    @Test
    void list_places_returns_empty_result_for_unknown_keyword() throws Exception {
        mockMvc.perform(get("/places")
                        .param("keyword", "__no_such_place__"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.total").value(0))
                .andExpect(jsonPath("$.data.items").isArray())
                .andExpect(jsonPath("$.data.items").isEmpty());
    }

    @Test
    void get_place_detail_returns_seeded_place() throws Exception {
        Long placeId = jdbcTemplate.queryForObject("""
                        SELECT id
                        FROM places
                        WHERE source = 'PUBLIC_TOURIST_STANDARD'
                        ORDER BY id
                        LIMIT 1
                        """,
                Long.class);

        mockMvc.perform(get("/places/{id}", placeId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.id").value(placeId))
                .andExpect(jsonPath("$.data.source").value("PUBLIC_TOURIST_STANDARD"))
                .andExpect(jsonPath("$.data.name").isNotEmpty())
                .andExpect(jsonPath("$.data.description").isNotEmpty());
    }

    @Test
    void get_place_detail_returns_not_found_for_unknown_id() throws Exception {
        mockMvc.perform(get("/places/{id}", 999_999_999L))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("PLACE_001"));
    }

    @Test
    void public_place_paths_do_not_open_protected_trip_api() throws Exception {
        mockMvc.perform(get("/places")
                        .param("size", "1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        mockMvc.perform(get("/trips"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void list_regions_and_categories() throws Exception {
        mockMvc.perform(get("/places/regions"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data[?(@.region1 == '서울특별시' && @.region2 == '용산구')]").isNotEmpty());

        mockMvc.perform(get("/places/categories"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data[?(@ == '관광지')]").isNotEmpty())
                .andExpect(jsonPath("$.data[?(@ == '관광단지')]").isNotEmpty());
    }

    private Long tourApiPlaceCount(String placeType) {
        return jdbcTemplate.queryForObject("""
                        SELECT COUNT(*)
                        FROM places
                        WHERE source = 'TOUR_API'
                          AND place_type = ?
                        """,
                Long.class,
                placeType);
    }
}
