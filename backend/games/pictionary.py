from .clue_round import ClueRoundGame

PICTIONARY_WORDS = [
    "Elephant", "Guitar", "Rainbow", "Pizza", "Robot", "Umbrella", "Castle",
    "Dinosaur", "Bicycle", "Rocket", "Butterfly", "Snowman", "Pirate",
    "Dragon", "Lighthouse", "Octopus", "Volcano", "Penguin", "Telescope",
    "Treehouse", "Scarecrow", "Mermaid", "Campfire", "Kangaroo",
]


class PictionaryGame(ClueRoundGame):
    WORD_BANK = PICTIONARY_WORDS
    USE_TABOO = False
    min_players = 2
    max_players = 10

    async def _on_round_start(self):
        await self.broadcast({"type": "clear_canvas"})

    async def handle_action(self, player_id, action):
        atype = action.get("type")
        if atype == "draw" and player_id == self.giver_id:
            await self.broadcast({"type": "draw_segment", "segment": action.get("segment")})
            return
        if atype == "clear" and player_id == self.giver_id:
            await self.broadcast({"type": "clear_canvas"})
            return
        await super().handle_action(player_id, action)
