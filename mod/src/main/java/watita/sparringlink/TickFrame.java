package watita.sparringlink;

import java.util.List;

/** What the player did in one client tick ({@code "t":"tick"} of the protocol). */
public record TickFrame(long seq, int tick, long ms, int keys, boolean sprinting, boolean onGround, double vy,
        boolean hurt, Double dist, boolean aim, List<AttackSample> attacks) {}
