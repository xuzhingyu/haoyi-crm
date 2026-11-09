"""CEO business views exclude private notes, contacts and raw evidence payloads."""
PRIVATE_KEYS = {"phone", "wechat", "contact_name", "private_notes", "note", "notes",
                "raw_feedback", "confirmed_feedback", "raw_input", "evidence"}


def redact_private(value):
    if isinstance(value, list):
        return [redact_private(item) for item in value]
    if isinstance(value, dict):
        result = {key: redact_private(item) for key, item in value.items() if key not in PRIVATE_KEYS}
        if "entity_type" in value and "before" in value and "after" in value:
            result.update(before={}, after={}, reason=None)
        return result
    return value


def role_view(value, user):
    return redact_private(value) if user.role == "executive" else value
