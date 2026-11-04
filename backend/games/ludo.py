import random

from .base import BaseGame

START_OFFSETS = {"red": 0, "green": 13, "yellow": 26, "blue": 39}
SAFE_SQUARES = {0, 8, 13, 21, 26, 34, 39, 47}
RING_LEN = 51
HOME_ENTRY_STEP = 51
FINISH_STEP = 57

COLOR_SETS = {
    2: ["red", "yellow"],
    3: ["red", "green", "blue"],
    4: ["red", "green", "yellow", "blue"],
}


class LudoGame(BaseGame):
    min_players = 2
    max_players = 4

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        colors = COLOR_SETS[len(player_ids)]
        self.colors = {pid: colors[i] for i, pid in enumerate(player_ids)}
        self.tokens = {pid: [{"state": "base", "steps": 0} for _ in range(4)] for pid in player_ids}
        self.turn_index = 0
        self.pending_roll = None
        self.consecutive_sixes = 0

    def _current_player(self):
        return self.player_ids[self.turn_index % len(self.player_ids)]

    def _global_pos(self, pid, steps):
        return (START_OFFSETS[self.colors[pid]] + steps) % 52

    async def start(self):
        await self._broadcast_state()

    async def _broadcast_state(self, extra=None):
        payload = {
            "type": "game_state",
            "colors": self.colors,
            "tokens": self.tokens,
            "current_player": self._current_player(),
            "pending_roll": self.pending_roll,
        }
        if extra:
            payload.update(extra)
        await self.broadcast(payload)

    def _movable_tokens(self, pid, roll):
        movable = []
        for i, token in enumerate(self.tokens[pid]):
            if token["state"] == "base":
                if roll == 6:
                    movable.append(i)
            elif token["state"] in ("active", "home_stretch"):
                if token["steps"] + roll <= FINISH_STEP:
                    movable.append(i)
        return movable

    async def _advance_turn(self):
        self.turn_index += 1
        self.consecutive_sixes = 0
        self.pending_roll = None

    async def handle_action(self, player_id, action):
        if player_id != self._current_player():
            return
        atype = action.get("type")

        if atype == "roll":
            if self.pending_roll is not None:
                return
            roll = random.randint(1, 6)

            if roll == 6:
                self.consecutive_sixes += 1
            else:
                self.consecutive_sixes = 0

            if self.consecutive_sixes >= 3:
                await self.broadcast({"type": "dice_rolled", "player_id": player_id, "roll": roll,
                                       "movable": [], "forfeited": True})
                await self._advance_turn()
                await self._broadcast_state()
                return

            movable = self._movable_tokens(player_id, roll)
            if not movable:
                await self.broadcast({"type": "dice_rolled", "player_id": player_id, "roll": roll,
                                       "movable": [], "forfeited": False})
                await self._advance_turn()
                await self._broadcast_state()
                return

            self.pending_roll = roll
            await self.broadcast({"type": "dice_rolled", "player_id": player_id, "roll": roll,
                                   "movable": movable, "forfeited": False})
            await self._broadcast_state()

        elif atype == "move_token":
            if self.pending_roll is None:
                return
            roll = self.pending_roll
            idx = action.get("token_index")
            movable = self._movable_tokens(player_id, roll)
            if not isinstance(idx, int) or idx not in movable:
                return

            token = self.tokens[player_id][idx]
            capture_happened = False
            finished_now = False

            if token["state"] == "base":
                token["state"] = "active"
                token["steps"] = 0
            else:
                new_steps = token["steps"] + roll
                token["steps"] = new_steps
                if new_steps == FINISH_STEP:
                    token["state"] = "finished"
                    finished_now = True
                elif new_steps > RING_LEN - 1:
                    token["state"] = "home_stretch"
                else:
                    token["state"] = "active"

            if token["state"] == "active":
                pos = self._global_pos(player_id, token["steps"])
                if pos not in SAFE_SQUARES:
                    for other_pid in self.player_ids:
                        if other_pid == player_id:
                            continue
                        for other_token in self.tokens[other_pid]:
                            if other_token["state"] == "active" and self._global_pos(other_pid, other_token["steps"]) == pos:
                                other_token["state"] = "base"
                                other_token["steps"] = 0
                                capture_happened = True

            won = all(t["state"] == "finished" for t in self.tokens[player_id])
            if won:
                await self._broadcast_state(extra={"capture": capture_happened})
                await self.finish({"winner": player_id, "reason": "all_tokens_home", "colors": self.colors})
                return

            bonus_turn = (roll == 6) or capture_happened or finished_now
            self.pending_roll = None
            if not bonus_turn:
                await self._advance_turn()

            await self._broadcast_state(extra={"capture": capture_happened})
