"""Builds Peelink2, signs it with the Yomori keystore and publishes it in the anime repository.

Run it through PUBLICAR_PEELINK2.bat. The keystore password is typed by whoever runs it (apksigner asks for it
in the console): it is never stored or passed on the command line.

The anime repository lives in the `anime/` folder of the `repo` branch, which is what ZENTU reads:
https://raw.githubusercontent.com/YomoriDev/extensions/repo/anime/repo.json
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
WORKTREE_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
REPO_DIR = os.path.join(WORKTREE_ROOT, "ext-repo")
KEYSTORE = os.path.join(WORKTREE_ROOT, "zentu-extensions", "yomori-extension.keystore")
FINGERPRINT = "ffdd82d14d32b14c510a896f2143132b9d58df8b27a9fd4e65ce77175084ebac"

MODULE = "peelink2"
PKG = "eu.kanade.tachiyomi.animeextension.es.peelink2"
APK_NAME = "es-peelink2-release.apk"
BUILT = os.path.join(HERE, MODULE, "build", "outputs", "apk", "release", MODULE + "-release.apk")


def run(cmd, **kw):
    print(">", " ".join(cmd))
    return subprocess.run(cmd, **kw)


def build_tools():
    sdk = os.environ.get("ANDROID_HOME") or os.path.join(os.environ["LOCALAPPDATA"], "Android", "Sdk")
    versions = sorted(os.listdir(os.path.join(sdk, "build-tools")), key=lambda v: [int(x) for x in re.findall(r"\d+", v)])
    return os.path.join(sdk, "build-tools", versions[-1])


def read_version():
    gradle = open(os.path.join(HERE, MODULE, "build.gradle.kts"), encoding="utf-8").read()
    return int(re.search(r"versionCode\s*=\s*(\d+)", gradle).group(1)), re.search(r'versionName\s*=\s*"([^"]+)"', gradle).group(1)


def main():
    if run([os.path.join(HERE, "gradlew.bat"), ":%s:assembleRelease" % MODULE, "-q"], cwd=HERE).returncode != 0:
        sys.exit("La compilacion fallo")
    if not os.path.exists(KEYSTORE):
        sys.exit("No encuentro el keystore: %s" % KEYSTORE)

    tools = build_tools()
    code, version = read_version()
    aligned = os.path.join(HERE, MODULE + "-aligned.apk")
    signed = os.path.join(HERE, MODULE + "-signed.apk")
    for f in (aligned, signed):
        if os.path.exists(f):
            os.remove(f)
    if run([os.path.join(tools, "zipalign.exe"), "-p", "-f", "4", BUILT, aligned]).returncode != 0:
        sys.exit("zipalign fallo")

    print("\nEscribe la contrasena del keystore Yomori cuando la pida (no se muestra ni se guarda).\n")
    sign = [os.path.join(tools, "apksigner.bat"), "sign", "--ks", KEYSTORE, "--out", signed]
    if os.environ.get("YOMORI_KEY_ALIAS"):
        sign += ["--ks-key-alias", os.environ["YOMORI_KEY_ALIAS"]]
    if run(sign + [aligned]).returncode != 0:
        sys.exit("No se pudo firmar (contrasena incorrecta o keystore con varias llaves: define YOMORI_KEY_ALIAS)")

    out = run([os.path.join(tools, "apksigner.bat"), "verify", "--print-certs", signed], capture_output=True, text=True).stdout
    match = re.search(r"SHA-256 digest:\s*([0-9a-fA-F]+)", out)
    if not match or match.group(1).lower() != FINGERPRINT:
        sys.exit("La firma no coincide con la llave del repo. No se publica.")
    print("Firma verificada: coincide con la llave del repo.")

    # A separate checkout of the `repo` branch, so the current work is not touched
    if not os.path.isdir(REPO_DIR):
        run(["git", "-C", os.path.join(WORKTREE_ROOT, "zentu-extensions"), "fetch", "origin", "repo"])
        if run(["git", "-C", os.path.join(WORKTREE_ROOT, "zentu-extensions"), "worktree", "add", REPO_DIR, "origin/repo", "--detach"]).returncode != 0:
            sys.exit("No pude preparar la rama repo")
    else:
        run(["git", "-C", REPO_DIR, "fetch", "origin", "repo"])
        run(["git", "-C", REPO_DIR, "checkout", "--detach", "origin/repo"])

    anime_dir = os.path.join(REPO_DIR, "anime")
    os.makedirs(os.path.join(anime_dir, "apk"), exist_ok=True)
    shutil.copyfile(signed, os.path.join(anime_dir, "apk", APK_NAME))

    entry = {
        "name": "Peelink2",
        "pkg": PKG,
        "apk": APK_NAME,
        "lang": "es",
        "code": code,
        "version": version,
        "nsfw": 0,
        "hasReadme": 0,
        "hasChangelog": 0,
        "sources": [{"id": 133439507932857900, "name": "Peelink2", "lang": "es", "baseUrl": "https://www.peelink2.com"}],
        "sha256": hashlib.sha256(open(signed, "rb").read()).hexdigest(),
    }
    for name, indent in (("index.json", 2), ("index.min.json", None)):
        path = os.path.join(anime_dir, name)
        data = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
        data = [e for e in data if e["pkg"] != PKG] + [entry]
        with open(path, "w", encoding="utf-8") as f:
            if indent:
                json.dump(data, f, ensure_ascii=False, indent=indent)
                f.write("\n")
            else:
                json.dump(data, f, ensure_ascii=False, separators=(",", ":"))

    with open(os.path.join(anime_dir, "repo.json"), "w", encoding="utf-8") as f:
        json.dump(
            {
                "meta": {
                    "name": "Yomori Anime Repo",
                    "shortName": "YOMORI",
                    "website": "https://github.com/YomoriDev/extensions",
                    "signingKeyFingerprint": FINGERPRINT,
                },
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    os.remove(aligned)
    os.remove(signed)
    if run(["git", "-C", REPO_DIR, "add", "anime"]).returncode != 0:
        sys.exit("git add fallo")
    run(["git", "-C", REPO_DIR, "commit", "-m", "Anime repo: Peelink2 %s" % version])
    print("\nSubiendo a GitHub (rama repo)...")
    if run(["git", "-C", REPO_DIR, "push", "origin", "HEAD:repo"]).returncode != 0:
        sys.exit("El push fallo")
    print("\nListo: Peelink2 %s publicada. En ZENTU: Anime > Extensiones > actualizar." % version)


if __name__ == "__main__":
    main()
