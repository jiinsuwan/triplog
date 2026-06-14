package com.triplog.itinerary.mapper;

import com.triplog.itinerary.domain.ItineraryStop;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface ItineraryStopMapper {

    int insert(ItineraryStop stop);

    List<ItineraryStop> findByTripId(Long tripId);

    List<ItineraryStop> findByTripIdAndDay(@Param("tripId") Long tripId,
                                           @Param("dayNumber") Integer dayNumber);

    ItineraryStop findByIdAndTripAndDay(@Param("id") Long id,
                                        @Param("tripId") Long tripId,
                                        @Param("dayNumber") Integer dayNumber);

    Integer findMaxSortOrder(@Param("tripId") Long tripId,
                             @Param("dayNumber") Integer dayNumber);

    int updateDetails(ItineraryStop stop);

    int deleteById(@Param("id") Long id,
                   @Param("tripId") Long tripId,
                   @Param("dayNumber") Integer dayNumber);

    int decrementSortOrdersAfter(@Param("tripId") Long tripId,
                                 @Param("dayNumber") Integer dayNumber,
                                 @Param("sortOrder") Integer sortOrder);

    int bumpSortOrders(@Param("tripId") Long tripId,
                       @Param("dayNumber") Integer dayNumber,
                       @Param("offset") Integer offset);

    int updateSortOrder(@Param("id") Long id,
                        @Param("tripId") Long tripId,
                        @Param("dayNumber") Integer dayNumber,
                        @Param("sortOrder") Integer sortOrder);
}
