package com.triplog.auth.controller;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.auth.dto.LoginRequest;
import com.triplog.auth.dto.LogoutRequest;
import com.triplog.auth.dto.RefreshTokenRequest;
import com.triplog.auth.dto.SignupRequest;
import com.triplog.user.dto.UpdateUserProfileRequest;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
class AuthControllerIntegrationTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void signup_login_refresh_profile_logout_flow() throws Exception {
        SignupRequest signup = new SignupRequest("flow@example.com", "password123", "flow");
        mockMvc.perform(post("/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(signup)))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.email").value("flow@example.com"));

        JsonNode loginBody = postJson("/auth/login", new LoginRequest("flow@example.com", "password123"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andReturnBody();
        String accessToken = loginBody.at("/data/accessToken").asText();
        String refreshToken = loginBody.at("/data/refreshToken").asText();

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, bearer(accessToken)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value("flow@example.com"));

        mockMvc.perform(put("/users/me")
                        .header(HttpHeaders.AUTHORIZATION, bearer(accessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new UpdateUserProfileRequest("updated", null))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.nickname").value("updated"));

        JsonNode refreshBody = postJson("/auth/refresh", new RefreshTokenRequest(refreshToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andReturnBody();
        String newAccessToken = refreshBody.at("/data/accessToken").asText();
        String newRefreshToken = refreshBody.at("/data/refreshToken").asText();
        assertThat(newRefreshToken).isNotEqualTo(refreshToken);

        mockMvc.perform(post("/auth/logout")
                        .header(HttpHeaders.AUTHORIZATION, bearer(newAccessToken))
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new LogoutRequest(newRefreshToken))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"));

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RefreshTokenRequest(newRefreshToken))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void reused_refresh_token_revokes_all_user_refresh_tokens() throws Exception {
        String email = "reuse-" + UUID.randomUUID() + "@example.com";
        SignupRequest signup = new SignupRequest(email, "password123", "reuse");
        mockMvc.perform(post("/auth/signup")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(signup)))
                .andExpect(status().isCreated());

        JsonNode loginBody = postJson("/auth/login", new LoginRequest(email, "password123"))
                .andExpect(status().isOk())
                .andReturnBody();
        String oldRefreshToken = loginBody.at("/data/refreshToken").asText();

        JsonNode refreshBody = postJson("/auth/refresh", new RefreshTokenRequest(oldRefreshToken))
                .andExpect(status().isOk())
                .andReturnBody();
        String newRefreshToken = refreshBody.at("/data/refreshToken").asText();

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RefreshTokenRequest(oldRefreshToken))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_006"));

        mockMvc.perform(post("/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(new RefreshTokenRequest(newRefreshToken))))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_006"));
    }

    @Test
    void protected_api_returns_401_without_or_with_forged_token() throws Exception {
        mockMvc.perform(get("/users/me"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_001"));

        mockMvc.perform(get("/users/me").header(HttpHeaders.AUTHORIZATION, "Bearer forged-token"))
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.code").value("AUTH_001"));
    }

    private ResultActionsWithBody postJson(String path, Object body) throws Exception {
        var resultActions = mockMvc.perform(post(path)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(body)));
        return new ResultActionsWithBody(resultActions);
    }

    private String bearer(String token) {
        return "Bearer " + token;
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
