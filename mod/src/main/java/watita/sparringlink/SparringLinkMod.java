package watita.sparringlink;

import com.google.gson.JsonObject;
import com.google.gson.JsonParser;
import net.fabricmc.api.ClientModInitializer;
import net.fabricmc.fabric.api.client.event.lifecycle.v1.ClientTickEvents;
import net.fabricmc.fabric.api.client.networking.v1.ClientPlayConnectionEvents;
import net.fabricmc.loader.api.FabricLoader;
import net.minecraft.client.Minecraft;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;

/**
 * Sends the player's inputs to the WatitaAC sparring bot running on this PC, only during its fights (!pelea), so
 * it learns the player's habits. Talks to 127.0.0.1 only.
 */
public final class SparringLinkMod implements ClientModInitializer {
    public static final int DEFAULT_PORT = 3211;
    private static final Logger LOG = LoggerFactory.getLogger("watita-sparring-link");
    private static TickSampler sampler;

    @Override public void onInitializeClient() {
        int port = readPort(FabricLoader.getInstance().getConfigDir().resolve("watita-sparring-link.json"));
        LinkClient link = new LinkClient(port, SparringLinkMod::playerName, "26.2");
        sampler = new TickSampler(link);
        ClientPlayConnectionEvents.JOIN.register((handler, sender, client) -> link.setWanted(true));
        ClientPlayConnectionEvents.DISCONNECT.register((handler, client) -> link.setWanted(false));
        ClientTickEvents.END_CLIENT_TICK.register(sampler::onTick);
        LOG.info("Watita Sparring Link: bot on 127.0.0.1:{}", port);
    }

    /** Called by the attack mixin. */
    public static void onAttack(Minecraft client) {
        if (sampler != null) sampler.onAttack(client);
    }

    private static String playerName() {
        Minecraft client = Minecraft.getInstance();
        return client.player != null ? client.player.getScoreboardName() : client.getUser().getName();
    }

    /** The port from the config file, written with the default the first time. */
    static int readPort(Path file) {
        try {
            if (Files.exists(file)) {
                JsonObject json = JsonParser.parseString(Files.readString(file, StandardCharsets.UTF_8)).getAsJsonObject();
                int port = json.get("puerto").getAsInt();
                if (port >= 1024 && port <= 65535) return port;
                LOG.warn("Watita Sparring Link: puerto {} fuera de rango, uso {}", port, DEFAULT_PORT);
            } else {
                Files.createDirectories(file.getParent());
                Files.writeString(file, "{ \"puerto\": " + DEFAULT_PORT + " }\n", StandardCharsets.UTF_8);
            }
        } catch (IOException | RuntimeException e) {
            LOG.warn("Watita Sparring Link: no pude leer {}, uso el puerto {}", file, DEFAULT_PORT);
        }
        return DEFAULT_PORT;
    }
}
