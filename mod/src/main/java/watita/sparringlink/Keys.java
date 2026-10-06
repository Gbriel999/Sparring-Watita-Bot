package watita.sparringlink;

/** Bits of the game controls held in a tick ({@code k} of the protocol). */
public final class Keys {
    public static final int FORWARD = 1;
    public static final int BACK = 1 << 1;
    public static final int LEFT = 1 << 2;
    public static final int RIGHT = 1 << 3;
    public static final int JUMP = 1 << 4;
    public static final int SNEAK = 1 << 5;
    public static final int SPRINT = 1 << 6;
    public static final int ATTACK = 1 << 7;
    public static final int USE = 1 << 8;

    private Keys() {}
}
