package com.triplog.common.external;

import java.net.URI;
import java.util.LinkedHashMap;
import java.util.Map;

public record ExternalApiRequest(
        String provider,
        ExternalHttpMethod method,
        URI uri,
        Map<String, String> headers,
        String body
) {

    public ExternalApiRequest {
        if (provider == null || provider.isBlank()) {
            throw new IllegalArgumentException("provider must not be blank");
        }
        if (method == null) {
            throw new IllegalArgumentException("method must not be null");
        }
        if (uri == null) {
            throw new IllegalArgumentException("uri must not be null");
        }
        headers = headers == null ? Map.of() : Map.copyOf(headers);
    }

    public static Builder get(String provider, URI uri) {
        return new Builder(provider, ExternalHttpMethod.GET, uri);
    }

    public static Builder post(String provider, URI uri) {
        return new Builder(provider, ExternalHttpMethod.POST, uri);
    }

    public static final class Builder {
        private final String provider;
        private final ExternalHttpMethod method;
        private final URI uri;
        private final Map<String, String> headers = new LinkedHashMap<>();
        private String body;

        private Builder(String provider, ExternalHttpMethod method, URI uri) {
            this.provider = provider;
            this.method = method;
            this.uri = uri;
        }

        public Builder header(String name, String value) {
            headers.put(name, value);
            return this;
        }

        public Builder body(String body) {
            this.body = body;
            return this;
        }

        public ExternalApiRequest build() {
            return new ExternalApiRequest(provider, method, uri, headers, body);
        }
    }
}
