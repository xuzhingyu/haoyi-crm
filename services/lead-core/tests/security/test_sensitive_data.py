from cryptography.fernet import Fernet

from lead_core.security.sensitive_data import SensitiveTextCipher


def test_sensitive_text_is_encrypted_and_can_be_restored() -> None:
    cipher = SensitiveTextCipher(Fernet.generate_key().decode())

    encrypted = cipher.encrypt("13800000000")

    assert encrypted != "13800000000"
    assert cipher.decrypt(encrypted) == "13800000000"
