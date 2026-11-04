from .base import BaseGame

WIN_LINES = [
    (0, 1, 2), (3, 4, 5), (6, 7, 8),
    (0, 3, 6), (1, 4, 7), (2, 5, 8),
    (0, 4, 8), (2, 4, 6),
]


class TicTacToeGame(BaseGame):
    min_players = 2
    max_players = 2

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        super().__init__(player_ids, broadcast, send_to, on_finish)
        self.active = self.player_ids[:2]
        self.spectators = self.player_ids[2:]
        self.symbols = {self.active[0]: "X", self.active[1]: "O"}
        self.board = [None] * 9
        self.turn = self.active[0]

    def _state(self):
        return {
            "type": "game_state",
            "board": self.board,
            "turn": self.turn,
            "symbols": self.symbols,
            "spectators": self.spectators,
        }

    async def start(self):
        await self.broadcast(self._state())

    def _winner(self):
        for a, b, c in WIN_LINES:
            if self.board[a] and self.board[a] == self.board[b] == self.board[c]:
                return self.board[a]
        return None

    async def handle_action(self, player_id, action):
        if player_id != self.turn:
            return
        cell = action.get("cell")
        if not isinstance(cell, int) or not (0 <= cell < 9) or self.board[cell]:
            return

        self.board[cell] = self.symbols[player_id]
        winner_symbol = self._winner()

        if winner_symbol:
            await self.broadcast(self._state())
            winner_id = next(pid for pid, sym in self.symbols.items() if sym == winner_symbol)
            await self.finish({"winner": winner_id, "reason": "win"})
            return

        if all(self.board):
            await self.broadcast(self._state())
            await self.finish({"winner": None, "reason": "draw"})
            return

        self.turn = self.active[1] if self.turn == self.active[0] else self.active[0]
        await self.broadcast(self._state())
