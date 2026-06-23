package com.triplog.auth.mapper;

import com.triplog.auth.domain.SocialAccount;
import org.apache.ibatis.annotations.Param;

public interface SocialAccountMapper {

    SocialAccount findByProviderAndProviderUserId(@Param("provider") String provider,
                                                  @Param("providerUserId") String providerUserId);

    int countByEmail(String email);

    int insert(SocialAccount socialAccount);
}
