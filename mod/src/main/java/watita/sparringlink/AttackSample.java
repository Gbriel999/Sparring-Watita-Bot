package watita.sparringlink;

/**
 * One attack click, as the player was at that instant: the charge before the game resets it, the ground
 * state, the vertical speed, the sprint, and whether and how far the bot was in the crosshair.
 */
public record AttackSample(double charge, boolean onGround, double vy, boolean sprinting, boolean aim, Double dist) {}
