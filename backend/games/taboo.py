from .clue_round import ClueRoundGame

TABOO_WORDS = [
    {"word": "Basketball", "taboo": ["Ball", "Hoop", "Dribble", "Court", "NBA"]},
    {"word": "Birthday", "taboo": ["Cake", "Party", "Candles", "Gift", "Age"]},
    {"word": "Pizza", "taboo": ["Cheese", "Slice", "Italian", "Topping", "Delivery"]},
    {"word": "Beach", "taboo": ["Sand", "Ocean", "Sun", "Wave", "Swim"]},
    {"word": "Doctor", "taboo": ["Hospital", "Sick", "Nurse", "Medicine", "Patient"]},
    {"word": "Smartphone", "taboo": ["Call", "Apps", "Screen", "Text", "Battery"]},
    {"word": "Wedding", "taboo": ["Bride", "Groom", "Ring", "Marry", "Dress"]},
    {"word": "Coffee", "taboo": ["Cup", "Caffeine", "Morning", "Beans", "Starbucks"]},
    {"word": "School", "taboo": ["Teacher", "Student", "Class", "Homework", "Book"]},
    {"word": "Airport", "taboo": ["Plane", "Flight", "Luggage", "Pilot", "Ticket"]},
    {"word": "Cricket", "taboo": ["Bat", "Ball", "Wicket", "Over", "Stadium"]},
    {"word": "Bollywood", "taboo": ["Movie", "Actor", "Dance", "Song", "India"]},
]


class TabooGame(ClueRoundGame):
    WORD_BANK = TABOO_WORDS
    USE_TABOO = True
    min_players = 2
    max_players = 10
