package com.triplog.auth.service;

import com.triplog.auth.domain.SocialAccount;
import com.triplog.auth.dto.AuthTokenResponse;
import com.triplog.auth.mapper.SocialAccountMapper;
import com.triplog.auth.oauth.OAuthUserInfo;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.user.domain.User;
import com.triplog.user.mapper.UserMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OAuthAccountService {

    private final SocialAccountMapper socialAccountMapper;
    private final UserMapper userMapper;
    private final AuthService authService;

    public OAuthAccountService(SocialAccountMapper socialAccountMapper,
                               UserMapper userMapper,
                               AuthService authService) {
        this.socialAccountMapper = socialAccountMapper;
        this.userMapper = userMapper;
        this.authService = authService;
    }

    @Transactional
    public AuthTokenResponse loginOrSignup(OAuthUserInfo userInfo) {
        SocialAccount existing = socialAccountMapper.findByProviderAndProviderUserId(
                userInfo.provider().name(), userInfo.providerUserId());
        if (existing != null) {
            return authService.issueTokens(existing.getUserId());
        }

        if (hasText(userInfo.email()) && userMapper.countByEmail(userInfo.email()) > 0) {
            throw new BusinessException(ErrorCode.OAUTH_EMAIL_CONFLICT);
        }

        User user = new User();
        user.setEmail(null);
        user.setPassword(null);
        user.setNickname(nickname(userInfo));
        user.setProfileImg(userInfo.profileImg());
        userMapper.insert(user);

        SocialAccount socialAccount = new SocialAccount();
        socialAccount.setUserId(user.getId());
        socialAccount.setProvider(userInfo.provider().name());
        socialAccount.setProviderUserId(userInfo.providerUserId());
        socialAccount.setEmail(userInfo.email());
        socialAccount.setNickname(userInfo.nickname());
        socialAccount.setProfileImg(userInfo.profileImg());
        socialAccountMapper.insert(socialAccount);

        return authService.issueTokens(user.getId());
    }

    private String nickname(OAuthUserInfo userInfo) {
        String nickname = hasText(userInfo.nickname()) ? userInfo.nickname().trim() : userInfo.provider().name() + " user";
        return nickname.length() > 50 ? nickname.substring(0, 50) : nickname;
    }

    private boolean hasText(String value) {
        return value != null && !value.isBlank();
    }
}
