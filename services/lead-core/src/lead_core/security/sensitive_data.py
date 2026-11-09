from cryptography.fernet import Fernet

SENSITIVE_SOURCE_FIELDS = frozenset({"representative_name", "business_phone"})


class SensitiveTextCipher:
    def __init__(self, key: str) -> None:
        if not key:
            key = Fernet.generate_key().decode()
        self._fernet = Fernet(key.encode())

    def encrypt(self, value: str | None) -> str | None:
        if value is None:
            return None
        return self._fernet.encrypt(value.encode()).decode()

    def encrypt_bytes(self, value: bytes) -> bytes:
        return self._fernet.encrypt(value)

    def decrypt(self, value: str | None) -> str | None:
        if value is None:
            return None
        return self._fernet.decrypt(value.encode()).decode()

    def protect_mapping(self, values: dict) -> dict:
        protected = dict(values)
        for field in SENSITIVE_SOURCE_FIELDS:
            value = protected.get(field)
            if value:
                protected[field] = {"ciphertext": self.encrypt(str(value))}
        return protected

    def reveal_mapping(self, values: dict) -> dict:
        revealed = dict(values)
        for field in SENSITIVE_SOURCE_FIELDS:
            value = revealed.get(field)
            if isinstance(value, dict) and value.get("ciphertext"):
                revealed[field] = self.decrypt(value["ciphertext"])
        return revealed
