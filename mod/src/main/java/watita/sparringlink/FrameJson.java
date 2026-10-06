package watita.sparringlink;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import com.google.gson.JsonPrimitive;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.Map;

/** The link protocol, version 1: one JSON object per line. */
public final class FrameJson {
    public static final int VERSION = 1;

    private FrameJson() {}

    public static String hello(String player, String mc) {
        return "{\"t\":\"hello\",\"v\":" + VERSION + ",\"player\":" + string(player) + ",\"mc\":" + string(mc) + "}";
    }

    public static String tick(TickFrame f) {
        StringBuilder out = new StringBuilder(256);
        out.append("{\"t\":\"tick\",\"seq\":").append(f.seq())
                .append(",\"tick\":").append(f.tick())
                .append(",\"ms\":").append(f.ms())
                .append(",\"k\":").append(f.keys())
                .append(",\"spr\":").append(f.sprinting())
                .append(",\"gnd\":").append(f.onGround())
                .append(",\"vy\":").append(number(f.vy()))
                .append(",\"hurt\":").append(f.hurt())
                .append(",\"dist\":").append(f.dist() == null ? "null" : number(f.dist()))
                .append(",\"aim\":").append(f.aim())
                .append(",\"atk\":[");
        for (int i = 0; i < f.attacks().size(); i++) {
            AttackSample a = f.attacks().get(i);
            if (i > 0) out.append(',');
            out.append("{\"c\":").append(number(a.charge()))
                    .append(",\"gnd\":").append(a.onGround())
                    .append(",\"vy\":").append(number(a.vy()))
                    .append(",\"spr\":").append(a.sprinting())
                    .append(",\"aim\":").append(a.aim())
                    .append(",\"dist\":").append(a.dist() == null ? "null" : number(a.dist()))
                    .append('}');
        }
        return out.append("]}").toString();
    }

    /** The fields of a bot message ({@code t}, {@code v}, {@code bot}, {@code fight}, {@code on}), or null if it is not one. */
    public static Map<String, Object> parse(String line) {
        JsonObject object;
        try {
            JsonElement element = JsonParser.parseString(line);
            if (!element.isJsonObject()) return null;
            object = element.getAsJsonObject();
        } catch (RuntimeException e) {
            return null;
        }
        Map<String, Object> out = new HashMap<>();
        for (String key : new String[] {"t", "v", "bot", "fight", "on"}) {
            JsonElement value = object.get(key);
            if (value == null || !value.isJsonPrimitive()) continue;
            JsonPrimitive primitive = value.getAsJsonPrimitive();
            if (primitive.isBoolean()) out.put(key, primitive.getAsBoolean());
            else if (primitive.isNumber()) out.put(key, primitive.getAsInt());
            else out.put(key, primitive.getAsString());
        }
        return out;
    }

    /** Three decimals at most, no trailing zeros, never "-0". */
    static String number(double value) {
        if (!Double.isFinite(value)) return "0";
        BigDecimal rounded = BigDecimal.valueOf(value).setScale(3, RoundingMode.HALF_UP).stripTrailingZeros();
        return rounded.signum() == 0 ? "0" : rounded.toPlainString();
    }

    private static String string(String value) {
        StringBuilder out = new StringBuilder(value.length() + 2).append('"');
        for (char c : value.toCharArray()) {
            if (c == '"' || c == '\\') out.append('\\').append(c);
            else if (c < 0x20) out.append(String.format("\\u%04x", (int) c));
            else out.append(c);
        }
        return out.append('"').toString();
    }
}
