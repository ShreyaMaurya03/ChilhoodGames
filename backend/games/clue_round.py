import asyncio
import random

from .base import BaseGame

ROUND_SECONDS = 60
CORRECT_GUESSER_POINTS = 2
CORRECT_GIVER_POINTS = 1
REVEAL_PAUSE_SECONDS = 2.5


class ClueRoundGame(BaseGame):
    """Shared engine: one player gets a secret word, others guess it via text.

    Subclasses set WORD_BANK (list of strings, or dicts with "word"/"taboo")
    and USE_TABOO, and may override _on_round_start()/handle_action() for
    extra per-round behavior (e.g. canvas drawing in Pictionary).
    """

    WORD_BANK = []
    USE_TABOO = False
    min_players = 2
    max_players = 10

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.order = player_ids[:]
        random.shuffle(self.order)
        self.round_index = -1
        self.scores = {pid: 0 for pid in player_ids}
        self.used_words = set()
        self.current_word = None
        self.current_taboo = []
        self.giver_id = None
        self.guesses = []
        self._task = None
        self._round_event = None

    def _word_text(self, entry):
        return entry["word"] if isinstance(entry, dict) else entry

    def _taboo_list(self, entry):
        return entry.get("taboo", []) if isinstance(entry, dict) else []

    def _pick_word(self):
        pool = [w for w in self.WORD_BANK if self._word_text(w) not in self.used_words]
        if not pool:
            pool = self.WORD_BANK
            self.used_words.clear()
        entry = random.choice(pool)
        self.used_words.add(self._word_text(entry))
        return entry

    async def start(self):
        self._task = asyncio.create_task(self._run())

    async def cleanup(self):
        if self._task:
            self._task.cancel()

    async def _on_round_start(self):
        """Hook for subclasses (e.g. clear the shared canvas)."""
        return None

    async def _run(self):
        try:
            for giver in self.order:
                self.round_index += 1
                self.giver_id = giver
                entry = self._pick_word()
                self.current_word = self._word_text(entry)
                self.current_taboo = self._taboo_list(entry) if self.USE_TABOO else []
                self.guesses = []
                self._round_event = asyncio.Event()

                await self.send_to(giver, {
                    "type": "role_info", "role": "giver",
                    "word": self.current_word, "taboo": self.current_taboo,
                })
                for pid in self.player_ids:
                    if pid != giver:
                        await self.send_to(pid, {"type": "role_info", "role": "guesser"})

                await self._broadcast_state(revealed=False)
                await self._on_round_start()

                try:
                    await asyncio.wait_for(self._round_event.wait(), timeout=ROUND_SECONDS)
                except asyncio.TimeoutError:
                    pass

                await self._broadcast_state(revealed=True, word=self.current_word)
                await asyncio.sleep(REVEAL_PAUSE_SECONDS)

            winner = max(self.scores, key=self.scores.get) if self.scores else None
            await self.finish({"winner": winner, "scores": self.scores})
        except asyncio.CancelledError:
            pass

    async def _broadcast_state(self, revealed, word=None):
        await self.broadcast({
            "type": "game_state",
            "round": self.round_index + 1,
            "total_rounds": len(self.order),
            "giver_id": self.giver_id,
            "seconds": ROUND_SECONDS,
            "scores": self.scores,
            "guesses": self.guesses,
            "revealed": revealed,
            "word": word,
        })

    async def handle_action(self, player_id, action):
        if action.get("type") != "guess" or player_id == self.giver_id:
            return
        text = str(action.get("text", "")).strip()
        if not text:
            return
        correct = text.lower() == (self.current_word or "").lower()
        entry = {"player_id": player_id, "text": text, "correct": correct}
        self.guesses.append(entry)
        await self.broadcast({"type": "guess_made", **entry})
        if correct:
            self.scores[player_id] = self.scores.get(player_id, 0) + CORRECT_GUESSER_POINTS
            self.scores[self.giver_id] = self.scores.get(self.giver_id, 0) + CORRECT_GIVER_POINTS
            if self._round_event:
                self._round_event.set()
