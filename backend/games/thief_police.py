import random

from .base import BaseGame

ROLES = ["king", "minister", "police", "thief"]
POINTS = {
    "king": 1000,
    "minister": 800,
    "police_correct": 500,
    "police_wrong": 0,
    "thief_caught": 0,
    "thief_free": 300,
}


class ThiefPoliceGame(BaseGame):
    min_players = 4
    max_players = 4

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.roles = {}
        self.police_id = None
        self.thief_id = None
        self.guess_made = False

    async def start(self):
        shuffled = self.player_ids[:]
        random.shuffle(shuffled)
        self.roles = dict(zip(shuffled, ROLES))
        self.police_id = next(pid for pid, r in self.roles.items() if r == "police")
        self.thief_id = next(pid for pid, r in self.roles.items() if r == "thief")

        for pid, role in self.roles.items():
            await self.send_to(pid, {"type": "role_info", "role": role})

        await self.broadcast({
            "type": "game_state",
            "police_id": self.police_id,
            "suspects": [pid for pid in self.player_ids if pid != self.police_id],
        })

    async def handle_action(self, player_id, action):
        if self.guess_made or player_id != self.police_id or action.get("type") != "guess":
            return
        self.guess_made = True
        suspect = action.get("suspect")
        correct = suspect == self.thief_id

        points = {}
        for pid, role in self.roles.items():
            if role == "king":
                points[pid] = POINTS["king"]
            elif role == "minister":
                points[pid] = POINTS["minister"]
            elif role == "police":
                points[pid] = POINTS["police_correct"] if correct else POINTS["police_wrong"]
            elif role == "thief":
                points[pid] = POINTS["thief_caught"] if correct else POINTS["thief_free"]

        await self.finish({
            "winner": self.police_id if correct else self.thief_id,
            "reason": "police_correct" if correct else "police_wrong",
            "roles": self.roles,
            "points": points,
            "suspect": suspect,
            "thief_id": self.thief_id,
            "correct": correct,
        })
