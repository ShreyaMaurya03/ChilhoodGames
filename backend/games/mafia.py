import asyncio
import random

from .base import BaseGame

NIGHT_SECONDS = 45
DISCUSSION_SECONDS = 60
VOTE_SECONDS = 30


class MafiaGame(BaseGame):
    min_players = 4
    max_players = 15

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)

        n = len(player_ids)
        mafia_count = max(1, n // 4)
        shuffled = player_ids[:]
        random.shuffle(shuffled)

        self.roles = {}
        for pid in shuffled[:mafia_count]:
            self.roles[pid] = "mafia"
        rest = shuffled[mafia_count:]
        idx = 0
        if n >= 5 and idx < len(rest):
            self.roles[rest[idx]] = "detective"
            idx += 1
        if n >= 6 and idx < len(rest):
            self.roles[rest[idx]] = "doctor"
            idx += 1
        for pid in rest[idx:]:
            self.roles[pid] = "villager"

        self.alive = {pid: True for pid in player_ids}
        self.round = 0
        self.phase = "night"
        self.mafia_votes = {}
        self.doctor_save = None
        self.detective_pick = None
        self.day_votes = {}
        self._night_event = None
        self._vote_event = None
        self._task = None

    def alive_ids(self):
        return [pid for pid in self.player_ids if self.alive[pid]]

    def mafia_ids(self):
        return [pid for pid in self.alive_ids() if self.roles[pid] == "mafia"]

    def town_ids(self):
        return [pid for pid in self.alive_ids() if self.roles[pid] != "mafia"]

    async def start(self):
        for pid, role in self.roles.items():
            extra = {}
            if role == "mafia":
                extra["allies"] = [p for p in self.roles if self.roles[p] == "mafia" and p != pid]
            await self.send_to(pid, {"type": "role_info", "role": role, **extra})
        self._task = asyncio.create_task(self._run())

    async def cleanup(self):
        if self._task:
            self._task.cancel()

    async def _run(self):
        try:
            while True:
                self.round += 1
                await self._night_phase()
                if await self._check_win():
                    return
                await self._day_phase()
                if await self._check_win():
                    return
        except asyncio.CancelledError:
            pass

    async def _night_phase(self):
        self.phase = "night"
        self.mafia_votes = {}
        self.doctor_save = None
        self.detective_pick = None
        self._night_event = asyncio.Event()
        await self.broadcast({
            "type": "game_state", "phase": "night", "round": self.round,
            "alive": self.alive_ids(),
        })
        try:
            await asyncio.wait_for(self._night_event.wait(), timeout=NIGHT_SECONDS)
        except asyncio.TimeoutError:
            pass
        await self._resolve_night()

    def _night_ready(self):
        mafia_alive = self.mafia_ids()
        doctor_alive = [pid for pid in self.alive_ids() if self.roles[pid] == "doctor"]
        detective_alive = [pid for pid in self.alive_ids() if self.roles[pid] == "detective"]
        mafia_done = (not mafia_alive) or bool(self.mafia_votes)
        doctor_done = (not doctor_alive) or self.doctor_save is not None
        detective_done = (not detective_alive) or self.detective_pick is not None
        return mafia_done and doctor_done and detective_done

    async def _resolve_night(self):
        victim = None
        if self.mafia_votes:
            tally = {}
            for v in self.mafia_votes.values():
                if v:
                    tally[v] = tally.get(v, 0) + 1
            if tally:
                victim = max(tally, key=tally.get)
        saved = victim is not None and victim == self.doctor_save
        died = victim if (victim and not saved) else None
        if died:
            self.alive[victim] = False

        await self.broadcast({
            "type": "night_result",
            "round": self.round,
            "died": died,
            "died_role": self.roles.get(died) if died else None,
            "alive": self.alive_ids(),
        })

    async def _day_phase(self):
        self.phase = "discussion"
        await self.broadcast({
            "type": "game_state", "phase": "discussion", "round": self.round,
            "seconds": DISCUSSION_SECONDS, "alive": self.alive_ids(),
        })
        await asyncio.sleep(DISCUSSION_SECONDS)
        if await self._check_win():
            return

        self.phase = "voting"
        self.day_votes = {}
        self._vote_event = asyncio.Event()
        await self.broadcast({
            "type": "game_state", "phase": "voting", "round": self.round,
            "seconds": VOTE_SECONDS, "alive": self.alive_ids(),
        })
        try:
            await asyncio.wait_for(self._vote_event.wait(), timeout=VOTE_SECONDS)
        except asyncio.TimeoutError:
            pass
        await self._resolve_vote()

    async def _resolve_vote(self):
        tally = {}
        for v in self.day_votes.values():
            if v:
                tally[v] = tally.get(v, 0) + 1
        eliminated = None
        if tally:
            top = max(tally.values())
            top_candidates = [pid for pid, c in tally.items() if c == top]
            if len(top_candidates) == 1:
                eliminated = top_candidates[0]
        if eliminated:
            self.alive[eliminated] = False

        await self.broadcast({
            "type": "vote_result",
            "round": self.round,
            "eliminated": eliminated,
            "eliminated_role": self.roles.get(eliminated) if eliminated else None,
            "alive": self.alive_ids(),
        })

    async def _check_win(self):
        mafia_alive = self.mafia_ids()
        town_alive = self.town_ids()
        if not mafia_alive:
            await self.finish({"winner": "town", "reason": "mafia_eliminated", "roles": self.roles})
            return True
        if len(mafia_alive) >= len(town_alive):
            await self.finish({"winner": "mafia", "reason": "mafia_majority", "roles": self.roles})
            return True
        return False

    async def handle_action(self, player_id, action):
        atype = action.get("type")
        if not self.alive.get(player_id):
            return

        if self.phase == "night":
            role = self.roles.get(player_id)
            if atype == "mafia_vote" and role == "mafia":
                self.mafia_votes[player_id] = action.get("target")
            elif atype == "doctor_save" and role == "doctor":
                self.doctor_save = action.get("target")
            elif atype == "detective_check" and role == "detective":
                target = action.get("target")
                if target:
                    self.detective_pick = target
                    await self.send_to(player_id, {
                        "type": "detective_result",
                        "target": target,
                        "is_mafia": self.roles.get(target) == "mafia",
                    })
            if self._night_event and self._night_ready():
                self._night_event.set()

        elif self.phase == "voting":
            if atype == "day_vote":
                self.day_votes[player_id] = action.get("target")
                if self._vote_event and len(self.day_votes) >= len(self.alive_ids()):
                    self._vote_event.set()
