import math
import random

ARENA_SIZE = 100
PLAYER_SPEED = 3.0
TICK_SECONDS = 0.15


class ArenaMixin:
    """Shared 2D free-movement plumbing for chase-style games."""

    def init_arena(self):
        self.positions = {
            pid: {"x": random.uniform(15, 85), "y": random.uniform(15, 85)}
            for pid in self.player_ids
        }
        self.move_input = {pid: {"dx": 0.0, "dy": 0.0} for pid in self.player_ids}

    def set_move_input(self, pid, dx, dy):
        dx = max(-1, min(1, dx))
        dy = max(-1, min(1, dy))
        length = math.hypot(dx, dy)
        if length > 1:
            dx, dy = dx / length, dy / length
        self.move_input[pid] = {"dx": dx, "dy": dy}

    def apply_movement(self, pid):
        pos = self.positions[pid]
        inp = self.move_input[pid]
        pos["x"] = max(0, min(ARENA_SIZE, pos["x"] + inp["dx"] * PLAYER_SPEED))
        pos["y"] = max(0, min(ARENA_SIZE, pos["y"] + inp["dy"] * PLAYER_SPEED))

    def distance(self, pid_a, pid_b):
        a, b = self.positions[pid_a], self.positions[pid_b]
        return math.hypot(a["x"] - b["x"], a["y"] - b["y"])
