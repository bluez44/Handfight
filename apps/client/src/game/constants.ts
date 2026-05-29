export const GAME = {
  PLAYER_SIZE:           48,
  MAX_HP:               100,
  GRAVITY:             1800,   // px/s²
  JUMP_VELOCITY:        -700,  // px/s
  MOVE_LERP:            0.15,
  REMOTE_LERP:          0.20,
  FLOOR_MARGIN:           80,  // px from bottom
  PUNCH_DAMAGE:           12,
  PUNCH_DAMAGE_BLOCKED:    4,
  PUNCH_RANGE:            90,  // px — horizontal distance
  KNOCKBACK_X:           350,  // px/s initial
  KNOCKBACK_Y:          -250,  // px/s upward
  KNOCKBACK_DECAY:         8,  // multiplier for exponential decay per second
  HIT_FLASH_MS:          150,
  HIT_COOLDOWN_MS:       300,
} as const;
