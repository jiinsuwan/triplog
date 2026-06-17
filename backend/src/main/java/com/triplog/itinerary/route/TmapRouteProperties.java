package com.triplog.itinerary.route;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "tmap")
public class TmapRouteProperties {

    private String appKey = "";
    private String routeBaseUrl = "https://apis.openapi.sk.com";

    public String getAppKey() {
        return appKey;
    }

    public void setAppKey(String appKey) {
        this.appKey = appKey;
    }

    public String getRouteBaseUrl() {
        return routeBaseUrl;
    }

    public void setRouteBaseUrl(String routeBaseUrl) {
        this.routeBaseUrl = routeBaseUrl;
    }

    public boolean hasAppKey() {
        return appKey != null && !appKey.isBlank();
    }
}
