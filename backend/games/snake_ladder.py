import random

from .base import BaseGame

BOARD_SIZE = 100

SNAKES = {16: 6, 47: 26, 49: 11, 56: 53, 62: 19, 64: 60, 87: 24, 93: 73, 95: 75, 98: 78}
LADDERS = {1: 38, 4: 14, 9: 31, 21: 42, 28: 84, 36: 44, 51: 67, 71: 91, 80: 100}


class SnakeLadderGame(BaseGame):
    min_players = 2
    max_players = 4

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.positions = {pid: 0 for pid in player_ids}
        self.turn_index = 0
        self.last_roll = None

    def _current_player(self):
        return self.player_ids[self.turn_index % len(self.player_ids)]

    async def start(self):
        await self._broadcast_state()

    async def _broadcast_state(self):
        await self.broadcast({
            "type": "game_state",
            "positions": self.positions,
            "current_player": self._current_player(),
            "last_roll": self.last_roll,
            "snakes": SNAKES,
            "ladders": LADDERS,
        })

    async def handle_action(self, player_id, action):
        if action.get("type") != "roll" or player_id != self._current_player():
            return

        roll = random.randint(1, 6)
        self.last_roll = roll
        pos = self.positions[player_id]
        new_pos = pos + roll
        moved = False
        landed_on = None

        if new_pos <= BOARD_SIZE:
            if new_pos in SNAKES:
                landed_on = "snake"
                new_pos = SNAKES[new_pos]
            elif new_pos in LADDERS:
                landed_on = "ladder"
                new_pos = LADDERS[new_pos]
            self.positions[player_id] = new_pos
            moved = True

        await self.broadcast({
            "type": "dice_rolled", "player_id": player_id, "roll": roll,
            "moved": moved, "new_position": self.positions[player_id], "landed_on": landed_on,
        })

        if self.positions[player_id] >= BOARD_SIZE:
            await self._broadcast_state()
            await self.finish({"winner": player_id, "reason": "reached_100"})
            return

        if roll != 6:
            self.turn_index += 1
        await self._broadcast_state()
