import socket
from ipaddress import ip_address


def _private_host_ip() -> str | None:
    try:
        host = socket.gethostname()
        candidates = socket.getaddrinfo(host, None, socket.AF_INET)
    except OSError:
        return None
    for candidate in candidates:
        value = candidate[4][0]
        parsed = ip_address(value)
        if parsed.is_private and not parsed.is_loopback:
            return value
    return None


def get_local_ip() -> str:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("8.8.8.8", 80))
            value = sock.getsockname()[0]
            if not ip_address(value).is_loopback:
                return value
    except OSError:
        pass
    return _private_host_ip() or "127.0.0.1"


def network_info(port: int = 8000) -> dict[str, str]:
    ip = get_local_ip()
    return {
        "local_url": f"http://127.0.0.1:{port}",
        "network_url": f"http://{ip}:{port}",
        "https_local_url": f"https://127.0.0.1:{port}",
        "https_network_url": f"https://{ip}:{port}",
        "local_ip": ip,
    }
