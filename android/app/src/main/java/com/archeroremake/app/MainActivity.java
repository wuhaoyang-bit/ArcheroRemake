package com.archeroremake.app;

import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.TextView;
import androidx.webkit.WebViewAssetLoader;
import java.io.ByteArrayInputStream;
import java.util.Collections;

/** Hosts the unmodified production web bundle in the system's hardware-accelerated WebView. */
public final class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String ENTRY = "https://" + HOST + "/assets/www/index.html";
    private WebView web;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(19, 36, 33));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);
        settings.setSupportZoom(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new SettingsBridge(this), "ArcheroAndroid");
        final WebViewAssetLoader assets = new WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        web.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (trusted(request.getUrl())) {
                    Uri uri = request.getUrl();
                    if (uri.getPath().endsWith("/")) uri = uri.buildUpon().path(uri.getPath() + "index.html").build();
                    WebResourceResponse response = assets.shouldInterceptRequest(uri);
                    if (response != null) return response;
                }
                // No remote server is contacted: all game assets are bundled in the APK.
                return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                    Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !trusted(request.getUrl());
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                view.destroy(); web = null;
                TextView message = new TextView(MainActivity.this);
                message.setText("图形渲染进程已退出，请关闭后重新打开 ArcheroRemake。若重复出现，请检查系统 WebView 更新。");
                message.setTextColor(Color.WHITE); message.setPadding(40, 80, 40, 40);
                setContentView(message);
                return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient());
        setContentView(web);
        immersive();
        web.loadUrl(ENTRY);
    }

    private static boolean trusted(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
            && uri.getPath() != null && uri.getPath().startsWith("/assets/www/");
    }
    private void immersive() {
        getWindow().setDecorFitsSystemWindows(false);
        WindowInsetsController controller = getWindow().getInsetsController();
        if (controller != null) {
            controller.hide(WindowInsets.Type.systemBars());
            controller.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
        }
    }
    private void cancelInput() {
        if (web != null) web.evaluateJavascript("window.dispatchEvent(new Event('blur'));", null);
    }
    @Override public void onWindowFocusChanged(boolean focused) {
        super.onWindowFocusChanged(focused);
        if (focused) immersive(); else cancelInput();
    }
    @Override protected void onPause() {
        cancelInput(); if (web != null) web.onPause(); super.onPause();
    }
    @Override protected void onResume() {
        super.onResume(); if (web != null) web.onResume();
    }
    @Override protected void onDestroy() {
        if (web != null) { web.removeJavascriptInterface("ArcheroAndroid"); web.destroy(); web = null; }
        super.onDestroy();
    }
}
