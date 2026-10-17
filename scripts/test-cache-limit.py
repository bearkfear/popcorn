"""Exercise cache quota changes through the real server with isolated sparse files.

Run after `cargo build -p popcorn-server`: python3 scripts/test-cache-limit.py
"""

import base64
import hashlib
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import tempfile
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
GIB = 1024 ** 3


def sparse(path, size, modified):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as file:
        file.truncate(size)
    os.utime(path, (modified, modified))
    os.utime(path.parent, (modified, modified))


def bencode(value):
    if isinstance(value, int):
        return b"i" + str(value).encode() + b"e"
    if isinstance(value, bytes):
        return str(len(value)).encode() + b":" + value
    return b"d" + b"".join(bencode(key) + bencode(value[key]) for key in sorted(value)) + b"e"


with tempfile.TemporaryDirectory(prefix="popcorn-cache-quota-") as temporary:
    directory = Path(temporary)
    downloads = directory / "data/downloads"
    token = os.urandom(32).hex()
    token_file = directory / "token"
    token_file.write_text(token)
    token_file.chmod(0o600)
    sparse(downloads / "old/movie.mp4", 5 * GIB, 1000)
    sparse(downloads / "recent/movie.mp4", 12 * GIB // 5, 2000)
    external = directory / "outside.txt"
    external.write_text("keep external files")
    (downloads / "outside-link").symlink_to(external)
    with (directory / "stderr").open("w") as stderr:
        process = subprocess.Popen(
            [str(ROOT / "target/debug/popcorn-server"), "serve", "--catalog",
             str(ROOT / "resources/catalog.sqlite"), "--data-dir", str(directory / "data"),
             "--token-file", str(token_file)],
            stdout=subprocess.PIPE, stderr=stderr, text=True,
        )
        try:
            readable, _, _ = select.select([process.stdout], [], [], 15)
            assert readable, "Backend readiness timed out"
            line = process.stdout.readline()
            assert line, (directory / "stderr").read_text()
            base = "http://" + json.loads(line)["address"]

            def rpc(service, method, payload=None):
                request = urllib.request.Request(
                    base + "/popcorn.v1." + service + "/" + method,
                    data=json.dumps(payload or {}).encode(),
                    headers={"Authorization": "Bearer " + token,
                             "Content-Type": "application/json", "Connect-Protocol-Version": "1"},
                )
                try:
                    with urllib.request.urlopen(request, timeout=20) as response:
                        return response.status, json.load(response)
                except urllib.error.HTTPError as error:
                    return error.code, json.load(error)

            def storage(method, payload=None):
                status, response = rpc("StorageService", method, payload)
                assert status == 200, response
                return response["settings"]

            initial = storage("GetCacheSettings")
            assert int(initial["usedBytes"]) > 7 * GIB
            reduced = storage("SetCacheLimit", {"limitBytes": str(4 * GIB)})
            assert int(reduced["limitBytes"]) == 4 * GIB
            assert int(reduced["usedBytes"]) == 12 * GIB // 5
            assert not (downloads / "old").exists()
            assert (downloads / "recent/movie.mp4").exists()
            assert external.read_text() == "keep external files"
            increased = storage("SetCacheLimit", {"limitBytes": str(20 * GIB)})
            assert increased["usedBytes"] == reduced["usedBytes"], "Increasing must retain cache"
            status, _ = rpc("StorageService", "SetCacheLimit", {"limitBytes": "1"})
            assert status == 400
            assert int(storage("GetCacheSettings")["limitBytes"]) == 20 * GIB

            # A local, complete one-piece torrent exercises active playback protection
            # without downloading any content from peers.
            media = bytes(16384)
            (downloads / "quota-fixture.mp4").write_bytes(media)
            torrent = bencode({b"info": {b"name": b"quota-fixture.mp4", b"length": len(media),
                                       b"piece length": len(media), b"pieces": hashlib.sha1(media).digest()}})
            status, added = rpc("SourceService", "AddSource", {
                "content": {"mediaType": "MEDIA_TYPE_MOVIE", "tmdbId": 42},
                "torrentFile": base64.b64encode(torrent).decode(),
            })
            assert status == 200, added
            status, started = rpc("PlaybackService", "StartPlayback", {
                "sourceId": added["source"]["sourceId"], "fileIndex": 0,
                "idempotencyKey": "quota-fixture", "quality": "PLAYBACK_QUALITY_AUTO",
            })
            assert status == 200, started
            status, rejected = rpc("StorageService", "SetCacheLimit", {"limitBytes": str(GIB)})
            assert status == 400 and rejected["message"] == "SOURCE_IN_USE", rejected
            active = storage("GetCacheSettings")
            assert int(active["limitBytes"]) == 20 * GIB, "Rejected changes must not persist"
            assert (downloads / "recent/movie.mp4").exists()
            status, stopped = rpc("PlaybackService", "StopPlayback", {
                "playbackId": started["playback"]["playbackId"],
            })
            assert status == 200, stopped
            final = storage("SetCacheLimit", {"limitBytes": str(GIB)})
            assert int(final["usedBytes"]) <= GIB
            assert not (downloads / "recent").exists()
            assert external.exists()
            print("Cache quota regression passed: reduce 20→4 GB, oldest first, increase, invalid limit, symlink safety, active playback protection, retry after stop.")
        finally:
            process.send_signal(signal.SIGTERM)
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
