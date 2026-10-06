package watita.sparringlink.mixin;

import net.minecraft.client.Minecraft;
import org.spongepowered.asm.mixin.Mixin;
import org.spongepowered.asm.mixin.injection.At;
import org.spongepowered.asm.mixin.injection.Inject;
import org.spongepowered.asm.mixin.injection.callback.CallbackInfoReturnable;
import watita.sparringlink.SparringLinkMod;

/** Every attack click, hit or miss, at its start: the charge is still the one before the game resets it. */
@Mixin(Minecraft.class)
abstract class AttackMixin {
    @Inject(method = "startAttack", at = @At("HEAD"))
    private void watita$attack(CallbackInfoReturnable<Boolean> cir) {
        SparringLinkMod.onAttack((Minecraft) (Object) this);
    }
}
