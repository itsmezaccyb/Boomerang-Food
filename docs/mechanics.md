# Mechanics reference: Boomerang Fu → Boomerang Bites

Research notes on how Boomerang Fu (Cranky Watermelon, 2020) plays, and how Boomerang Bites implements each mechanic.
We copy **mechanics** (game rules), not Boomerang Fu's name, characters, art, sound, or levels.

## What Boomerang Fu does (from research)

| Area | Boomerang Fu behaviour | Confidence |
|---|---|---|
| Controls | Three actions: **Throw**, **Slash** (melee) and **Dash**, plus a taunt. Slash and throw are **separate buttons**. | High (multiple sources) |
| Throw | **Hold throw** to charge. An **arrow shows aim and power**. Release to throw in the aimed direction. | High |
| Weaponless | Throwing leaves you **unarmed** until you get the boomerang back. | High |
| Return | Boomerangs fly out and **come back on their own**, and **hit on the way out and on the way back**. | High |
| Walls | Boomerangs **bounce off walls**, which is used for trick shots. | Medium (reviews) |
| Getting stuck | A boomerang can **snag and not come back**. Then you **walk over it** to pick it up. | High |
| Recall ("pull back") | **Hold the throw button** while unarmed and your boomerang is **pulled back** to you. It **kills opponents it hits on the way**. It's a match option ("Pull back"), so it can be turned off. | High |
| Slash | **Deadly when you have your boomerang**. **Without it, the slash only knocks back.** | High |
| Parry | Slashing an incoming boomerang **parries** it. A parried telekinesis boomerang loses control and heads back. | Medium |
| Dash | Short burst for dodging and **crossing gaps** (pits/water). | High |
| Power-ups | Come from breakable boxes. Most **last the whole game**. **Up to 3 stack**; picking up a 4th drops the oldest. **Shield** is separate (one hit). | High |

### Boomerang Fu power-ups (names are generic game terms)

| Power-up | Effect |
|---|---|
| Move Faster | Run speed up |
| Dash Through Walls | Dash passes through obstacles |
| Teleport | While your boomerang is out, **press dash to teleport to it** |
| Explosive | Boomerang **explodes** in a radius |
| Multi | Boomerang **splits into several** |
| Fire | Boomerang leaves a **fire trail that kills** whoever touches it |
| Ice | Boomerang leaves an **ice trail that freezes** players in place (not deadly) |
| Telekinesis | **Hold throw and steer** your flying boomerang with the stick, within a radius. Let go and it returns |
| Shield | Survive one hit |
| Disguise | Stand still to turn into a prop. Moving or charging reveals you |
| Extra Boomerang / Decoy / Drill / Bamboozled / Battle Royale | Various (not fully documented in sources found) |

## What Boomerang Bites implements

### Controls
| Action | Touch | Keyboard P1 | Keyboard P2 | Controller |
|---|---|---|---|---|
| Move | Left-side joystick | WASD | Arrows | Left stick / D-pad |
| Throw (hold = charge, drag = aim) | Right-side drag/hold | J / Space | / | A or RT, aim with right stick |
| Recall / steer | Hold right side while unarmed | hold J | hold / | hold A/RT |
| Slash | **SLASH** button | L | , | X or RB |
| Dash | **DASH** button | K / Shift | . | B or LT |

### Aiming (fixes "it doesn't go where I'm throwing")
- When you start charging, the game locks an **aim direction**.
- If you're using an aim stick (touch drag on the right side, or a controller right stick), that stick sets the aim, and **letting go of the stick never resets it**. The throw goes exactly where the arrow last pointed.
- Without an aim stick (keyboard, or a tap without dragging), the aim follows the way you're running.
- While charging, a **dotted line and a target ring** show exactly where the boomerang will reach.

### Boomerang flight
1. **Out**: flies in the aimed direction, slowing down, up to a range set by the charge (about 3.5 to 10.5 tiles).
2. **Walls**: it **bounces** off walls and boxes (boxes break) and loses about 30% speed per bounce.
3. **Return**: once out of range it curves back toward its owner. It does **not** pass through walls on the way back.
4. **Stuck**: it **drops to the floor** if it bounces 3 times, gets too slow, or flies for too long (4 s).
5. **Pick up**: walk over your dropped boomerang to grab it.
6. **Recall (summon)**: while unarmed, **hold throw**. Your boomerang lifts off and flies straight to you, over walls, speeding up as it goes, and **kills anyone in its path**. Let go and it carries on as a normal returning boomerang.
7. It hits players **on the way out, on the way back, and during recall**. Your own boomerang never hurts you, except one you've had **parried back** at you.

### Slash
- Separate button with a short **lunge**, a 150° arc in front of you, and a 0.4 s cooldown.
- **With your boomerang**: kills.
- **Without it**: a **shove** with strong knockback. It isn't deadly, but it can push people into hot-sauce pits.
- **Parry**: a slash knocks incoming boomerangs back the way you're facing. A parried boomerang **can kill its own thrower**.

### Dash
- Quick burst with a 0.8 s cooldown that **hops over pits**.
- With **Teleport**: dashing while your boomerang is out teleports you to it, and you catch it.

### Power-ups
**Stack up to 3**; picking up a 4th drops the oldest. **Shield** is separate and absorbs one hit.

| Power-up | Effect |
|---|---|
| Explosive | Explodes at the end of its flight, or on its first hit |
| Fire Trail | Leaves fire for 2.2 s that kills anyone but you |
| Ice Trail | Leaves ice that freezes others for 1.3 s |
| Triple | Throws 3 boomerangs at once |
| Telekinesis | Hold throw to **steer** your flying boomerang (right-side drag, right stick, or movement keys) |
| Teleport | Dash while your boomerang is out to warp to it |
| Ghost | Boomerang passes through walls |
| Speedy Feet | Run 35% faster |
| Shield | Survive one hit |

### Not implemented yet
Disguise, Decoy, Drill, Dash Through Walls, a match option to switch recall off, and taunts.

## Sources
- [Boomerang Fu: Wikipedia](https://en.wikipedia.org/wiki/Boomerang_Fu)
- [Boomerang Fu official site](https://www.boomerangfu.com/) (power-up roster)
- [Boomerang Fu Wiki: Controls](https://boomerangfu.fandom.com/wiki/Controls)
- [Boomerang Fu Wiki: Powerups](https://boomerangfu.fandom.com/wiki/Powerups)
- [Boomerang Fu Wiki: Telekinesis Boomerang](https://boomerangfu.fandom.com/wiki/Telekinesis_Boomerang)
- [Boomerang Fu Wiki: Modifiers](https://boomerangfu.fandom.com/wiki/Modifiers) ("Pull back" option)
- [Steam guide: How to play and win at Boomerang Fu](https://steamcommunity.com/sharedfiles/filedetails/?id=2204801045)
- [PowerUp Gaming review](https://powerup-gaming.com/boomerang-fu-review-switch-a-throwback-to-throwing-back/) (recall by holding throw)
- [Family Gaming Database accessibility report](https://www.familygamingdatabase.com/accessibility/Boomerang+Fu)
- [Chapter Cheats power-ups guide](https://www.chaptercheats.com/cheat/switch/486105/boomerang-fu/hint/151268)

The fan wiki and Steam pages were cited through search summaries, because those sites weren't reachable from the build environment.
