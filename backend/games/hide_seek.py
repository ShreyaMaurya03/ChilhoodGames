import asyncio
import random

from .arena import ArenaMixin, TICK_SECONDS
from .base import BaseGame

HIDE_SECONDS = 15
SEEK_SECONDS = 90
TAG_RADIUS = 6


class HideSeekGame(BaseGame, ArenaMixin):
    min_players = 3
    max_players = 10

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.init_arena()
        shuffled = player_ids[:]
        random.shuffle(shuffled)
        self.seeker_id = shuffled[0]
        self.hider_ids = shuffled[1:]
        self.found = {pid: False for pid in self.hider_ids}
        self.phase = "hiding"
        self.seconds_left = HIDE_SECONDS
        self._task = None

    async def start(self):
        for pid in self.player_ids:
            role = "seeker" if pid == self.seeker_id else "hider"
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

                if self.phase == "hiding":
                    for pid in self.hider_ids:
                        self.apply_movement(pid)
                    self.seconds_left = max(0.0, HIDE_SECONDS - elapsed)
                    if elapsed >= HIDE_SECONDS:
                        self.phase = "seeking"
                        elapsed = 0.0
                        self.seconds_left = SEEK_SECONDS

                else:
                    self.apply_movement(self.seeker_id)
                    for pid in self.hider_ids:
                        if not self.found[pid]:
                            self.apply_movement(pid)
                    self.seconds_left = max(0.0, SEEK_SECONDS - elapsed)

                    for pid in self.hider_ids:
                        if not self.found[pid] and self.distance(self.seeker_id, pid) <= TAG_RADIUS:
                            self.found[pid] = True
                            await self.broadcast({"type": "player_found", "player_id": pid})

                    if all(self.found.values()):
                        await self._broadcast_state()
                        await self.finish({"winner": self.seeker_id, "reason": "all_found",
                                            "seeker_id": self.seeker_id})
                        return
                    if elapsed >= SEEK_SECONDS:
                        await self._broadcast_state()
                        await self.finish({
                            "winner": None, "reason": "time_up", "seeker_id": self.seeker_id,
                            "hiders_remaining": [pid for pid, found in self.found.items() if not found],
                        })
                        return

                await self._broadcast_state()
        except asyncio.CancelledError:
            pass

    async def _broadcast_state(self):
        for pid in self.player_ids:
            is_seeker = pid == self.seeker_id
            visible = {self.seeker_id: {**self.positions[self.seeker_id], "role": "seeker"}}
            for other in self.hider_ids:
                if is_seeker:
                    if self.found[other]:
                        visible[other] = {**self.positions[other], "role": "hider", "found": True}
                else:
                    visible[other] = {**self.positions[other], "role": "hider", "found": self.found[other]}
            await self.send_to(pid, {
                "type": "game_state",
                "phase": self.phase,
                "seconds_left": round(self.seconds_left, 1),
                "positions": visible,
            })

    async def handle_action(self, player_id, action):
        if action.get("type") != "move":
            return
        if self.phase == "hiding" and player_id == self.seeker_id:
            return
        if self.found.get(player_id):
            return
        self.set_move_input(player_id, action.get("dx", 0), action.get("dy", 0))
