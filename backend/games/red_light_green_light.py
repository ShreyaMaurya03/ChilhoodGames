import asyncio
import random

from .base import BaseGame

FINISH_LINE = 100
STEP = 7


class RedLightGreenLightGame(BaseGame):
    min_players = 1
    max_players = 12

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.position = {pid: 0 for pid in self.player_ids}
        self.alive = {pid: True for pid in self.player_ids}
        self.light = "red"
        self._task = None

    async def start(self):
        await self._broadcast_state()
        self._task = asyncio.create_task(self._light_loop())

    async def cleanup(self):
        if self._task:
            self._task.cancel()

    async def _broadcast_state(self):
        await self.broadcast({
            "type": "game_state",
            "light": self.light,
            "positions": self.position,
            "alive": self.alive,
            "finish_line": FINISH_LINE,
        })

    async def _light_loop(self):
        try:
            while True:
                self.light = "green"
                await self._broadcast_state()
                await asyncio.sleep(random.uniform(2.0, 4.0))

                self.light = "red"
                await self._broadcast_state()
                await asyncio.sleep(random.uniform(1.2, 2.5))
        except asyncio.CancelledError:
            pass

    def _alive_ids(self):
        return [pid for pid in self.player_ids if self.alive[pid]]

    async def handle_action(self, player_id, action):
        if not self.alive.get(player_id) or action.get("type") != "move":
            return

        if self.light == "red":
            self.alive[player_id] = False
            await self.broadcast({"type": "player_eliminated", "player_id": player_id})
            await self._broadcast_state()
            if len(self._alive_ids()) == 0:
                await self.finish({"winner": None, "reason": "all_eliminated"})
            return

        self.position[player_id] = min(FINISH_LINE, self.position[player_id] + STEP)
        await self._broadcast_state()

        if self.position[player_id] >= FINISH_LINE:
            await self.finish({"winner": player_id, "reason": "reached_finish"})
