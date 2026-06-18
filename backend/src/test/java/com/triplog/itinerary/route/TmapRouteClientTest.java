package com.triplog.itinerary.route;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.external.ExternalApiClient;
import com.triplog.common.external.ExternalApiRequest;
import com.triplog.common.external.ExternalApiResponse;
import com.triplog.itinerary.domain.ItineraryStop;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TmapRouteClientTest {

    @Mock
    private ExternalApiClient externalApiClient;

    private TmapRouteClient client;

    @BeforeEach
    void setUp() {
        TmapRouteProperties properties = new TmapRouteProperties();
        properties.setAppKey("test-app-key");
        client = new TmapRouteClient(externalApiClient, properties, new ObjectMapper());
    }

    @Test
    void estimateCar_usesTmapRouteEndpointAndParsesTotalEstimate() {
        when(externalApiClient.exchange(any())).thenReturn(new ExternalApiResponse(200, """
                {
                  "features": [
                    { "properties": { "totalTime": 732, "totalDistance": 5120 } },
                    { "geometry": { "type": "LineString", "coordinates": [[127.153, 35.815], [127.161, 35.849]] } }
                  ]
                }
                """, 1, 10));

        RouteEstimate estimate = client.estimateCar(stop(1L, "35.81500000", "127.15300000"),
                stop(2L, "35.84900000", "127.16100000"));

        assertThat(estimate.durationSeconds()).isEqualTo(732);
        assertThat(estimate.distanceMeters()).isEqualTo(5120);
        assertThat(estimate.geometryJson()).isEqualTo("[[35.815,127.153],[35.849,127.161]]");

        ArgumentCaptor<ExternalApiRequest> requestCaptor = ArgumentCaptor.forClass(ExternalApiRequest.class);
        verify(externalApiClient).exchange(requestCaptor.capture());
        ExternalApiRequest request = requestCaptor.getValue();
        assertThat(request.uri().toString()).isEqualTo("https://apis.openapi.sk.com/tmap/routes?version=1");
        assertThat(request.headers()).containsEntry("appKey", "test-app-key");
        assertThat(request.body()).doesNotContain("totalValue");
        assertThat(request.retryable()).isFalse();
    }

    @Test
    void estimateWalk_usesPedestrianEndpointAndParsesNestedProperties() {
        when(externalApiClient.exchange(any())).thenReturn(new ExternalApiResponse(200, """
                {
                  "type": "FeatureCollection",
                  "features": [
                    { "geometry": { "type": "Point" } },
                    { "geometry": { "type": "LineString", "coordinates": [[127.153, 35.815], [127.1528, 35.817]] } },
                    { "properties": { "totalDistance": 840, "totalTime": 621 } }
                  ]
                }
                """, 1, 10));

        RouteEstimate estimate = client.estimateWalk(stop(1L, "35.81500000", "127.15300000"),
                stop(2L, "35.81700000", "127.15280000"));

        assertThat(estimate.durationSeconds()).isEqualTo(621);
        assertThat(estimate.distanceMeters()).isEqualTo(840);
        assertThat(estimate.geometryJson()).isEqualTo("[[35.815,127.153],[35.817,127.1528]]");

        ArgumentCaptor<ExternalApiRequest> requestCaptor = ArgumentCaptor.forClass(ExternalApiRequest.class);
        verify(externalApiClient).exchange(requestCaptor.capture());
        ExternalApiRequest request = requestCaptor.getValue();
        assertThat(request.uri().toString())
                .isEqualTo("https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1");
        assertThat(request.body()).contains("\"startName\":\"stop-1\"");
    }

    private ItineraryStop stop(Long id, String latitude, String longitude) {
        ItineraryStop stop = new ItineraryStop();
        stop.setId(id);
        stop.setPlaceName("stop-" + id);
        stop.setLatitude(new BigDecimal(latitude));
        stop.setLongitude(new BigDecimal(longitude));
        return stop;
    }
}
