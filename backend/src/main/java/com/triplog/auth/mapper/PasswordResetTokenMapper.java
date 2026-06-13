package com.triplog.auth.mapper;

import com.triplog.auth.domain.PasswordResetToken;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

public interface PasswordResetTokenMapper {

    int insert(PasswordResetToken token);

    PasswordResetToken findByHash(@Param("tokenHash") String tokenHash);

    int revokeUnusedByUserId(@Param("userId") Long userId, @Param("revokedAt") LocalDateTime revokedAt);

    int consumeByHash(@Param("tokenHash") String tokenHash, @Param("consumedAt") LocalDateTime consumedAt);
}
