from .tic_tac_toe import TicTacToeGame
from .simon_says import SimonSaysGame
from .red_light_green_light import RedLightGreenLightGame
from .musical_chairs import MusicalChairsGame
from .thief_police import ThiefPoliceGame
from .spyfall import SpyfallGame
from .twenty_questions import TwentyQuestionsGame
from .mafia import MafiaGame
from .hide_seek import HideSeekGame
from .freeze_tag import FreezeTagGame
from .pictionary import PictionaryGame
from .charades import CharadesGame
from .taboo import TabooGame
from .antakshari import AntaksharyGame
from .snake_ladder import SnakeLadderGame
from .uno import UnoGame
from .ludo import LudoGame

GAME_REGISTRY = {
    "tic_tac_toe": TicTacToeGame,
    "simon_says": SimonSaysGame,
    "red_light_green_light": RedLightGreenLightGame,
    "musical_chairs": MusicalChairsGame,
    "thief_police": ThiefPoliceGame,
    "spyfall": SpyfallGame,
    "twenty_questions": TwentyQuestionsGame,
    "mafia": MafiaGame,
    "hide_seek": HideSeekGame,
    "freeze_tag": FreezeTagGame,
    "pictionary": PictionaryGame,
    "charades": CharadesGame,
    "taboo": TabooGame,
    "antakshari": AntaksharyGame,
    "snake_ladder": SnakeLadderGame,
    "uno": UnoGame,
    "ludo": LudoGame,
}

GAME_INFO = {
    "tic_tac_toe": {"name": "Tic-Tac-Toe", "min_players": 2, "max_players": 2,
                    "description": "Classic 3x3 grid duel."},
    "simon_says": {"name": "Simon Says", "min_players": 2, "max_players": 12,
                   "description": "Repeat the growing color sequence. Miss it, you're out."},
    "red_light_green_light": {"name": "Red Light, Green Light", "min_players": 2, "max_players": 12,
                               "description": "Race to the finish, but freeze on red light."},
    "musical_chairs": {"name": "Musical Chairs", "min_players": 2, "max_players": 12,
                        "description": "When the music stops, sit fast or you're out."},
    "thief_police": {"name": "Thief & Police", "min_players": 4, "max_players": 4,
                      "description": "King, Minister, Police, Thief - can Police catch the Thief?"},
    "spyfall": {"name": "Spyfall", "min_players": 3, "max_players": 10,
                "description": "Everyone knows the secret location except the Spy. Find them out."},
    "twenty_questions": {"name": "20 Questions", "min_players": 2, "max_players": 10,
                          "description": "One player picks a secret word, everyone else asks yes/no questions."},
    "mafia": {"name": "Mafia", "min_players": 4, "max_players": 15,
              "description": "Mafia hunts by night, the town votes by day. Find the Mafia before it's too late."},
    "hide_seek": {"name": "Hide & Seek", "min_players": 3, "max_players": 10,
                  "description": "Hide while the Seeker counts down, then try to avoid being found."},
    "freeze_tag": {"name": "Freeze Tag (Ice)", "min_players": 3, "max_players": 12,
                   "description": "It chases and freezes runners. Unfreeze teammates before everyone's caught."},
    "pictionary": {"name": "Pictionary", "min_players": 2, "max_players": 10,
                   "description": "Draw the secret word while everyone else races to guess it."},
    "charades": {"name": "Charades", "min_players": 2, "max_players": 10,
                 "description": "Act out the secret word (no talking!) while others guess."},
    "taboo": {"name": "Taboo", "min_players": 2, "max_players": 10,
              "description": "Get others to guess the word without saying any of the taboo words."},
    "antakshari": {"name": "Antakshari", "min_players": 2, "max_players": 12,
                   "description": "Take turns naming a song starting with the last letter of the one before."},
    "snake_ladder": {"name": "Snake and Ladder", "min_players": 2, "max_players": 4,
                      "description": "Roll the dice, climb ladders, dodge snakes. First to 100 wins."},
    "uno": {"name": "Uno", "min_players": 2, "max_players": 6,
            "description": "Match colors and numbers, stack action cards, first to empty your hand wins."},
    "ludo": {"name": "Ludo", "min_players": 2, "max_players": 4,
             "description": "Roll a 6 to start, race your tokens around the board, get all 4 home first."},
}
