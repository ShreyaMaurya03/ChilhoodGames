import random

from .base import BaseGame

WORD_BANK = [
    "Elephant", "Pizza", "Guitar", "Bicycle", "Volcano", "Astronaut",
    "Penguin", "Laptop", "Rainbow", "Dinosaur", "Umbrella", "Castle",
    "Robot", "Butterfly", "Mountain", "Lighthouse", "Dragon", "Telescope",
]
MAX_QUESTIONS = 20


class TwentyQuestionsGame(BaseGame):
    min_players = 2
    max_players = 10

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.answerer_id = random.choice(self.player_ids)
        self.secret = random.choice(WORD_BANK)
        self.askers = [pid for pid in self.player_ids if pid != self.answerer_id]
        self.turn_index = 0
        self.asked_count = 0
        self.log = []
        self.awaiting_answer = False

    def _current_asker(self):
        return self.askers[self.turn_index % len(self.askers)] if self.askers else None

    async def start(self):
        await self.send_to(self.answerer_id, {"type": "role_info", "role": "answerer", "secret": self.secret})
        for pid in self.askers:
            await self.send_to(pid, {"type": "role_info", "role": "asker"})
        await self._broadcast_state()

    async def _broadcast_state(self):
        await self.broadcast({
            "type": "game_state",
            "answerer_id": self.answerer_id,
            "current_asker": self._current_asker(),
            "awaiting_answer": self.awaiting_answer,
            "questions_asked": self.asked_count,
            "max_questions": MAX_QUESTIONS,
            "log": self.log[-30:],
        })

    async def handle_action(self, player_id, action):
        atype = action.get("type")

        if atype == "ask" and player_id == self._current_asker() and not self.awaiting_answer:
            question = str(action.get("text", ""))[:150].strip()
            if not question:
                return
            self.log.append({"type": "question", "player_id": player_id, "text": question})
            self.asked_count += 1
            self.awaiting_answer = True
            await self._broadcast_state()

        elif atype == "answer" and player_id == self.answerer_id and self.awaiting_answer:
            ans = action.get("value")
            if ans not in ("yes", "no", "maybe"):
                return
            self.log.append({"type": "answer", "text": ans})
            self.awaiting_answer = False
            self.turn_index += 1
            if self.asked_count >= MAX_QUESTIONS:
                await self.broadcast({"type": "game_state", "answerer_id": self.answerer_id,
                                       "current_asker": None, "awaiting_answer": False,
                                       "questions_asked": self.asked_count,
                                       "max_questions": MAX_QUESTIONS, "log": self.log[-30:]})
                await self.finish({"winner": self.answerer_id, "reason": "ran_out_of_questions", "secret": self.secret})
                return
            await self._broadcast_state()

        elif atype == "guess":
            guess = str(action.get("text", "")).strip().lower()
            if not guess:
                return
            if guess == self.secret.lower():
                await self.finish({"winner": player_id, "reason": "guessed_correctly", "secret": self.secret})
            else:
                self.log.append({"type": "wrong_guess", "player_id": player_id, "text": action.get("text")})
                await self._broadcast_state()
