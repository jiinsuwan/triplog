package com.triplog.auth.oauth;

import java.net.URI;

public interface OAuthProviderClient {

    OAuthProvider provider();

    URI authorizationUri(String state);

    OAuthUserInfo fetchUser(String code);
}
