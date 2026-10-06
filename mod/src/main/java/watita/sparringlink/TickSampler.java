package watita.sparringlink;

import net.minecraft.client.Minecraft;
import net.minecraft.client.Options;
import net.minecraft.client.player.AbstractClientPlayer;
import net.minecraft.client.player.LocalPlayer;
import net.minecraft.network.chat.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * Builds one frame per client tick while a fight runs: the game controls held, the player's state, whether it was
 * just hurt, where the bot is, and the attack clicks of the tick (recorded by the attack mixin as they happen).
 * Everything runs on the game thread. Nothing is sampled with a screen open, so typing is never seen.
 */
public final class TickSampler {
    private final LinkClient link;
    private final List<AttackSample> attacks = new ArrayList<>();
    private long seq;
    private int lastHurtTime;

    public TickSampler(LinkClient link) {
        this.link = link;
    }

    /** Called from the attack mixin at the start of an attack click, before the game resets the charge. */
    public void onAttack(Minecraft client) {
        LocalPlayer player = client.player;
        if (!link.fightOn() || player == null || client.gui.screen() != null) return;
        AbstractClientPlayer bot = findBot(client);
        attacks.add(new AttackSample(player.getAttackStrengthScale(0.5f), player.onGround(),
                player.getDeltaMovement().y, player.isSprinting(), bot != null && client.crosshairPickEntity == bot,
                distanceTo(player, bot)));
    }

    public void onTick(Minecraft client) {
        showNotice(client);
        LocalPlayer player = client.player;
        if (player == null || client.level == null) {
            attacks.clear();
            lastHurtTime = 0;
            return;
        }
        // Hurt: hurtTime jumps back up when a hit lands on us
        boolean hurt = player.hurtTime > lastHurtTime;
        lastHurtTime = player.hurtTime;
        // Every tick counts, sent or not: a menu or a pause shows up to the bot as a gap in seq
        seq++;
        if (!link.fightOn() || client.gui.screen() != null) {
            attacks.clear();
            return;
        }
        AbstractClientPlayer bot = findBot(client);
        TickFrame frame = new TickFrame(seq, player.tickCount, System.currentTimeMillis(), keys(client.options),
                player.isSprinting(), player.onGround(), player.getDeltaMovement().y, hurt, distanceTo(player, bot),
                bot != null && client.crosshairPickEntity == bot, List.copyOf(attacks));
        attacks.clear();
        link.send(FrameJson.tick(frame));
    }

    private void showNotice(Minecraft client) {
        Boolean notice = link.takeFightNotice();
        if (notice == null || client.player == null) return;
        client.player.sendOverlayMessage(Component.literal(notice
                ? "Watita: el bot está aprendiendo de tus teclas"
                : "Watita: pelea terminada"));
    }

    private AbstractClientPlayer findBot(Minecraft client) {
        String name = link.botName();
        if (name.isEmpty() || client.level == null) return null;
        for (AbstractClientPlayer other : client.level.players()) {
            if (other != client.player && other.getScoreboardName().equalsIgnoreCase(name)) return other;
        }
        return null;
    }

    /** From the player's eye to the closest point of the bot's box, like the server measures reach. */
    private static Double distanceTo(LocalPlayer player, AbstractClientPlayer bot) {
        if (bot == null) return null;
        return Math.sqrt(bot.getBoundingBox().distanceToSqr(player.getEyePosition()));
    }

    private static int keys(Options options) {
        int keys = 0;
        if (options.keyUp.isDown()) keys |= Keys.FORWARD;
        if (options.keyDown.isDown()) keys |= Keys.BACK;
        if (options.keyLeft.isDown()) keys |= Keys.LEFT;
        if (options.keyRight.isDown()) keys |= Keys.RIGHT;
        if (options.keyJump.isDown()) keys |= Keys.JUMP;
        if (options.keyShift.isDown()) keys |= Keys.SNEAK;
        if (options.keySprint.isDown()) keys |= Keys.SPRINT;
        if (options.keyAttack.isDown()) keys |= Keys.ATTACK;
        if (options.keyUse.isDown()) keys |= Keys.USE;
        return keys;
    }
}
