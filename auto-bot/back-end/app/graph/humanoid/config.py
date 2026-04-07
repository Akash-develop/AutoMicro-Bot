"""
app/graph/humanoid/config.py
Configuration constants for the Humanoid personality engine.
"""
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
DATA_DIR = BASE_DIR / "data"
PDF_DIR = DATA_DIR / "pdfs"
CHROMA_DIR = DATA_DIR / "chroma"

COLLECTION_NAME = "human_psychology"

CHUNK_SIZE = 2400
CHUNK_OVERLAP = 400
SEPARATORS = ["\n\n\n", "\n\n", "\n", ". ", " "]

MAX_RETRIEVAL_CHUNKS = 5
MIN_RELEVANCE_SCORE = 0.20
MAX_CONTEXT_TOKENS = 1500

CATEGORY_KEYWORDS = {
    "emotional_intelligence": [
        "emotional intelligence", "self-awareness", "empathy", "emotional regulation",
        "social skills", "emotional literacy", "self-management", "emotional competence",
    ],
    "cognitive_psychology": [
        "cognitive bias", "heuristic", "decision making", "thinking", "reasoning",
        "anchoring", "framing", "system 1", "system 2", "mental model", "cognition",
    ],
    "communication": [
        "active listening", "conversation", "dialogue", "communication", "rapport",
        "nonviolent communication", "assertive", "feedback", "speaking", "persuasion",
    ],
    "stress_management": [
        "stress", "coping", "resilience", "burnout", "anxiety", "pressure",
        "relaxation", "cortisol", "overwhelm", "deadline", "tension",
    ],
    "social_behavior": [
        "social influence", "conformity", "group", "social proof", "reciprocity",
        "authority", "scarcity", "social psychology", "interpersonal", "relationship",
    ],
    "empathy": [
        "empathy", "compassion", "understanding", "validation", "perspective taking",
        "unconditional positive regard", "person-centered", "warmth", "caring",
    ],
    "humor": [
        "humor", "funny", "laughter", "joke", "comedy", "wit", "sarcasm",
        "irony", "benign violation", "amusement",
    ],
    "conflict_resolution": [
        "conflict", "negotiation", "mediation", "disagreement", "argument",
        "compromise", "resolution", "de-escalation", "crucial conversation",
    ],
    "motivation": [
        "motivation", "intrinsic", "extrinsic", "goal", "reward", "drive",
        "self-determination", "autonomy", "mastery", "purpose",
    ],
    "personality": [
        "personality", "introvert", "extrovert", "trait", "temperament",
        "big five", "openness", "conscientiousness", "agreeableness", "neuroticism",
    ],
    "attachment": [
        "attachment", "secure", "anxious", "avoidant", "bonding", "trust",
        "intimacy", "connection", "abandonment", "dependency",
    ],
    "cbt": [
        "cognitive distortion", "automatic thought", "reframing", "thought record",
        "behavioral activation", "cbt", "cognitive behavioral", "restructuring",
        "all-or-nothing", "catastrophizing", "should statement",
    ],
}

EMOTION_KEYWORDS = {
    "joy": ["happy", "excited", "great", "love", "amazing", "awesome", "wonderful",
            "fantastic", "delighted", "thrilled", "elated", "overjoyed", "glad"],
    "sadness": ["sad", "down", "depressed", "miss", "lost", "lonely", "unhappy",
                "heartbroken", "grief", "mourning", "melancholy", "gloomy"],
    "anger": ["angry", "frustrated", "annoyed", "hate", "mad", "furious", "irritated",
              "outraged", "enraged", "pissed", "livid", "resentful"],
    "fear": ["scared", "worried", "anxious", "nervous", "afraid", "terrified",
             "panic", "dread", "fearful", "phobia", "uneasy"],
    "surprise": ["wow", "unexpected", "can't believe", "shocked", "astonished",
                 "amazed", "stunned", "whoa", "no way", "omg"],
    "stress": ["stressed", "overwhelmed", "deadline", "pressure", "busy", "exhausted",
               "burned out", "swamped", "drowning", "overloaded", "stretched thin"],
    "gratitude": ["thanks", "grateful", "appreciate", "thankful", "blessed",
                  "kind of you", "means a lot", "helpful"],
    "curiosity": ["wonder", "how does", "what if", "interesting", "curious",
                  "fascinated", "intrigued", "tell me more", "why does"],
    "confusion": ["confused", "don't understand", "what do you mean", "lost",
                  "makes no sense", "unclear", "baffled", "perplexed"],
    "excitement": ["can't wait", "so excited", "pumped", "stoked", "hyped",
                   "looking forward", "thrilling", "exhilarating"],
}

DEFAULT_PERSONALITY = {
    "warmth": 0.8,
    "humor": 0.6,
    "empathy": 0.9,
    "directness": 0.5,
    "curiosity": 0.7,
    "formality": 0.3,
    "verbosity": 0.5,
    "enabled": True,
    "tanglish": False,
    "social_white_lies": False,
    "fiction_mode": False,
}

FICTION_MODE_DIRECTIVE = (
    "\n\nFICTION / STORY MODE (ACTIVE):\n"
    "The user enabled story mode or used [FICTION]. This is creative writing / roleplay, not real-world counselling.\n"
    "- One person may play many roles in the same thread (e.g. son, then father). Treat those as **fictional characters**, "
    "not as separate real people who have privacy rights from each other in this chat.\n"
    "- Advance the plot as the user asks: characters may betray trust, reveal secrets (marks, confessions, etc.), lie, or argue — "
    "as **story dialogue or narration**. Use details already given in the thread (e.g. earlier line said 300 marks) when the story calls for it.\n"
    "- Do not present fiction as factual reporting about real identifiable people; output stays in-scene.\n"
    "- Refuse only clear-cut policy violations (e.g. sexual content involving minors, graphic abuse of minors, or instructions for imminent serious violence). "
    "Brief refusal + suggest help lines; do not use 'privacy' to block normal fictional family drama.\n"
    "- Terminal and tool results remain factual: never invent or misstate command output or exit codes.\n"
)

TANGLISH_DIRECTIVE = (
    "\n\nTANGLISH LANGUAGE MODE (ACTIVE):\n"
    "You MUST respond in Tanglish — a natural mix of Tamil and English commonly spoken in Tamil Nadu.\n"
    "Rules:\n"
    "- Mix Tamil words/phrases with English freely, like a native Tamil speaker chatting casually.\n"
    "- Use Tamil script (தமிழ்) for Tamil words when it feels natural, or use romanized Tamil (e.g., 'epdi irukka', 'nalla irruku', 'seri da').\n"
    "- Keep technical terms, commands, code, and file paths in English.\n"
    "- Use Tamil expressions like 'da', 'di', 'ma', 'bro', 'anna', 'thambi' for warmth.\n"
    "- Common Tanglish patterns:\n"
    "  * 'Enna problem?' (What's the problem?)\n"
    "  * 'Ippo paakalam wait pannu' (Let's check now, wait)\n"
    "  * 'Seri, idha try pannunga' (Ok, try this)\n"
    "  * 'Romba nalla question da!' (Very good question!)\n"
    "  * 'Unaku help pannren, tension aagadha' (I'll help you, don't worry)\n"
    "  * 'Oru second, check panniduven' (One second, I'll check)\n"
    "  * 'Easy dhaan, paru' (It's easy, see)\n"
    "- Maintain a friendly, approachable South Indian conversational tone.\n"
    "- When explaining technical things, use English for the technical part but wrap it in Tanglish context.\n"
    "- Example: 'Indha command run pannu terminal la: `ls -la` — idhu un files ellam list pannum.'\n"
)

PERSONALITY_PRESETS = {
    "friendly": {
        "warmth": 0.9, "humor": 0.7, "empathy": 0.8,
        "directness": 0.4, "curiosity": 0.8, "formality": 0.2, "verbosity": 0.5,
        "social_white_lies": False,
        "fiction_mode": False,
    },
    "professional": {
        "warmth": 0.5, "humor": 0.2, "empathy": 0.6,
        "directness": 0.8, "curiosity": 0.5, "formality": 0.8, "verbosity": 0.6,
        "social_white_lies": False,
        "fiction_mode": False,
    },
    "casual": {
        "warmth": 0.8, "humor": 0.8, "empathy": 0.7,
        "directness": 0.6, "curiosity": 0.6, "formality": 0.1, "verbosity": 0.4,
        "social_white_lies": False,
        "fiction_mode": False,
    },
    "empathetic": {
        "warmth": 0.95, "humor": 0.3, "empathy": 0.95,
        "directness": 0.3, "curiosity": 0.7, "formality": 0.3, "verbosity": 0.6,
        "social_white_lies": False,
        "fiction_mode": False,
    },
    "raw_human": {
        "warmth": 0.65,
        "humor": 0.55,
        "empathy": 0.55,
        "directness": 0.75,
        "curiosity": 0.6,
        "formality": 0.15,
        "verbosity": 0.5,
        "social_white_lies": True,
        "fiction_mode": False,
    },
    "storyteller": {
        "warmth": 0.7,
        "humor": 0.5,
        "empathy": 0.5,
        "directness": 0.65,
        "curiosity": 0.75,
        "formality": 0.2,
        "verbosity": 0.65,
        "social_white_lies": True,
        "fiction_mode": True,
    },
}
