import asyncio
import random

from .base import BaseGame

TURN_SECONDS = 20
START_LETTERS = "ABCDEFGHIJKLMNOPRSTW"


class AntaksharyGame(BaseGame):
    min_players = 2
    max_players = 12

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.alive = {pid: True for pid in player_ids}
        self.order = player_ids[:]
        random.shuffle(self.order)
        self.turn_index = 0
        self.current_letter = random.choice(START_LETTERS)
        self.history = []
        self._task = None
        self._turn_event = None

    def _alive_order(self):
        return [pid for pid in self.order if self.alive[pid]]

    def _current_player(self):
        alive = self._alive_order()
        if not alive:
            return None
        return alive[self.turn_index % len(alive)]

    async def start(self):
        self._task = asyncio.create_task(self._run())

    async def cleanup(self):
        if self._task:
            self._task.cancel()

    async def _broadcast_state(self):
        await self.broadcast({
            "type": "game_state",
            "current_player": self._current_player(),
            "letter": self.current_letter,
            "seconds": TURN_SECONDS,
            "alive": self._alive_order(),
            "history": self.history[-20:],
        })

    async def _run(self):
        try:
            while len(self._alive_order()) > 1:
                current = self._current_player()
                self._turn_event = asyncio.Event()
                await self._broadcast_state()
                try:
                    await asyncio.wait_for(self._turn_event.wait(), timeout=TURN_SECONDS)
                except asyncio.TimeoutError:
                    self.alive[current] = False
                    await self.broadcast({"type": "player_eliminated", "player_id": current, "reason": "timeout"})
                    continue
                self.turn_index += 1

            alive = self._alive_order()
            winner = alive[0] if alive else None
            await self.finish({"winner": winner, "reason": "last_standing", "history": self.history[-30:]})
        except asyncio.CancelledError:
            pass

    async def handle_action(self, player_id, action):
        if action.get("type") != "submit" or player_id != self._current_player():
            return
        text = str(action.get("text", "")).strip()
        if not text:
            return
        if text[0].upper() != self.current_letter:
            await self.send_to(player_id, {
                "type": "error",
                "message": f"Must start with the letter '{self.current_letter}'.",
            })
            return
        words = [w for w in text.split() if w.isalpha()]
        last_letter = words[-1][-1].upper() if words else text[-1].upper()
        self.history.append({"player_id": player_id, "text": text})
        self.current_letter = last_letter
        if self._turn_event:
            self._turn_event.set()
