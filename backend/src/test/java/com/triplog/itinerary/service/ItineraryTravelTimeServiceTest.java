package com.triplog.itinerary.service;

import com.triplog.itinerary.domain.ItineraryStop;
import com.triplog.itinerary.mapper.ItineraryStopMapper;
import com.triplog.itinerary.route.RouteEstimate;
import com.triplog.itinerary.route.TmapRouteClient;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ItineraryTravelTimeServiceTest {

    @Mock
    private ItineraryStopMapper itineraryStopMapper;
    @Mock
    private TmapRouteClient tmapRouteClient;

    private ItineraryTravelTimeService service;

    @BeforeEach
    void setUp() {
        service = new ItineraryTravelTimeService(itineraryStopMapper, tmapRouteClient);
    }

    @Test
    void refreshDayTravelTimes_estimatesCarLegAndStoresResultOnDestinationStop() {
        ItineraryStop from = stop(1L, 1, "car");
        ItineraryStop to = stop(2L, 2, "walk");
        when(tmapRouteClient.isConfigured()).thenReturn(true);
        when(tmapRouteClient.estimateCar(from, to)).thenReturn(new RouteEstimate(732, 5120,
                "[[35.815,127.153],[35.849,127.161]]"));

        service.refreshDayTravelTimes(10L, 1, List.of(from, to));

        ArgumentCaptor<ItineraryStop> captor = ArgumentCaptor.forClass(ItineraryStop.class);
        verify(itineraryStopMapper).updateTravelEstimate(captor.capture());
        ItineraryStop updated = captor.getValue();
        assertThat(updated.getId()).isEqualTo(2L);
        assertThat(updated.getTravelFromStopId()).isEqualTo(1L);
        assertThat(updated.getTravelProvider()).isEqualTo("tmap");
        assertThat(updated.getTravelStatus()).isEqualTo("estimated");
        assertThat(updated.getTravelDurationSeconds()).isEqualTo(732);
        assertThat(updated.getTravelDistanceMeters()).isEqualTo(5120);
        assertThat(updated.getTravelGeometryJson()).isEqualTo("[[35.815,127.153],[35.849,127.161]]");
        assertThat(updated.getTravelRouteKey()).isEqualTo("car:35.815:127.153:35.849:127.161");
    }

    @Test
    void refreshDayTravelTimes_marksPublicTransitAsManualWithoutCallingTmap() {
        ItineraryStop from = stop(1L, 1, "public_transit");
        ItineraryStop to = stop(2L, 2, "walk");

        service.refreshDayTravelTimes(10L, 1, List.of(from, to));

        ArgumentCaptor<ItineraryStop> captor = ArgumentCaptor.forClass(ItineraryStop.class);
        verify(itineraryStopMapper).updateTravelEstimate(captor.capture());
        ItineraryStop updated = captor.getValue();
        assertThat(updated.getTravelStatus()).isEqualTo("manual_required");
        assertThat(updated.getTravelProvider()).isNull();
        verify(tmapRouteClient, never()).estimateCar(from, to);
        verify(tmapRouteClient, never()).estimateWalk(from, to);
    }

    @Test
    void refreshDayTravelTimes_skipsUnchangedStoredLeg() {
        ItineraryStop from = stop(1L, 1, "car");
        ItineraryStop to = stop(2L, 2, "walk");
        to.setTravelRouteKey("car:35.815:127.153:35.849:127.161");
        to.setTravelProvider("tmap");
        to.setTravelStatus("estimated");
        to.setTravelGeometryJson("[[35.815,127.153],[35.849,127.161]]");

        service.refreshDayTravelTimes(10L, 1, List.of(from, to));

        verify(itineraryStopMapper, never()).updateTravelEstimate(to);
        verify(tmapRouteClient, never()).estimateCar(from, to);
    }

    @Test
    void refreshDayTravelTimes_recalculatesTmapLegWhenStoredGeometryIsMissing() {
        ItineraryStop from = stop(1L, 1, "car");
        ItineraryStop to = stop(2L, 2, "walk");
        to.setTravelRouteKey("car:35.815:127.153:35.849:127.161");
        to.setTravelProvider("tmap");
        to.setTravelStatus("estimated");
        when(tmapRouteClient.isConfigured()).thenReturn(true);
        when(tmapRouteClient.estimateCar(from, to)).thenReturn(new RouteEstimate(700, 5000,
                "[[35.815,127.153],[35.849,127.161]]"));

        service.refreshDayTravelTimes(10L, 1, List.of(from, to));

        ArgumentCaptor<ItineraryStop> captor = ArgumentCaptor.forClass(ItineraryStop.class);
        verify(itineraryStopMapper).updateTravelEstimate(captor.capture());
        assertThat(captor.getValue().getTravelGeometryJson())
                .isEqualTo("[[35.815,127.153],[35.849,127.161]]");
        verify(tmapRouteClient).estimateCar(from, to);
    }

    @Test
    void applyManualTravelDuration_storesManualPublicTransitDurationOnDestinationStop() {
        ItineraryStop from = stop(1L, 1, "public_transit");
        ItineraryStop to = stop(2L, 2, "walk");

        service.applyManualTravelDuration(10L, 1, List.of(from, to), 2L, 1500);

        ArgumentCaptor<ItineraryStop> captor = ArgumentCaptor.forClass(ItineraryStop.class);
        verify(itineraryStopMapper).updateTravelEstimate(captor.capture());
        ItineraryStop updated = captor.getValue();
        assertThat(updated.getTravelFromStopId()).isEqualTo(1L);
        assertThat(updated.getTravelRouteKey()).isEqualTo("public_transit:35.815:127.153:35.849:127.161");
        assertThat(updated.getTravelProvider()).isNull();
        assertThat(updated.getTravelStatus()).isEqualTo("manual");
        assertThat(updated.getTravelDurationSeconds()).isEqualTo(1500);
        assertThat(updated.getTravelDistanceMeters()).isNull();
        assertThat(updated.getTravelGeometryJson()).isNull();
    }

    @Test
    void refreshDayTravelTimes_doesNotCallTmapWhenAppKeyIsMissing() {
        ItineraryStop from = stop(1L, 1, "walk");
        ItineraryStop to = stop(2L, 2, "walk");
        when(tmapRouteClient.isConfigured()).thenReturn(false);

        service.refreshDayTravelTimes(10L, 1, List.of(from, to));

        ArgumentCaptor<ItineraryStop> captor = ArgumentCaptor.forClass(ItineraryStop.class);
        verify(itineraryStopMapper).updateTravelEstimate(captor.capture());
        assertThat(captor.getValue().getTravelStatus()).isEqualTo("not_configured");
        assertThat(captor.getValue().getTravelProvider()).isEqualTo("tmap");
        verify(tmapRouteClient, never()).estimateWalk(from, to);
    }

    private ItineraryStop stop(Long id, Integer sortOrder, String transport) {
        ItineraryStop stop = new ItineraryStop();
        stop.setId(id);
        stop.setTripId(10L);
        stop.setDayNumber(1);
        stop.setSortOrder(sortOrder);
        stop.setTransport(transport);
        stop.setLatitude(id == 1L ? new BigDecimal("35.81500000") : new BigDecimal("35.84900000"));
        stop.setLongitude(id == 1L ? new BigDecimal("127.15300000") : new BigDecimal("127.16100000"));
        return stop;
    }
}
