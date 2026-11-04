import random

from .base import BaseGame

COLORS = ["red", "green", "blue", "yellow"]
ACTION_VALUES = ["skip", "reverse", "draw2"]


def build_deck():
    deck = []
    for color in COLORS:
        deck.append({"color": color, "value": "0"})
        for value in [str(n) for n in range(1, 10)]:
            deck.append({"color": color, "value": value})
            deck.append({"color": color, "value": value})
        for value in ACTION_VALUES:
            deck.append({"color": color, "value": value})
            deck.append({"color": color, "value": value})
    for _ in range(4):
        deck.append({"color": "wild", "value": "wild"})
        deck.append({"color": "wild", "value": "wild4"})
    random.shuffle(deck)
    return deck


class UnoGame(BaseGame):
    min_players = 2
    max_players = 6

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.draw_pile = build_deck()
        self.discard_pile = []
        self.hands = {pid: [] for pid in player_ids}
        self.direction = 1
        self.turn_index = 0
        self.current_color = None

    def _current_player(self):
        return self.player_ids[self.turn_index % len(self.player_ids)]

    def _draw_card(self):
        if not self.draw_pile:
            top = self.discard_pile[-1]
            rest = self.discard_pile[:-1]
            random.shuffle(rest)
            self.draw_pile = rest
            self.discard_pile = [top]
        return self.draw_pile.pop() if self.draw_pile else {"color": "wild", "value": "wild"}

    def _draw_n(self, pid, n):
        for _ in range(n):
            self.hands[pid].append(self._draw_card())

    async def start(self):
        for pid in self.player_ids:
            self.hands[pid] = [self._draw_card() for _ in range(7)]

        while True:
            top = self._draw_card()
            if top["color"] != "wild":
                self.discard_pile.append(top)
                self.current_color = top["color"]
                break
            self.draw_pile.insert(0, top)

        await self._broadcast_all()

    def _advance(self, steps=1):
        self.turn_index += steps * self.direction

    async def _broadcast_all(self):
        await self._broadcast_public()
        for pid in self.player_ids:
            await self._send_hand(pid)

    async def _send_hand(self, pid):
        await self.send_to(pid, {"type": "hand_update", "hand": self.hands[pid]})

    async def _broadcast_public(self):
        await self.broadcast({
            "type": "game_state",
            "top_card": self.discard_pile[-1] if self.discard_pile else None,
            "current_color": self.current_color,
            "current_player": self._current_player(),
            "direction": self.direction,
            "hand_counts": {pid: len(self.hands[pid]) for pid in self.player_ids},
            "draw_pile_count": len(self.draw_pile),
        })

    def _playable(self, card):
        if card["color"] == "wild":
            return True
        top = self.discard_pile[-1]
        return card["color"] == self.current_color or card["value"] == top["value"]

    async def handle_action(self, player_id, action):
        if player_id != self._current_player():
            return
        atype = action.get("type")

        if atype == "draw":
            self._draw_n(player_id, 1)
            self._advance(1)
            await self._broadcast_all()

        elif atype == "play":
            idx = action.get("card_index")
            hand = self.hands[player_id]
            if not isinstance(idx, int) or not (0 <= idx < len(hand)):
                return
            card = hand[idx]
            if not self._playable(card):
                await self.send_to(player_id, {"type": "error", "message": "That card doesn't match."})
                return

            hand.pop(idx)
            self.discard_pile.append(card)

            if card["color"] == "wild":
                chosen = action.get("chosen_color")
                self.current_color = chosen if chosen in COLORS else random.choice(COLORS)
            else:
                self.current_color = card["color"]

            if not hand:
                await self._broadcast_all()
                await self.finish({"winner": player_id, "reason": "hand_empty"})
                return

            value = card["value"]
            if value == "skip":
                self._advance(2)
            elif value == "reverse":
                self.direction *= -1
                self._advance(1)
            elif value == "draw2":
                self._advance(1)
                victim = self._current_player()
                self._draw_n(victim, 2)
                self._advance(1)
            elif value == "wild4":
                self._advance(1)
                victim = self._current_player()
                self._draw_n(victim, 4)
                self._advance(1)
            else:
                self._advance(1)

            await self._broadcast_all()
