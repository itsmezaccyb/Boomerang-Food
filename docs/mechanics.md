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
| Curving | The official store page says you can **"curve your throws around corners"**. | High (official listing) |
| Power-ups | Come from breakable boxes. Most **last the whole game**. **Up to 3 stack**; picking up a 4th drops the oldest. **Shield** is separate (one hit). Power-ups spawn **20% less often per power-up already collected**. | High (patch notes) |
| Arenas | 36 arenas in 7 biomes. **Foliage to hide in**, pits and water, **slippery floors**, **teleporters**, **sliding walls** that crush, **moving/tilting platforms**, rolling pins. 5% chance of rain on maps without falls. | Medium (store page, reviews, wiki) |
| Modes | **Free-for-all** (last one standing, or most kills), **Team Up** (with friendly-fire and revive options), **Golden Boomerang** (keep-away: hold the single golden boomerang long enough to win; carrying it slows you), **Hide & Seek** (2024 update, adjustable time limit and seek attempts). | High |
| Match options ("Modifiers") | Pull-back (recall) on/off, power-up spawn rate 0.5x / 1x / 2x, enable or disable each power-up, lives per map, match length. | High (wiki, patch notes) |
| Players | Up to **6** local players. | High |

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
| Extra Boomerang | A second boomerang in your other hand. Throw both, then recall once both are out. Attacks are faster |
| Decoy | **Dash to create an illusory copy** of yourself that wanders and doesn't attack. It disappears when hit |
| Drill | Drills **through solid objects**. Boomerangs **no longer bounce or get dropped** |
| Bamboozled | Anti-power-up: **controls inverted for a short time**. It doesn't take a power-up slot and is **never the first pickup** of a match |
| Battle Royale | One-use: shrinks the play area around where it was picked up |
| Disguise | Stand still to become a random prop. Moving or charging a throw breaks it |

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

### Curving
After throwing, **push the aim stick** to bend the boomerang (up to about 150° a second) around corners. On touch, drag on the right side quickly after a throw. A short hold without dragging calls it back instead. Bots don't curve.

### Boomerang flight
1. **Out**: flies in the aimed direction, slowing down, up to a range set by the charge (about 3.5 to 10.5 tiles).
2. **Walls**: it **bounces** off walls and boxes (boxes break) and loses about 30% speed per bounce.
3. **Return**: once out of range it curves back toward its owner. It does **not** pass through walls on the way back.
4. **Stuck**: it **drops to the floor** if it bounces 3 times, gets too slow, or flies for too long (4 s).
5. **Pick up**: walk over your dropped boomerang to grab it.
6. **Recall (summon)**: while unarmed, **hold throw** for a moment (0.2 s). Your boomerang lifts off and flies straight to you, over walls, speeding up as it goes, and **kills anyone in its path**. Let go and it carries on as a normal returning boomerang.
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
| Drill | Goes straight through walls, breaks boxes, never bounces or drops |
| Speedy Feet | Run 35% faster |
| Shield | Survive one hit |
| Disguise | Stand still for 1.2 s to turn into a box. Moving or acting reveals you. CPUs ignore you unless they're close |
| Decoy | Your first dash each round leaves a fake copy running the other way. It pops when hit |
| Bamboozled | Bad pickup: controls flipped for 5 s. It doesn't take a slot and is never the first pickup of a match |

Power-ups get rarer as people collect them: 20% fewer for each power-up anyone holds.

### Arena features
| Tile | Behaviour | Arena |
|---|---|---|
| Tall grass | Walk through it. You're **invisible to other players** unless they're within about 1.5 tiles (phones show each player their own view; shared screens show a faint outline). CPUs can't see you either | Salad Bar |
| Ice | Slippery: you keep sliding and turn slowly | Freezer |
| Teleporter pad | Step on it to warp to the pad on the opposite side | Portal Pantry |
| Hot-sauce pit | Fall in and you're out. Dash over it | Picnic, Sauce Pit |

### Modes and options
- **Free-for-all**: last snack standing scores.
- **Teams (2v2)**: Red (slots 1 and 3) vs Blue (slots 2 and 4). **No friendly fire**: boomerangs, slashes, fire and explosions don't hurt teammates (shoves still push them). The whole surviving team scores. Teammates in grass show faintly.
- **Power-ups**: Normal / Lots (2x) / Few (0.5x) / Off.
- **Hold to call back**: on / off (off means you have to walk to a dropped boomerang).

### Not implemented yet (ideas for later)
- **Golden Boomerang** and **Hide & Seek** modes
- **Revive** in teams
- **Lives per map**
- **Turning individual power-ups on and off**
- **Up to 6 players**
- **Extra Boomerang**, **Battle Royale** and **Dash Through Walls** power-ups
- **Sliding/crushing walls** and **moving platforms**
- **Rain**
- **Taunts**

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
- [Steam store page](https://store.steampowered.com/app/965680/Boomerang_Fu/) (arenas, sliding walls)
- [Steam news: Decoy power-up and better bots (1.1.3)](https://store.steampowered.com/news/app/965680/view/2975175813414855753)
- [Boomerang Fu Wiki: Extra Boomerang](https://boomerangfu.fandom.com/wiki/Extra_Boomerang)
- [Boomerang Fu Wiki: Bamboozled](https://boomerangfu.fandom.com/wiki/Bamboozled)
- [Boomerang Fu Wiki: Arenas](https://boomerangfu.fandom.com/wiki/Arenas)
- [Nintendo Life review](https://www.nintendolife.com/reviews/switch-eshop/boomerang_fu) (Golden Boomerang mode)
- [Perfectly Nintendo: update history](https://www.perfectly-nintendo.com/boomerang-fu-switch-software-updates/) (Drill, Hide & Seek)
- [Family Gaming Database](https://www.familygamingdatabase.com/en-us/game/Boomerang+Fu) (foliage, moving platforms)
- [Gamer Heads review](https://www.gamerheadspodcast.com/post/review-boomerang-fu) (slippery floors)

The fan wiki and Steam pages were cited through search summaries, because those sites weren't reachable from the build environment.
