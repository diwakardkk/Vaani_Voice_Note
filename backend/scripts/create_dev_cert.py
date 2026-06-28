from datetime import datetime, timedelta, timezone
from ipaddress import ip_address
from pathlib import Path
import sys

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID

ROOT = Path(__file__).resolve().parents[1]
CERT_DIR = ROOT / "data" / "certs"
KEY_PATH = CERT_DIR / "vaaninotes.key"
CERT_PATH = CERT_DIR / "vaaninotes.crt"

sys.path.insert(0, str(ROOT))
from app.services.ip_service import get_local_ip  # noqa: E402


def main() -> None:
    CERT_DIR.mkdir(parents=True, exist_ok=True)
    local_ip = sys.argv[1] if len(sys.argv) > 1 else get_local_ip()
    try:
        parsed_local_ip = ip_address(local_ip)
    except ValueError as exc:
        raise SystemExit(f"Invalid IP address: {local_ip}") from exc
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    subject = issuer = x509.Name(
        [
            x509.NameAttribute(NameOID.COUNTRY_NAME, "IN"),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "VaaniNotes AI Local"),
            x509.NameAttribute(NameOID.COMMON_NAME, "VaaniNotes AI"),
        ]
    )
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc) - timedelta(minutes=5))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=825))
        .add_extension(
            x509.SubjectAlternativeName(
                [
                    x509.DNSName("localhost"),
                    x509.IPAddress(ip_address("127.0.0.1")),
                    x509.IPAddress(parsed_local_ip),
                ]
            ),
            critical=False,
        )
        .sign(key, hashes.SHA256())
    )
    KEY_PATH.write_bytes(
        key.private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.TraditionalOpenSSL,
            encryption_algorithm=serialization.NoEncryption(),
        )
    )
    CERT_PATH.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    print(f"Created certificate: {CERT_PATH}")
    print(f"Created key: {KEY_PATH}")
    print(f"HTTPS LAN URL: https://{local_ip}:8000")
    print("If the browser warns about the certificate, accept it for this private local app.")


if __name__ == "__main__":
    main()
