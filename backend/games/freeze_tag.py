import asyncio
import random

from .arena import ArenaMixin, TICK_SECONDS
from .base import BaseGame

ROUND_SECONDS = 90
TAG_RADIUS = 6
UNFREEZE_RADIUS = 6


class FreezeTagGame(BaseGame, ArenaMixin):
    min_players = 3
    max_players = 12

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.init_arena()
        shuffled = player_ids[:]
        random.shuffle(shuffled)
        self.it_id = shuffled[0]
        self.runner_ids = shuffled[1:]
        self.frozen = {pid: False for pid in self.runner_ids}
        self.seconds_left = ROUND_SECONDS
        self._task = None

    async def start(self):
        for pid in self.player_ids:
            role = "it" if pid == self.it_id else "runner"
            await self.send_to(pid, {"type": "role_info", "role": role})
        self._task = asyncio.create_task(self._run())

    async def cleanup(self):
        if self._task:
            self._task.cancel()

    async def _run(self):
        try:
            elapsed = 0.0
            while True:
                await asyncio.sleep(TICK_SECONDS)
                elapsed += TICK_SECONDS
                self.seconds_left = max(0.0, ROUND_SECONDS - elapsed)

                self.apply_movement(self.it_id)
                for pid in self.runner_ids:
                    if not self.frozen[pid]:
                        self.apply_movement(pid)

                for pid in self.runner_ids:
                    if not self.frozen[pid] and self.distance(self.it_id, pid) <= TAG_RADIUS:
                        self.frozen[pid] = True
                        await self.broadcast({"type": "player_frozen", "player_id": pid})

                for pid in self.runner_ids:
                    if not self.frozen[pid]:
                        continue
                    for other in self.runner_ids:
                        if other != pid and not self.frozen[other] and self.distance(pid, other) <= UNFREEZE_RADIUS:
                            self.frozen[pid] = False
                            await self.broadcast({"type": "player_unfrozen", "player_id": pid})
                            break

                if all(self.frozen.values()):
                    await self._broadcast_state()
                    await self.finish({"winner": self.it_id, "reason": "all_frozen", "it_id": self.it_id})
                    return
                if elapsed >= ROUND_SECONDS:
                    await self._broadcast_state()
                    await self.finish({"winner": "runners", "reason": "time_up", "it_id": self.it_id})
                    return

                await self._broadcast_state()
        except asyncio.CancelledError:
            pass

    async def _broadcast_state(self):
        positions = {}
        for pid in self.player_ids:
            role = "it" if pid == self.it_id else "runner"
            entry = {**self.positions[pid], "role": role}
            if role == "runner":
                entry["frozen"] = self.frozen[pid]
            positions[pid] = entry
        await self.broadcast({
            "type": "game_state",
            "seconds_left": round(self.seconds_left, 1),
            "positions": positions,
        })

    async def handle_action(self, player_id, action):
        if action.get("type") != "move":
            return
        if self.frozen.get(player_id):
            return
        self.set_move_input(player_id, action.get("dx", 0), action.get("dy", 0))
