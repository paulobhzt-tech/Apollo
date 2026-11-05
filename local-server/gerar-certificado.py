"""Create a private local TLS CA and server certificate for Apollo PDV.

Run once on the server PC. Install only apollo-local-ca.crt on client devices.
Never share server.key. Changing LAN IP requires regenerating/retrusting.
"""
import ipaddress
import os
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import ExtendedKeyUsageOID, NameOID


def create_certificates(output: Path, lan_ip: str) -> None:
    ip = ipaddress.ip_address(lan_ip)
    output.mkdir(parents=True, exist_ok=True)
    ca_path = output / "apollo-local-ca.crt"
    cert_path = output / "server.crt"
    key_path = output / "server.key"

    if ca_path.exists() and cert_path.exists() and key_path.exists():
        existing = x509.load_pem_x509_certificate(cert_path.read_bytes())
        try:
            names = existing.extensions.get_extension_for_class(x509.SubjectAlternativeName).value
            if ip in names.get_values_for_type(x509.IPAddress) and existing.not_valid_after_utc > datetime.now(timezone.utc) + timedelta(days=30):
                return
        except x509.ExtensionNotFound:
            pass

    now = datetime.now(timezone.utc)
    ca_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    ca_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Apollo PDV Local CA")])
    ca = (x509.CertificateBuilder()
          .subject_name(ca_name).issuer_name(ca_name).public_key(ca_key.public_key())
          .serial_number(x509.random_serial_number())
          .not_valid_before(now - timedelta(days=1))
          .not_valid_after(now + timedelta(days=3650))
          .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
          .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=False, content_commitment=False,
                                       data_encipherment=False, key_agreement=False, key_cert_sign=True,
                                       crl_sign=True, encipher_only=False, decipher_only=False), critical=True)
          .sign(ca_key, hashes.SHA256()))
    server_key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    subject = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Apollo PDV Servidor Local")])
    server = (x509.CertificateBuilder()
              .subject_name(subject).issuer_name(ca.subject).public_key(server_key.public_key())
              .serial_number(x509.random_serial_number())
              .not_valid_before(now - timedelta(days=1))
              .not_valid_after(now + timedelta(days=825))
              .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
              .add_extension(x509.SubjectAlternativeName([
                  x509.IPAddress(ip),
                  x509.IPAddress(ipaddress.ip_address("127.0.0.1")),
                  x509.DNSName("localhost"),
              ]), critical=False)
              .add_extension(x509.ExtendedKeyUsage([ExtendedKeyUsageOID.SERVER_AUTH]), critical=False)
              .add_extension(x509.KeyUsage(digital_signature=True, key_encipherment=True,
                                           content_commitment=False, data_encipherment=False,
                                           key_agreement=False, key_cert_sign=False, crl_sign=False,
                                           encipher_only=False, decipher_only=False), critical=True)
              .sign(ca_key, hashes.SHA256()))
    ca_path.write_bytes(ca.public_bytes(serialization.Encoding.PEM))
    cert_path.write_bytes(server.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(server_key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption()))
    try:
        os.chmod(key_path, 0o600)
    except OSError:
        pass


if __name__ == "__main__":
    create_certificates(Path(sys.argv[1]), sys.argv[2])
