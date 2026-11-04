import json
import random
import string

from games import GAME_REGISTRY, GAME_INFO


class Player:
    def __init__(self, player_id, nickname, websocket):
        self.id = player_id
        self.nickname = nickname
        self.websocket = websocket
        self.connected = True


class Room:
    def __init__(self, code, game_type, host_id):
        self.code = code
        self.game_type = game_type
        self.host_id = host_id
        self.players: dict[str, Player] = {}
        self.state = "lobby"  # lobby | playing | ended
        self.game = None

    def player_list(self):
        return [
            {"id": p.id, "nickname": p.nickname, "connected": p.connected}
            for p in self.players.values()
        ]

    def connected_player_ids(self):
        return [pid for pid, p in self.players.items() if p.connected]

    async def broadcast(self, message: dict):
        data = json.dumps(message)
        for p in list(self.players.values()):
            if p.connected:
                try:
                    await p.websocket.send_text(data)
                except Exception:
                    p.connected = False

    async def send_to(self, player_id: str, message: dict):
        p = self.players.get(player_id)
        if p and p.connected:
            try:
                await p.websocket.send_text(json.dumps(message))
            except Exception:
                p.connected = False

    async def broadcast_room_update(self):
        await self.broadcast({
            "type": "room_update",
            "room_code": self.code,
            "game_type": self.game_type,
            "game_info": GAME_INFO[self.game_type],
            "host_id": self.host_id,
            "state": self.state,
            "players": self.player_list(),
        })

    async def start_game(self, requester_id):
        if requester_id != self.host_id or self.state != "lobby":
            return
        game_cls = GAME_REGISTRY[self.game_type]
        active_ids = self.connected_player_ids()
        min_p = getattr(game_cls, "min_players", 1)
        max_p = getattr(game_cls, "max_players", 99)
        if not (min_p <= len(active_ids) <= max_p):
            await self.send_to(requester_id, {
                "type": "error",
                "message": f"Need {min_p}"
                           + (f"-{max_p}" if max_p != min_p else "")
                           + " players to start this game.",
            })
            return

        self.game = game_cls(active_ids, broadcast=self.broadcast, send_to=self.send_to,
                              on_finish=self.on_game_finish)
        self.state = "playing"
        await self.broadcast_room_update()
        await self.game.start()

    async def on_game_finish(self, result):
        self.state = "ended"
        winner = result.get("winner")
        winner_nickname = self.players[winner].nickname if winner and winner in self.players else None
        await self.broadcast({"type": "game_over", "result": {**result, "winner_nickname": winner_nickname}})
        await self.broadcast_room_update()

    async def handle_action(self, player_id, action):
        if not action:
            return
        if action.get("type") == "chat":
            p = self.players.get(player_id)
            text = str(action.get("text", ""))[:200].strip()
            if p and text:
                await self.broadcast({
                    "type": "chat_message",
                    "player_id": player_id,
                    "nickname": p.nickname,
                    "text": text,
                })
            return
        if self.game and self.state == "playing":
            await self.game.handle_action(player_id, action)

    async def reset_to_lobby(self, requester_id):
        if requester_id != self.host_id:
            return
        self.state = "lobby"
        self.game = None
        await self.broadcast_room_update()

    def is_empty(self):
        return len(self.connected_player_ids()) == 0


class RoomManager:
    def __init__(self):
        self.rooms: dict[str, Room] = {}

    def generate_code(self) -> str:
        while True:
            code = "".join(random.choices(string.ascii_uppercase, k=4))
            if code not in self.rooms:
                return code

    def create_room(self, game_type, host_id) -> Room:
        code = self.generate_code()
        room = Room(code, game_type, host_id)
        self.rooms[code] = room
        return room

    def get(self, code: str):
        return self.rooms.get(code.upper())

    def remove_if_empty(self, code: str):
        room = self.rooms.get(code)
        if room and room.is_empty():
            del self.rooms[code]
