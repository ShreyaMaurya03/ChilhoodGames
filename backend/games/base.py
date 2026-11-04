class BaseGame:
    """Common interface every game module implements.

    broadcast(message: dict) -> sends to every connected player in the room
    send_to(player_id, message: dict) -> sends to a single player
    on_finish(result: dict) -> call once, when the game ends
    """

    def __init__(self, player_ids, broadcast, send_to, on_finish):
        self.player_ids = list(player_ids)
        self.broadcast = broadcast
        self.send_to = send_to
        self._on_finish = on_finish
        self._finished = False

    async def start(self):
        raise NotImplementedError

    async def handle_action(self, player_id, action):
        raise NotImplementedError

    async def cleanup(self):
        """Override to cancel background tasks (asyncio loops, timers)."""
        return None

    async def finish(self, result: dict):
        if self._finished:
            return
        self._finished = True
        await self.cleanup()
        await self._on_finish(result)
