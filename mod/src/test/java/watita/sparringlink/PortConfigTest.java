package watita.sparringlink;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PortConfigTest {
    @Test void aMissingConfigIsWrittenWithTheDefaultPort(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("config").resolve("watita-sparring-link.json");
        assertEquals(3211, SparringLinkMod.readPort(file));
        assertTrue(Files.readString(file).contains("\"puerto\": 3211"));
    }

    @Test void theConfiguredPortIsUsed(@TempDir Path dir) throws Exception {
        Path file = dir.resolve("watita-sparring-link.json");
        Files.writeString(file, "{ \"puerto\": 4000 }");
        assertEquals(4000, SparringLinkMod.readPort(file));
    }

    @Test void aBadPortOrABrokenFileFallsBackToTheDefault(@TempDir Path dir) throws Exception {
        Path low = dir.resolve("low.json");
        Files.writeString(low, "{ \"puerto\": 80 }");
        assertEquals(3211, SparringLinkMod.readPort(low));
        Path broken = dir.resolve("broken.json");
        Files.writeString(broken, "{ puerto");
        assertEquals(3211, SparringLinkMod.readPort(broken));
    }
}
