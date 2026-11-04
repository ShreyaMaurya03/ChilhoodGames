import asyncio
import random
import time

from .base import BaseGame

SIT_WINDOW = 2.0


class MusicalChairsGame(BaseGame):
    min_players = 2
    max_players = 12

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.alive = {pid: True for pid in self.player_ids}
        self.round = 0
        self.sit_times = {}
        self._task = None

    def _alive_ids(self):
        return [pid for pid in self.player_ids if self.alive[pid]]

    async def start(self):
        self._task = asyncio.create_task(self._run_rounds())

    async def cleanup(self):
        if self._task:
            self._task.cancel()

    async def _run_rounds(self):
        try:
            while len(self._alive_ids()) > 1:
                self.round += 1
                self.sit_times = {}
                await self.broadcast({
                    "type": "music_playing",
                    "round": self.round,
                    "alive": self._alive_ids(),
                })
                await asyncio.sleep(random.uniform(3.0, 6.0))

                deadline = time.monotonic() + SIT_WINDOW
                await self.broadcast({
                    "type": "music_stopped",
                    "round": self.round,
                    "window_seconds": SIT_WINDOW,
                })
                await asyncio.sleep(SIT_WINDOW)

                alive_ids = self._alive_ids()
                sat = {pid: t for pid, t in self.sit_times.items() if pid in alive_ids}
                did_not_sit = [pid for pid in alive_ids if pid not in sat]

                if did_not_sit:
                    eliminated = random.choice(did_not_sit)
                else:
                    eliminated = max(sat, key=sat.get)

                self.alive[eliminated] = False
                await self.broadcast({
                    "type": "player_eliminated",
                    "player_id": eliminated,
                    "round": self.round,
                })

                remaining = self._alive_ids()
                if len(remaining) <= 1:
                    winner = remaining[0] if remaining else None
                    await self.finish({"winner": winner, "reason": "last_standing"})
                    return

                await asyncio.sleep(1.5)
        except asyncio.CancelledError:
            pass

    async def handle_action(self, player_id, action):
        if action.get("type") != "sit" or not self.alive.get(player_id):
            return
        if player_id not in self.sit_times:
            self.sit_times[player_id] = time.monotonic()
