package com.triplog.auth.mapper;

import com.triplog.auth.domain.RefreshToken;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface RefreshTokenMapper {

    int insert(RefreshToken refreshToken);

    RefreshToken findByToken(String token);

    int revokeByToken(@Param("token") String token, @Param("revokedAt") LocalDateTime revokedAt);

    int revokeAllByUserId(@Param("userId") Long userId, @Param("revokedAt") LocalDateTime revokedAt);
}
