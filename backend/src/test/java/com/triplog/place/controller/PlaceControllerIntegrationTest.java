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
}
