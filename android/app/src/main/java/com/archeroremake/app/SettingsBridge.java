package com.archeroremake.app;

import android.content.Context;
import android.util.AtomicFile;
import android.webkit.JavascriptInterface;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Iterator;
import org.json.JSONArray;
import org.json.JSONObject;

/** Private, fixed-path JSON storage. No device paths or file-system capabilities are exposed to JS. */
public final class SettingsBridge {
    private final Context context;
    private final AtomicFile saved;
    public SettingsBridge(Context context) {
        this.context = context.getApplicationContext();
        this.saved = new AtomicFile(new File(this.context.getFilesDir(), "params.json"));
    }
    private String asset(String name) throws Exception {
        try (InputStream input = context.getAssets().open(name)) {
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toString(StandardCharsets.UTF_8.name());
        }
    }
    @JavascriptInterface public synchronized String readSettings() {
        try {
            String raw;
            if (saved.getBaseFile().exists()) {
                raw = new String(saved.readFully(), StandardCharsets.UTF_8);
            } else {
                raw = asset("www/params.json");
            }
            return new JSONObject().put("ok", true).put("document", new JSONObject(raw)).toString();
        } catch (Exception error) { return failure("应用本地参数读取失败"); }
    }
    @JavascriptInterface public synchronized String writeSettings(String raw) {
        FileOutputStream output = null;
        try {
            if (raw == null || raw.length() > 16384) return failure("参数文件过大或为空");
            JSONObject document = new JSONObject(raw);
            if (document.getInt("version") != 1) return failure("参数文件版本不受支持");
            JSONObject values = document.getJSONObject("settings");
            JSONObject limits = new JSONObject(asset("settings-schema.json"));
            JSONObject canonical = new JSONObject();
            for (Iterator<String> keys = limits.keys(); keys.hasNext();) {
                String key = keys.next();
                Object value = values.get(key);
                if (!(value instanceof Number)) return failure("参数必须是数字：" + key);
                double number = ((Number) value).doubleValue();
                JSONArray range = limits.getJSONArray(key);
                if (!Double.isFinite(number) || number < range.getDouble(0) || number > range.getDouble(1)) {
                    return failure("参数超出范围：" + key);
                }
                canonical.put(key, value);
            }
            String content = new JSONObject().put("version", 1).put("settings", canonical).toString(2) + "\n";
            output = saved.startWrite();
            output.write(content.getBytes(StandardCharsets.UTF_8));
            saved.finishWrite(output);
            return new JSONObject().put("ok", true).toString();
        } catch (Exception error) {
            if (output != null) saved.failWrite(output);
            return failure("应用本地参数保存失败，请重试");
        }
    }
    private static String failure(String message) {
        return "{\"ok\":false,\"error\":" + JSONObject.quote(message) + "}";
    }
}
