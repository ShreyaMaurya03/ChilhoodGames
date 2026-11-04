from .clue_round import ClueRoundGame

CHARADES_WORDS = [
    "Swimming", "Dancing", "Cooking", "Elephant", "Sleeping", "Singing",
    "Basketball", "Driving a car", "Brushing teeth", "Playing guitar",
    "Fishing", "Superman", "Robot", "Volcano erupting", "Riding a bike",
    "Yoga", "Boxing", "Climbing a mountain", "Vampire", "Teacher",
]


class CharadesGame(ClueRoundGame):
    WORD_BANK = CHARADES_WORDS
    USE_TABOO = False
    min_players = 2
    max_players = 10
