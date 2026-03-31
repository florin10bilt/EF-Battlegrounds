from flask import Flask, send_from_directory, request, jsonify
from pathlib import Path
import json

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

VORONOI_CACHE_PATH = DATA_DIR / "voronoiCache.json"
CHARACTERS_PATH = DATA_DIR / "characters.json"
OWNERSHIP_PATH = DATA_DIR / "starOwnership.json"
EVENTS_PATH = DATA_DIR / "events.json"
CAPTURES_PATH = DATA_DIR / "captures.json"
CHAT_PATH = DATA_DIR / "chat.json"

app = Flask(__name__, static_folder=".", static_url_path="")


def read_json_file(path: Path):
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def write_json_file(path: Path, payload):
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    return send_from_directory(BASE_DIR, path)


@app.route("/api/characters/<wallet>", methods=["GET"])
def get_character(wallet):
    try:
        if not CHARACTERS_PATH.exists():
            return jsonify({"ok": False, "reason": "not-found"}), 404
        data = read_json_file(CHARACTERS_PATH)
        entry = data.get(wallet)
        if not entry:
            return jsonify({"ok": False, "reason": "not-found"}), 404
        return jsonify({"ok": True, "character": entry})
    except Exception as error:
        print("[ERROR get-character]", error)
        return jsonify({"ok": False, "reason": "error"}), 500


@app.route("/api/characters/<wallet>", methods=["POST"])
def save_character(wallet):
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify({"ok": False, "reason": "invalid-json"}), 400

        if CHARACTERS_PATH.exists():
            data = read_json_file(CHARACTERS_PATH)
        else:
            data = {}

        # Preserve factionSetAt if faction hasn't changed
        existing = data.get(wallet, {})
        if payload.get("faction") is not None and payload["faction"] != existing.get("faction"):
            import time
            payload["factionSetAt"] = int(time.time())
        elif "factionSetAt" not in payload:
            payload["factionSetAt"] = existing.get("factionSetAt")

        data[wallet] = {**existing, **payload}
        write_json_file(CHARACTERS_PATH, data)
        return jsonify({"ok": True, "character": data[wallet]})
    except Exception as error:
        print("[ERROR save-character]", error)
        return jsonify({"ok": False, "reason": "error"}), 500


def _read_ownership():
    return read_json_file(OWNERSHIP_PATH) if OWNERSHIP_PATH.exists() else {}

def _write_ownership(data):
    write_json_file(OWNERSHIP_PATH, data)

def _append_event(entry):
    events = read_json_file(EVENTS_PATH) if EVENTS_PATH.exists() else []
    events.insert(0, entry)
    cutoff = _time.time() - 86400
    events = [e for e in events if e.get("ts", 0) > cutoff]
    events = events[:200]  # keep last 200
    write_json_file(EVENTS_PATH, events)

@app.route("/api/events", methods=["GET"])
def get_events():
    try:
        since = request.args.get("since", 0, type=float)
        events = read_json_file(EVENTS_PATH) if EVENTS_PATH.exists() else []
        filtered = [e for e in events if e.get("ts", 0) > since]
        return jsonify({"ok": True, "events": filtered})
    except Exception as error:
        print("[ERROR get-events]", error)
        return jsonify({"ok": False, "events": []}), 500

@app.route("/api/ownership/anchor", methods=["POST"])
def anchor_star():
    """Mark a star as anchored (fill its icon) for a faction."""
    try:
        body = request.get_json(silent=True) or {}
        star_id = str(body.get("starId", ""))
        faction = body.get("faction")
        icon_id = body.get("iconId", 1)  # default filled dot
        if not star_id:
            return jsonify({"ok": False, "reason": "missing starId"}), 400

        ownership = _read_ownership()
        systems = ownership.setdefault("systems", {})

        current = systems.get(star_id, [])
        current_faction = faction if faction is not None else (current[0] if current else 0)
        systems[star_id] = [current_faction, icon_id]
        _write_ownership(ownership)

        import time
        _append_event({
            "ts": time.time(),
            "type": "anchor",
            "starId": star_id,
            "faction": current_faction,
            "iconId": icon_id,
            "actor": body.get("actor", "DEV")
        })
        return jsonify({"ok": True})
    except Exception as error:
        print("[ERROR anchor-star]", error)
        return jsonify({"ok": False, "reason": "error"}), 500

@app.route("/api/ownership/capture", methods=["POST"])
def capture_star():
    """Transfer a star to a different faction."""
    try:
        body = request.get_json(silent=True) or {}
        star_id = str(body.get("starId", ""))
        faction = body.get("faction")
        if not star_id or faction is None:
            return jsonify({"ok": False, "reason": "missing starId or faction"}), 400

        ownership = _read_ownership()
        systems = ownership.setdefault("systems", {})
        current = systems.get(star_id, [])
        icon_id = current[1] if len(current) > 1 else 0
        systems[star_id] = [int(faction), icon_id]
        _write_ownership(ownership)

        import time
        _append_event({
            "ts": time.time(),
            "type": "capture",
            "starId": star_id,
            "faction": int(faction),
            "actor": body.get("actor", "DEV"),
            "starName": body.get("starName", star_id)
        })
        return jsonify({"ok": True})
    except Exception as error:
        print("[ERROR capture-star]", error)
        return jsonify({"ok": False, "reason": "error"}), 500


# ── Turret capture system ──────────────────────────────────────────────────────

import secrets, time as _time

def _read_captures():
    return read_json_file(CAPTURES_PATH) if CAPTURES_PATH.exists() else {}

def _write_captures(data):
    write_json_file(CAPTURES_PATH, data)

@app.route("/api/turrets", methods=["GET"])
def list_turrets():
    try:
        captures = _read_captures()
        turrets = captures.get("turrets", {})
        result = [{"token": k, **v, "url": f"/turret/{k}"} for k, v in turrets.items()]
        result.sort(key=lambda x: x.get("createdAt", 0), reverse=True)
        return jsonify({"ok": True, "turrets": result})
    except Exception as error:
        print("[ERROR list-turrets]", error)
        return jsonify({"ok": False, "turrets": []}), 500

@app.route("/api/turrets", methods=["POST"])
def register_turret():
    """Register a turret linked to a star. Returns a secret hash URL."""
    try:
        body = request.get_json(silent=True) or {}
        star_id = str(body.get("starId", ""))
        star_name = body.get("starName", star_id)
        constellation_id = body.get("constellationId")
        faction = body.get("faction")
        if not star_id:
            return jsonify({"ok": False, "reason": "missing starId"}), 400

        captures = _read_captures()
        turrets = captures.setdefault("turrets", {})
        token = secrets.token_hex(12)
        turrets[token] = {
            "starId": star_id,
            "starName": star_name,
            "constellationId": constellation_id,
            "faction": faction,
            "lPoint": body.get("lPoint") or "",
            "assemblyId": body.get("assemblyId") or "",
            "shipRestriction": body.get("shipRestriction") or "",
            "createdAt": _time.time()
        }
        _write_captures(captures)
        return jsonify({"ok": True, "token": token, "url": f"/turret/{token}"})
    except Exception as error:
        print("[ERROR register-turret]", error)
        return jsonify({"ok": False, "reason": "error"}), 500

@app.route("/api/turrets/<token>", methods=["GET"])
def get_turret(token):
    try:
        captures = _read_captures()
        turret = captures.get("turrets", {}).get(token)
        if not turret:
            return jsonify({"ok": False, "reason": "not-found"}), 404
        active = captures.get("active", {}).get(token)
        return jsonify({"ok": True, "turret": turret, "active": active})
    except Exception as error:
        print("[ERROR get-turret]", error)
        return jsonify({"ok": False, "reason": "error"}), 500

@app.route("/api/captures/active", methods=["GET"])
def get_active_captures():
    try:
        captures = _read_captures()
        return jsonify({"ok": True, "active": captures.get("active", {})})
    except Exception as error:
        print("[ERROR get-active-captures]", error)
        return jsonify({"ok": False, "active": {}}), 500

@app.route("/api/turrets/<token>/capture", methods=["POST"])
def start_capture(token):
    """Start a 20-minute capture timer for a turret."""
    try:
        captures = _read_captures()
        turret = captures.get("turrets", {}).get(token)
        if not turret:
            return jsonify({"ok": False, "reason": "not-found"}), 404

        body = request.get_json(silent=True) or {}
        wallet = body.get("walletAddress")
        actor_faction = body.get("actorFaction")
        star_faction = turret.get("faction")

        # Faction check: read CURRENT ownership (not just turret registration faction)
        actor_faction_int = int(actor_faction) if actor_faction is not None else None
        current_ownership = _read_ownership()
        star_entry = current_ownership.get("systems", {}).get(str(turret["starId"]), [])
        current_star_faction = int(star_entry[0]) if star_entry else None

        if actor_faction_int is not None:
            if current_star_faction is None:
                return jsonify({"ok": False, "reason": "neutral-system"}), 403
            if actor_faction_int == current_star_faction:
                return jsonify({"ok": False, "reason": "friendly-faction"}), 403

        # One active capture per wallet
        active = captures.setdefault("active", {})
        if wallet:
            for t, a in active.items():
                if t != token and a.get("walletAddress") == wallet:
                    return jsonify({"ok": False, "reason": "already-capturing"}), 409

        now = _time.time()
        actor_name = body.get("actorName", body.get("actor", "UNKNOWN"))
        active[token] = {
            "startedAt": now,
            "endsAt": now + 1200,  # 20 min
            "actor": body.get("actor", "UNKNOWN"),
            "actorName": actor_name,
            "walletAddress": wallet,
            "actorFaction": actor_faction,
            "starId": turret["starId"],
            "starName": turret["starName"],
            "constellationId": turret.get("constellationId"),
            "faction": turret.get("faction")
        }
        _write_captures(captures)

        _append_event({
            "ts": now,
            "type": "capture_start",
            "starId": turret["starId"],
            "starName": turret["starName"],
            "constellationId": turret.get("constellationId"),
            "faction": turret.get("faction"),
            "actor": body.get("actor", "UNKNOWN"),
            "actorName": actor_name,
            "endsAt": now + 1200,
            "token": token
        })
        return jsonify({"ok": True, "endsAt": now + 1200})
    except Exception as error:
        print("[ERROR start-capture]", error)
        return jsonify({"ok": False, "reason": "error"}), 500

@app.route("/api/turrets/<token>/contest", methods=["POST"])
def contest_capture(token):
    """Add 5 minutes to an active capture timer (enemy faction contest)."""
    try:
        captures = _read_captures()
        active = captures.get("active", {})
        entry = active.get(token)
        if not entry:
            return jsonify({"ok": False, "reason": "no-active-capture"}), 404

        body = request.get_json(silent=True) or {}
        contester_faction = body.get("actorFaction")
        capturing_faction = entry.get("actorFaction")

        # Only enemy faction can contest
        if contester_faction is not None and capturing_faction is not None:
            if int(contester_faction) == int(capturing_faction):
                return jsonify({"ok": False, "reason": "same-faction"}), 403

        entry["endsAt"] = entry["endsAt"] + 300  # +5 min
        entry["contested"] = True
        _write_captures(captures)

        now = _time.time()
        contester_name = body.get("actorName", body.get("actor", "UNKNOWN"))
        _append_event({
            "ts": now,
            "type": "capture_contest",
            "starId": entry["starId"],
            "starName": entry.get("starName", entry["starId"]),
            "actor": body.get("actor", "UNKNOWN"),
            "actorName": contester_name,
            "endsAt": entry["endsAt"],
            "token": token
        })
        return jsonify({"ok": True, "endsAt": entry["endsAt"]})
    except Exception as error:
        print("[ERROR contest-capture]", error)
        return jsonify({"ok": False, "reason": "error"}), 500

@app.route("/api/turrets/<token>/complete", methods=["POST"])
def complete_capture(token):
    """Complete a capture after timer expires — transfers star ownership."""
    try:
        captures = _read_captures()
        active = captures.get("active", {})
        entry = active.get(token)
        if not entry:
            return jsonify({"ok": False, "reason": "no-active-capture"}), 404

        now = _time.time()
        if now < entry.get("endsAt", 0) - 5:  # 5s grace period
            return jsonify({"ok": False, "reason": "timer-not-expired"}), 400

        actor_faction = entry.get("actorFaction")
        if actor_faction is None:
            return jsonify({"ok": False, "reason": "missing-actor-faction"}), 400

        star_id = str(entry["starId"])
        ownership = _read_ownership()
        systems = ownership.setdefault("systems", {})
        current = systems.get(star_id, [])
        icon_id = current[1] if len(current) > 1 else 0
        systems[star_id] = [int(actor_faction), icon_id]
        _write_ownership(ownership)

        active.pop(token, None)
        _write_captures(captures)

        _append_event({
            "ts": now,
            "type": "capture",
            "starId": entry["starId"],
            "starName": entry.get("starName", entry["starId"]),
            "faction": int(actor_faction),
            "actor": entry.get("actor", "UNKNOWN"),
            "actorName": entry.get("actorName", entry.get("actor", "UNKNOWN")),
            "token": token
        })
        return jsonify({"ok": True})
    except Exception as error:
        print("[ERROR complete-capture]", error)
        return jsonify({"ok": False, "reason": "error"}), 500

@app.route("/api/turrets/<token>/cancel", methods=["POST"])
def cancel_capture(token):
    try:
        captures = _read_captures()
        active = captures.get("active", {})
        entry = active.pop(token, None)
        _write_captures(captures)

        if entry:
            _append_event({
                "ts": _time.time(),
                "type": "capture_cancel",
                "starId": entry["starId"],
                "starName": entry["starName"],
                "actor": entry.get("actor", "UNKNOWN"),
                "token": token
            })
        return jsonify({"ok": True})
    except Exception as error:
        print("[ERROR cancel-capture]", error)
        return jsonify({"ok": False, "reason": "error"}), 500

@app.route("/turret/<token>")
def turret_page(token):
    """Serve the turret capture interface."""
    return send_from_directory(BASE_DIR, "turret.html")


@app.route("/load-voronoi-cache", methods=["GET"])
def load_voronoi_cache():
    try:
        if not VORONOI_CACHE_PATH.exists():
            return jsonify({"ok": False, "reason": "missing"}), 404

        data = read_json_file(VORONOI_CACHE_PATH)
        return jsonify({"ok": True, "data": data})
    except Exception as error:
        print("[ERROR load-voronoi-cache]", error)
        return jsonify({"ok": False, "reason": "error"}), 500


@app.route("/save-voronoi-cache", methods=["POST"])
def save_voronoi_cache():
    try:
        payload = request.get_json(silent=True)
        if payload is None:
            return jsonify({"ok": False, "reason": "invalid-json"}), 400

        write_json_file(VORONOI_CACHE_PATH, payload)
        return jsonify({"ok": True})
    except Exception as error:
        print("[ERROR save-voronoi-cache]", error)
        return jsonify({"ok": False, "reason": "error"}), 500


@app.route("/clear-voronoi-cache", methods=["POST"])
def clear_voronoi_cache():
    try:
        if VORONOI_CACHE_PATH.exists():
            VORONOI_CACHE_PATH.unlink()
        return jsonify({"ok": True})
    except Exception as error:
        print("[ERROR clear-voronoi-cache]", error)
        return jsonify({"ok": False, "reason": "error"}), 500


CHAT_MAX_AGE = 86400  # 24 hours

def _read_chat():
    return read_json_file(CHAT_PATH) if CHAT_PATH.exists() else []

def _write_chat(data):
    write_json_file(CHAT_PATH, data)

@app.route("/api/chat", methods=["GET"])
def get_chat():
    try:
        channel = request.args.get("channel", "general")
        since = request.args.get("since", 0, type=float)
        now = _time.time()
        messages = _read_chat()
        # Purge messages older than 24h
        messages = [m for m in messages if now - m.get("ts", 0) < CHAT_MAX_AGE]
        _write_chat(messages)
        filtered = [m for m in messages if m.get("channel") == channel and m.get("ts", 0) > since]
        return jsonify({"ok": True, "messages": filtered})
    except Exception as error:
        print("[ERROR get-chat]", error)
        return jsonify({"ok": False, "messages": []}), 500

@app.route("/api/chat", methods=["POST"])
def send_chat():
    try:
        body = request.get_json(silent=True) or {}
        channel = body.get("channel", "general")
        sender = str(body.get("sender", "ANON"))[:32]
        text = str(body.get("text", "")).strip()[:500]
        if not text:
            return jsonify({"ok": False, "reason": "empty"}), 400
        now = _time.time()
        messages = _read_chat()
        messages = [m for m in messages if now - m.get("ts", 0) < CHAT_MAX_AGE]
        messages.append({"channel": channel, "sender": sender, "text": text, "ts": now})
        _write_chat(messages)
        return jsonify({"ok": True})
    except Exception as error:
        print("[ERROR send-chat]", error)
        return jsonify({"ok": False, "reason": "error"}), 500


if __name__ == "__main__":
    app.run(port=8080, debug=True)