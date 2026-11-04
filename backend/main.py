import json
import uuid
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse

from games import GAME_REGISTRY, GAME_INFO
from rooms import RoomManager, Player

app = FastAPI()
manager = RoomManager()

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


@app.middleware("http")
async def no_cache_static(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/static/") or request.url.path == "/":
        response.headers["Cache-Control"] = "no-store"
    return response


@app.get("/")
async def index():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/api/games")
async def list_games():
    return GAME_INFO


app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    player_id = uuid.uuid4().hex[:8]
    room = None

    async def send(payload: dict):
        await websocket.send_text(json.dumps(payload))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            mtype = msg.get("type")

            if mtype == "create_room":
                nickname = (msg.get("nickname") or "Player")[:20]
                game_type = msg.get("game")
                if game_type not in GAME_REGISTRY:
                    await send({"type": "error", "message": "Unknown game."})
                    continue
                room = manager.create_room(game_type, player_id)
                room.players[player_id] = Player(player_id, nickname, websocket)
                await send({"type": "joined", "player_id": player_id, "room_code": room.code,
                            "game_type": room.game_type})
                await room.broadcast_room_update()

            elif mtype == "join_room":
                nickname = (msg.get("nickname") or "Player")[:20]
                code = (msg.get("room_code") or "").upper().strip()
                target = manager.get(code)
                if not target:
                    await send({"type": "error", "message": "Room not found."})
                    continue
                if target.state != "lobby":
                    await send({"type": "error", "message": "That game has already started."})
                    continue
                room = target
                room.players[player_id] = Player(player_id, nickname, websocket)
                await send({"type": "joined", "player_id": player_id, "room_code": room.code,
                            "game_type": room.game_type})
                await room.broadcast_room_update()

            elif mtype == "start_game":
                if room:
                    await room.start_game(player_id)

            elif mtype == "game_action":
                if room:
                    await room.handle_action(player_id, msg.get("action"))

            elif mtype == "play_again":
                if room:
                    await room.reset_to_lobby(player_id)

            elif mtype == "leave_room":
                break

    except WebSocketDisconnect:
        pass
    finally:
        if room and player_id in room.players:
            room.players[player_id].connected = False
            if player_id == room.host_id:
                remaining = room.connected_player_ids()
                if remaining:
                    room.host_id = remaining[0]
            await room.broadcast_room_update()
            manager.remove_if_empty(room.code)
