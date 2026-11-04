import asyncio
import random

from .base import BaseGame

COLORS = ["red", "green", "blue", "yellow"]


class SimonSaysGame(BaseGame):
    min_players = 1
    max_players = 12

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.sequence = []
        self.round = 0
        self.alive = {pid: True for pid in self.player_ids}
        self.pos = {pid: 0 for pid in self.player_ids}
        self.done_this_round = {pid: False for pid in self.player_ids}

    def _alive_ids(self):
        return [pid for pid in self.player_ids if self.alive[pid]]

    async def start(self):
        await self._next_round()

    async def _next_round(self):
        self.round += 1
        self.sequence.append(random.choice(COLORS))
        for pid in self._alive_ids():
            self.pos[pid] = 0
            self.done_this_round[pid] = False
        await self.broadcast({
            "type": "game_state",
            "round": self.round,
            "sequence": self.sequence,
            "players": [{"id": pid, "alive": self.alive[pid]} for pid in self.player_ids],
        })

    async def handle_action(self, player_id, action):
        if not self.alive.get(player_id) or self.done_this_round.get(player_id):
            return

        color = action.get("color")
        expected = self.sequence[self.pos[player_id]]

        if color != expected:
            self.alive[player_id] = False
            self.done_this_round[player_id] = True
            await self.broadcast({"type": "player_eliminated", "player_id": player_id, "round": self.round})
            await self._maybe_advance()
            return

        self.pos[player_id] += 1
        if self.pos[player_id] >= len(self.sequence):
            self.done_this_round[player_id] = True
            await self.broadcast({"type": "player_finished_round", "player_id": player_id, "round": self.round})
            await self._maybe_advance()

    async def _maybe_advance(self):
        alive_ids = self._alive_ids()
        if len(alive_ids) <= 1:
            winner = alive_ids[0] if alive_ids else None
            await self.finish({"winner": winner, "reason": "last_standing"})
            return
        if all(self.done_this_round[pid] for pid in alive_ids):
            await asyncio.sleep(1.0)
            await self._next_round()
