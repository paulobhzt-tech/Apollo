"""High-confidence content signatures; marker-only parser strings are not keys."""
import re
_PATTERN = re.compile(rb'-----BEGIN (?P<kind>(?:RSA |EC |OPENSSH )?PRIVATE KEY)-----\r?\n[A-Za-z0-9+/=\r\n]{32,}-----END (?P=kind)-----|ghp_[A-Za-z0-9]{36}')


def unsafe_content(raw):
    return _PATTERN.search(raw) is not None


def public_vectors_only(raw, base_bytes, path, allowed_hashes):
    import hashlib
    matches=list(_PATTERN.finditer(raw))
    return bool(matches) and bool(re.fullmatch(r'usr/lib/x86_64-linux-gnu/libgnutls\.so\.[0-9.]+',path)) and raw==base_bytes and all(hashlib.sha256(m.group()).hexdigest() in allowed_hashes for m in matches)
