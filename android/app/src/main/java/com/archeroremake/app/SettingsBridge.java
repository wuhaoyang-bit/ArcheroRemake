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
            if (raw == null || raw.length() > 65536) return failure("参数文件过大或为空");
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
            // Persist every independent curve, including the new lock rotation curve.
            for (String curveKey : new String[]{"turnCurve", "lockTurnCurve", "moveCurve", "anchorCurve", "ringCurve", "ringStrokeCurve", "ringLinkAttackCurve", "ringSwitchCurve"}) {
                boolean anchor = curveKey.equals("anchorCurve");
                boolean stroke = curveKey.equals("ringStrokeCurve") || curveKey.equals("ringLinkAttackCurve");
                boolean switching = curveKey.equals("ringSwitchCurve");
                boolean ring = curveKey.equals("ringCurve");
                String axis = stroke ? "completion" : ring || switching ? "time" : anchor ? "distance" : "angle";
                String ordinate = stroke ? "width" : ring || switching ? "progress" : "speed";
                JSONArray curve = values.getJSONArray(curveKey);
                if (curve.length() < 2 || curve.length() > 128) return failure("曲线控制点数量无效");
                JSONArray cleanCurve = new JSONArray();
                double previous = -1, previousValue = -1;
                for (int i = 0; i < curve.length(); i++) {
                    JSONObject point = curve.getJSONObject(i);
                    if (!(point.get(axis) instanceof Number) || !(point.get(ordinate) instanceof Number)) return failure("曲线参数必须是数字");
                    double angle = point.getDouble(axis), speed = point.getDouble(ordinate);
                    if (!Double.isFinite(angle) || !Double.isFinite(speed) || angle <= previous || angle > (anchor || ring || stroke || switching ? 100 : 180) || angle < 0 || speed < 0 || (anchor && speed > 10000)) return failure("曲线参数无效");
                    if (switching && (speed > 100 || ((i == 0 || i == curve.length()-1) && speed != 0))) return failure("换目标扩张曲线无效");
                    if (stroke && speed > 1000) return failure("粗细倍率无效");
                    if (ring && (speed > 100 || speed < previousValue || (i == 0 && speed != 0) || (i == curve.length() - 1 && speed != 100))) return failure("收缩完成度无效");
                    if ((i == 0 && angle != 0) || (!anchor && i == curve.length() - 1 && angle != (ring || stroke || switching ? 100 : 180))) return failure("必须保留曲线端点");
                    cleanCurve.put(new JSONObject().put(axis, angle).put(ordinate, speed));
                    previous = angle; previousValue = speed;
                }
                canonical.put(curveKey, cleanCurve);
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
