"""High-confidence content signatures; marker-only parser strings are not keys."""
import re
_PATTERN = re.compile(rb'-----BEGIN (?P<kind>(?:RSA |EC |OPENSSH )?PRIVATE KEY)-----\r?\n[A-Za-z0-9+/=\r\n]{32,}-----END (?P=kind)-----|ghp_[A-Za-z0-9]{36}')


def unsafe_content(raw):
    return _PATTERN.search(raw) is not None
