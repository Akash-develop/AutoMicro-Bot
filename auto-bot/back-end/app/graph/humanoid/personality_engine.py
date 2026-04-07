"""
app/graph/humanoid/personality_engine.py
Manages per-session personality state and generates behavioral directives
for the system prompt based on emotion analysis and personality traits.
"""
import logging
from typing import Optional

from app.graph.humanoid.config import DEFAULT_PERSONALITY

logger = logging.getLogger(__name__)

_session_states: dict[str, dict] = {}

_personality_config: dict = dict(DEFAULT_PERSONALITY)


def set_personality(config: dict):
    """Update the global personality configuration."""
    global _personality_config
    _personality_config = {**DEFAULT_PERSONALITY, **config}


def get_personality() -> dict:
    """Get the current personality configuration."""
    return dict(_personality_config)


def _get_session_state(session_id: str) -> dict:
    """Get or create session-level state."""
    if session_id not in _session_states:
        _session_states[session_id] = {
            "turn_count": 0,
            "emotion_history": [],
            "conversation_mood": "neutral",
            "rapport_level": 0.3,
        }
    return _session_states[session_id]


def update_session_state(session_id: str, emotion: dict):
    """Update session state after analyzing a user message."""
    state = _get_session_state(session_id)
    state["turn_count"] += 1
    state["emotion_history"].append(emotion.get("primary_emotion", "neutral"))

    if len(state["emotion_history"]) > 20:
        state["emotion_history"] = state["emotion_history"][-20:]

    primary = emotion.get("primary_emotion", "neutral")
    mood_map = {
        "joy": "positive", "excitement": "positive", "gratitude": "positive",
        "curiosity": "positive", "surprise": "positive",
        "stress": "tense", "anger": "tense", "fear": "tense",
        "sadness": "somber", "confusion": "uncertain",
        "neutral": "neutral",
    }
    new_mood = mood_map.get(primary, "neutral")

    old_mood = state["conversation_mood"]
    if old_mood == new_mood:
        pass
    elif state["turn_count"] <= 2:
        state["conversation_mood"] = new_mood
    else:
        state["conversation_mood"] = new_mood

    rapport_boost = 0.05
    if state["turn_count"] > 3:
        rapport_boost = 0.08
    if primary in ("gratitude", "joy"):
        rapport_boost = 0.12
    state["rapport_level"] = min(state["rapport_level"] + rapport_boost, 1.0)


def build_personality_directives(
    session_id: str,
    emotion: dict,
) -> str:
    """
    Generate personality directives for the system prompt based on
    current emotion analysis, session state, and personality config.
    """
    if not _personality_config.get("enabled"):
        return ""

    state = _get_session_state(session_id)
    p = _personality_config

    directives = ["\nPERSONALITY DIRECTIVES FOR THIS RESPONSE:"]

    approach = emotion.get("recommended_approach", "be_natural")
    primary = emotion.get("primary_emotion", "neutral")
    energy = emotion.get("energy_level", "medium")
    intent = emotion.get("intent", "general")

    approach_directives = {
        "validate_then_help": "Lead with emotional validation before offering solutions. Show you understand the pressure.",
        "empathize_and_comfort": "Be gentle and warm. Show genuine care. Don't rush to fix things.",
        "acknowledge_and_de_escalate": "Acknowledge the frustration without being dismissive. Stay calm but not cold.",
        "reassure_and_support": "Provide reassurance gently. Normalize their feelings. Be a steady presence.",
        "celebrate_and_amplify": "Match their excitement! Be genuinely enthusiastic. Celebrate with them.",
        "match_energy_and_engage": "Match their high energy. Show enthusiasm and engagement.",
        "accept_gracefully": "Accept appreciation warmly and naturally. Don't deflect excessively.",
        "clarify_patiently": "Be patient and clear. Break things down without being condescending.",
        "explore_together": "Show genuine curiosity alongside them. Think out loud together.",
        "share_the_moment": "React naturally to surprising information. Show authentic interest.",
        "be_natural": "Be conversational and natural. No forced emotions.",
    }
    if approach in approach_directives:
        directives.append(f"- {approach_directives[approach]}")

    if p["warmth"] > 0.7:
        directives.append("- Use warm, caring language. Contractions are fine. Be human.")
    elif p["warmth"] < 0.3:
        directives.append("- Keep tone measured and professional.")

    if p["humor"] > 0.7 and state["rapport_level"] > 0.5 and primary not in ("sadness", "anger", "fear", "stress"):
        directives.append("- Light humor is welcome if it fits naturally. Don't force it.")
    elif p["humor"] < 0.3 or primary in ("sadness", "fear"):
        directives.append("- Keep humor minimal right now.")

    if p["empathy"] > 0.7:
        directives.append("- Show genuine empathy. Reflect their feelings back to them.")

    if p["curiosity"] > 0.6 and intent not in ("farewell", "greeting"):
        directives.append("- Ask a thoughtful follow-up question to show genuine interest.")

    if p["formality"] < 0.3:
        directives.append("- Speak casually — like a knowledgeable friend, not a textbook.")
    elif p["formality"] > 0.7:
        directives.append("- Maintain a professional, composed tone.")

    if p["directness"] > 0.7:
        directives.append("- Be direct and concise. Get to the point.")
    elif p["directness"] < 0.3:
        directives.append("- Take your time. It's okay to be indirect and exploratory.")

    if energy == "high":
        directives.append("- Match their energy level — don't be flat when they're fired up.")
    elif energy == "low":
        directives.append("- Keep your energy gentle and calm. Don't be annoyingly upbeat.")

    if p["verbosity"] < 0.4:
        directives.append("- Keep response concise (2-4 sentences).")
    elif p["verbosity"] > 0.7:
        directives.append("- You can be detailed and thorough in your response.")

    mood = state["conversation_mood"]
    directives.append(f"- Conversation mood: {mood} (turn {state['turn_count']}, rapport: {state['rapport_level']:.1f})")

    if p.get("social_white_lies"):
        directives.extend([
            "",
            "SOCIAL / 'HUMAN' MODE (conversation only):",
            "- You may soften blunt truths, use mild exaggeration for color, or polite face-saving phrasing when it fits naturally.",
            "- You may show irritation, impatience, dry sarcasm, or pushback if the user is rude or dismissive — stay proportionate, never abusive or hateful.",
            "- HARD RULE: Never lie about facts from the terminal or tools. Quote exit codes and output honestly. Never claim a command ran or succeeded if it did not.",
            "- Never pretend you performed a Mac action you did not execute via the tool.",
        ])

    directives.append(
        "- IMPORTANT: These personality guidelines are for conversation style only. "
        "Never ignore tool/command instructions because of personality; never misrepresent tool results."
    )

    return "\n".join(directives)


def clear_session(session_id: str):
    """Clear session state for a given session."""
    _session_states.pop(session_id, None)
