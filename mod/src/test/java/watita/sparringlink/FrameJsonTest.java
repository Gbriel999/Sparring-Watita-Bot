package watita.sparringlink;

import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class FrameJsonTest {
    @Test void helloCarriesVersionPlayerAndGameVersion() {
        assertEquals("{\"t\":\"hello\",\"v\":1,\"player\":\"gvvbriel\",\"mc\":\"26.2\"}",
                FrameJson.hello("gvvbriel", "26.2"));
    }

    @Test void helloEscapesQuotesAndBackslashes() {
        assertEquals("{\"t\":\"hello\",\"v\":1,\"player\":\"a\\\"b\\\\c\",\"mc\":\"26.2\"}",
                FrameJson.hello("a\"b\\c", "26.2"));
    }

    @Test void tickWithoutBotInSightHasNullDistanceAndNoAttacks() {
        TickFrame frame = new TickFrame(7, 1200, 1759770000123L, Keys.FORWARD | Keys.SPRINT, true, true, 0.0,
                false, null, false, List.of());
        assertEquals("{\"t\":\"tick\",\"seq\":7,\"tick\":1200,\"ms\":1759770000123,\"k\":65,\"spr\":true,"
                + "\"gnd\":true,\"vy\":0,\"hurt\":false,\"dist\":null,\"aim\":false,\"atk\":[]}", FrameJson.tick(frame));
    }

    @Test void tickListsEveryAttackWithItsStateRoundedToThreeDecimals() {
        AttackSample hit = new AttackSample(0.96875, false, -0.15681, false, true, 2.90049);
        AttackSample air = new AttackSample(0.25, true, 0.0, true, false, null);
        TickFrame frame = new TickFrame(8, 1201, 5L, Keys.ATTACK, false, false, -0.15681, true, 2.90049, true,
                List.of(hit, air));
        assertEquals("{\"t\":\"tick\",\"seq\":8,\"tick\":1201,\"ms\":5,\"k\":128,\"spr\":false,\"gnd\":false,"
                + "\"vy\":-0.157,\"hurt\":true,\"dist\":2.9,\"aim\":true,\"atk\":["
                + "{\"c\":0.969,\"gnd\":false,\"vy\":-0.157,\"spr\":false,\"aim\":true,\"dist\":2.9},"
                + "{\"c\":0.25,\"gnd\":true,\"vy\":0,\"spr\":true,\"aim\":false,\"dist\":null}]}", FrameJson.tick(frame));
    }

    @Test void keyBitsFollowTheProtocol() {
        assertEquals(1, Keys.FORWARD);
        assertEquals(2, Keys.BACK);
        assertEquals(4, Keys.LEFT);
        assertEquals(8, Keys.RIGHT);
        assertEquals(16, Keys.JUMP);
        assertEquals(32, Keys.SNEAK);
        assertEquals(64, Keys.SPRINT);
        assertEquals(128, Keys.ATTACK);
        assertEquals(256, Keys.USE);
    }

    @Test void parsesTheBotMessages() {
        Map<String, Object> fight = FrameJson.parse("{\"t\":\"fight\",\"on\":true}");
        assertEquals("fight", fight.get("t"));
        assertEquals(Boolean.TRUE, fight.get("on"));
        Map<String, Object> hello = FrameJson.parse("{\"t\":\"hello\",\"v\":1,\"bot\":\"WatitaBot\",\"fight\":false}");
        assertEquals("WatitaBot", hello.get("bot"));
        assertEquals(Boolean.FALSE, hello.get("fight"));
        assertEquals(1, hello.get("v"));
    }

    @Test void aBrokenLineParsesToNothing() {
        assertNull(FrameJson.parse("{\"t\":"));
        assertNull(FrameJson.parse("[1,2]"));
    }
}
