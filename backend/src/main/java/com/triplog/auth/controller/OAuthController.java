package com.triplog.auth.controller;

import com.triplog.auth.service.OAuthLoginService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.view.RedirectView;

@Tag(name = "OAuth", description = "소셜 로그인 OAuth")
@RestController
@RequestMapping("/auth/oauth")
public class OAuthController {

    private final OAuthLoginService oauthLoginService;

    public OAuthController(OAuthLoginService oauthLoginService) {
        this.oauthLoginService = oauthLoginService;
    }

    @Operation(summary = "소셜 로그인 시작")
    @GetMapping("/{provider}/authorize")
    public RedirectView authorize(@PathVariable String provider,
                                  @RequestParam(required = false) String redirect) {
        return redirect(oauthLoginService.authorizationUri(provider, redirect).toString());
    }

    @Operation(summary = "소셜 로그인 콜백")
    @GetMapping("/{provider}/callback")
    public RedirectView callback(@PathVariable String provider,
                                 @RequestParam(required = false) String code,
                                 @RequestParam(required = false) String state,
                                 @RequestParam(required = false) String error) {
        return redirect(oauthLoginService.callbackUri(provider, code, state, error).toString());
    }

    private RedirectView redirect(String url) {
        RedirectView redirectView = new RedirectView(url);
        redirectView.setExposeModelAttributes(false);
        return redirectView;
    }
}
