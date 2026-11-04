import asyncio
import random

from .base import BaseGame

LOCATIONS = [
    "Beach", "Hospital", "School", "Airplane", "Casino", "Circus",
    "Submarine", "Space Station", "Restaurant", "Bank", "Movie Theater",
    "Zoo", "Pirate Ship", "Supermarket", "Police Station",
]
ROUND_SECONDS = 240


class SpyfallGame(BaseGame):
    min_players = 3
    max_players = 10

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.spy_id = random.choice(self.player_ids)
        self.location = random.choice(LOCATIONS)
        self.phase = "discussion"
        self.votes = {}
        self._task = None

    async def start(self):
        for pid in self.player_ids:
            if pid == self.spy_id:
                await self.send_to(pid, {"type": "role_info", "role": "spy", "locations": LOCATIONS})
            else:
                await self.send_to(pid, {"type": "role_info", "role": "villager", "location": self.location})

        await self.broadcast({
            "type": "game_state", "phase": "discussion",
            "seconds": ROUND_SECONDS, "players": self.player_ids,
        })
        self._task = asyncio.create_task(self._timer())

    async def cleanup(self):
        if self._task:
            self._task.cancel()

    async def _timer(self):
        try:
            await asyncio.sleep(ROUND_SECONDS)
            await self._start_voting()
        except asyncio.CancelledError:
            pass

    async def _start_voting(self):
        if self.phase == "voting":
            return
        self.phase = "voting"
        self.votes = {}
        await self.broadcast({"type": "game_state", "phase": "voting", "players": self.player_ids})

    async def handle_action(self, player_id, action):
        atype = action.get("type")

        if atype == "spy_guess_location" and player_id == self.spy_id and self.phase != "ended":
            guess = action.get("location")
            correct = guess == self.location
            await self.finish({
                "winner": self.spy_id if correct else None,
                "reason": "spy_guessed_correctly" if correct else "spy_guessed_wrong",
                "spy_id": self.spy_id,
                "location": self.location,
            })

        elif atype == "call_vote" and self.phase == "discussion":
            if self._task:
                self._task.cancel()
            await self._start_voting()

        elif atype == "vote" and self.phase == "voting":
            self.votes[player_id] = action.get("suspect")
            if len(self.votes) >= len(self.player_ids):
                await self._tally_votes()

    async def _tally_votes(self):
        self.phase = "ended"
        tally = {}
        for v in self.votes.values():
            if v:
                tally[v] = tally.get(v, 0) + 1

        if not tally:
            await self.finish({
                "winner": self.spy_id, "reason": "no_votes",
                "spy_id": self.spy_id, "location": self.location,
            })
            return

        top = max(tally.values())
        top_candidates = [pid for pid, c in tally.items() if c == top]
        accused = top_candidates[0] if len(top_candidates) == 1 else None
        correct = accused == self.spy_id

        await self.finish({
            "winner": None if correct else self.spy_id,
            "reason": "spy_caught" if correct else "spy_escaped",
            "spy_id": self.spy_id,
            "location": self.location,
            "accused": accused,
            "votes": self.votes,
        })
