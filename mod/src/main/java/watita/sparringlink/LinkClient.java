package watita.sparringlink;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;

/**
 * The TCP link to the sparring bot on 127.0.0.1. Runs on its own daemon thread, retries every few seconds while
 * the player is on a server, and never blocks the game: frames go through a bounded queue (the oldest are dropped
 * if the bot stalls). The bot says when a fight runs; nothing is worth sending outside one.
 */
public final class LinkClient {
    private static final int RETRY_MS = 5000;
    private static final int CONNECT_TIMEOUT_MS = 1000;
    private static final int MAX_LINE = 4096;

    private final int port;
    private final Supplier<String> playerName;
    private final String gameVersion;
    private final BlockingQueue<String> outbox = new ArrayBlockingQueue<>(256);

    private volatile boolean wanted;
    private volatile boolean connected;
    private volatile boolean fightOn;
    private volatile String botName = "";
    /** A fight start or end the game thread has not shown yet: null, TRUE or FALSE. */
    private volatile Boolean fightNotice;

    public LinkClient(int port, Supplier<String> playerName, String gameVersion) {
        this.port = port;
        this.playerName = playerName;
        this.gameVersion = gameVersion;
        Thread thread = new Thread(this::run, "watita-sparring-link");
        thread.setDaemon(true);
        thread.start();
    }

    /** On while the player is on a server. */
    public void setWanted(boolean on) {
        wanted = on;
        if (!on) {
            fightOn = false;
            outbox.clear();
        }
    }

    public boolean fightOn() { return connected && fightOn; }

    public String botName() { return botName; }

    /** Takes the pending fight notice (TRUE started, FALSE ended), or null. */
    public Boolean takeFightNotice() {
        Boolean notice = fightNotice;
        fightNotice = null;
        return notice;
    }

    public void send(String line) {
        if (!connected || line.length() > MAX_LINE) return;
        while (!outbox.offer(line)) outbox.poll();
    }

    private void run() {
        while (true) {
            if (!wanted) {
                sleep(500);
                continue;
            }
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(InetAddress.getLoopbackAddress(), port), CONNECT_TIMEOUT_MS);
                socket.setTcpNoDelay(true);
                Writer out = new OutputStreamWriter(socket.getOutputStream(), StandardCharsets.UTF_8);
                BufferedReader in = new BufferedReader(new InputStreamReader(socket.getInputStream(), StandardCharsets.UTF_8));
                outbox.clear();
                write(out, FrameJson.hello(playerName.get(), gameVersion));
                connected = true;
                Thread reader = new Thread(() -> read(in), "watita-sparring-link-read");
                reader.setDaemon(true);
                reader.start();
                while (wanted && connected) {
                    String line = outbox.poll(200, TimeUnit.MILLISECONDS);
                    if (line != null) write(out, line);
                }
            } catch (IOException | InterruptedException ignored) {
                // No bot listening, or it went away: try again later
            } finally {
                disconnect();
            }
            if (wanted) sleep(RETRY_MS);
        }
    }

    private void read(BufferedReader in) {
        try {
            String line;
            while ((line = in.readLine()) != null) {
                Map<String, Object> message = FrameJson.parse(line);
                if (message == null) continue;
                Object type = message.get("t");
                if ("hello".equals(type)) {
                    if (message.get("bot") instanceof String name) botName = name;
                    setFight(Boolean.TRUE.equals(message.get("fight")));
                } else if ("fight".equals(type)) {
                    setFight(Boolean.TRUE.equals(message.get("on")));
                }
            }
        } catch (IOException ignored) {
            // Closed: the writer loop notices through `connected`
        }
        connected = false;
    }

    private void setFight(boolean on) {
        if (on != fightOn) fightNotice = on;
        fightOn = on;
    }

    private void disconnect() {
        if (fightOn) fightNotice = false;
        connected = false;
        fightOn = false;
    }

    private static void write(Writer out, String line) throws IOException {
        out.write(line);
        out.write('\n');
        out.flush();
    }

    private static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
