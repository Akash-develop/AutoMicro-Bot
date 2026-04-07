"""
app/graph/humanoid/emotion_analyzer.py
Lightweight keyword-based emotion and intent detection.
No LLM overhead — runs in <1ms per message.
"""
import re
from app.graph.humanoid.config import EMOTION_KEYWORDS


INTENT_PATTERNS = {
    "venting": [
        r"\bi (?:hate|can't stand|am so sick of)\b", r"\bugh\b", r"\bso frustrat",
        r"\bi(?:'m| am) (?:done|over it|tired of)\b", r"\bthis (?:sucks|is awful)\b",
    ],
    "seeking_help": [
        r"\bhow (?:do|can|should) i\b", r"\bhelp me\b", r"\bwhat should i\b",
        r"\bcan you (?:help|show|explain)\b", r"\bi need\b", r"\bany (?:advice|tips|suggestions)\b",
    ],
    "sharing_good_news": [
        r"\bi (?:got|just got|landed|won|passed|finished)\b", r"\bguess what\b",
        r"\bgood news\b", r"\bexciting news\b", r"\bi did it\b", r"\bfinally\b",
    ],
    "casual_chat": [
        r"\bwhat(?:'s| is) up\b", r"\bhey\b", r"\bhow(?:'s| is) it going\b",
        r"\bwhat do you think about\b", r"\bjust (?:wondering|curious)\b", r"\banyway\b",
    ],
    "asking_question": [
        r"\bwhat is\b", r"\bwho is\b", r"\bwhere is\b", r"\bwhen did\b",
        r"\bwhy (?:does|did|is)\b", r"\bhow does\b", r"\bcan you explain\b",
    ],
    "greeting": [
        r"\b(?:hi|hello|hey|good morning|good evening|howdy|yo)\b",
    ],
    "farewell": [
        r"\b(?:bye|goodbye|see you|later|good night|take care|gotta go)\b",
    ],
}


def analyze_emotion(message: str) -> dict:
    """
    Analyze a message for emotional content and intent.
    Returns a dict with emotion profile.
    """
    text = message.lower().strip()

    emotion_scores: dict[str, float] = {}
    for emotion, keywords in EMOTION_KEYWORDS.items():
        score = 0.0
        for kw in keywords:
            if kw in text:
                score += 1.0
        if score > 0:
            emotion_scores[emotion] = min(score / 3.0, 1.0)

    exclamation_count = message.count("!")
    caps_ratio = sum(1 for c in message if c.isupper()) / max(len(message), 1)
    question_marks = message.count("?")

    intensity_boost = 0.0
    if exclamation_count >= 2:
        intensity_boost += 0.2
    if caps_ratio > 0.5 and len(message) > 5:
        intensity_boost += 0.15
    if "!!" in message:
        intensity_boost += 0.1

    for em in emotion_scores:
        emotion_scores[em] = min(emotion_scores[em] + intensity_boost, 1.0)

    if emotion_scores:
        sorted_emotions = sorted(emotion_scores.items(), key=lambda x: x[1], reverse=True)
        primary = sorted_emotions[0][0]
        primary_intensity = sorted_emotions[0][1]
        secondary = sorted_emotions[1][0] if len(sorted_emotions) > 1 else None
    else:
        primary = "neutral"
        primary_intensity = 0.3
        secondary = None

    intent = "general"
    for intent_name, patterns in INTENT_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text):
                intent = intent_name
                break
        if intent != "general":
            break

    if exclamation_count >= 2:
        energy = "high"
    elif question_marks >= 2:
        energy = "medium"
    elif primary in ("anger", "excitement", "joy", "surprise"):
        energy = "high"
    elif primary in ("sadness", "fear"):
        energy = "low"
    else:
        energy = "medium"

    approach_map = {
        "stress": "validate_then_help",
        "sadness": "empathize_and_comfort",
        "anger": "acknowledge_and_de_escalate",
        "fear": "reassure_and_support",
        "joy": "celebrate_and_amplify",
        "excitement": "match_energy_and_engage",
        "gratitude": "accept_gracefully",
        "confusion": "clarify_patiently",
        "curiosity": "explore_together",
        "surprise": "share_the_moment",
        "neutral": "be_natural",
    }

    return {
        "primary_emotion": primary,
        "intensity": round(primary_intensity, 2),
        "secondary_emotion": secondary,
        "intent": intent,
        "energy_level": energy,
        "recommended_approach": approach_map.get(primary, "be_natural"),
    }
