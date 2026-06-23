package com.triplog.auth.oauth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "oauth")
public class OAuthProperties {

    private String stateSecret = "";
    private Frontend frontend = new Frontend();
    private Provider kakao = new Provider();
    private Provider google = new Provider();
    private Provider naver = new Provider();

    public String getStateSecret() {
        return stateSecret;
    }

    public void setStateSecret(String stateSecret) {
        this.stateSecret = stateSecret;
    }

    public Frontend getFrontend() {
        return frontend;
    }

    public void setFrontend(Frontend frontend) {
        this.frontend = frontend;
    }

    public Provider getKakao() {
        return kakao;
    }

    public void setKakao(Provider kakao) {
        this.kakao = kakao;
    }

    public Provider getGoogle() {
        return google;
    }

    public void setGoogle(Provider google) {
        this.google = google;
    }

    public Provider getNaver() {
        return naver;
    }

    public void setNaver(Provider naver) {
        this.naver = naver;
    }

    public static class Frontend {
        private String successUri = "http://localhost:5173/oauth/callback";
        private String failureUri = "http://localhost:5173/login";

        public String getSuccessUri() {
            return successUri;
        }

        public void setSuccessUri(String successUri) {
            this.successUri = successUri;
        }

        public String getFailureUri() {
            return failureUri;
        }

        public void setFailureUri(String failureUri) {
            this.failureUri = failureUri;
        }
    }

    public static class Provider {
        private String clientId = "";
        private String clientSecret = "";
        private String redirectUri = "";
        private String authorizationUri = "";
        private String tokenUri = "";
        private String userInfoUri = "";
        private String scope = "";

        public String getClientId() {
            return clientId;
        }

        public void setClientId(String clientId) {
            this.clientId = clientId;
        }

        public String getClientSecret() {
            return clientSecret;
        }

        public void setClientSecret(String clientSecret) {
            this.clientSecret = clientSecret;
        }

        public String getRedirectUri() {
            return redirectUri;
        }

        public void setRedirectUri(String redirectUri) {
            this.redirectUri = redirectUri;
        }

        public String getAuthorizationUri() {
            return authorizationUri;
        }

        public void setAuthorizationUri(String authorizationUri) {
            this.authorizationUri = authorizationUri;
        }

        public String getTokenUri() {
            return tokenUri;
        }

        public void setTokenUri(String tokenUri) {
            this.tokenUri = tokenUri;
        }

        public String getUserInfoUri() {
            return userInfoUri;
        }

        public void setUserInfoUri(String userInfoUri) {
            this.userInfoUri = userInfoUri;
        }

        public String getScope() {
            return scope;
        }

        public void setScope(String scope) {
            this.scope = scope;
        }
    }
}
