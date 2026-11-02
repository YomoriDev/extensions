"""Signs a manga extension APK with the Yomori keystore and updates the repo indexes.

Usage: python publish_extension.py <gradle module> <package name> <apk file name>

The keystore password is typed by whoever runs this (apksigner asks for it in the console): it is never stored
or passed on the command line. Run it through PUBLICAR_RN_SCANLATION.bat.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
if len(sys.argv) != 4:
    sys.exit("Uso: python publish_extension.py <modulo> <paquete> <nombre-del-apk>")
MODULE, PKG, APK_NAME = sys.argv[1], sys.argv[2], sys.argv[3]
BUILT = os.path.join(HERE, MODULE, "build", "outputs", "apk", "release", MODULE + "-release.apk")
KEYSTORE = os.path.join(REPO, "yomori-extension.keystore")


def build_tools():
    sdk = os.environ.get("ANDROID_HOME") or os.environ.get("ANDROID_SDK_ROOT") or os.path.join(
        os.environ["LOCALAPPDATA"], "Android", "Sdk"
    )
    versions = sorted(os.listdir(os.path.join(sdk, "build-tools")), key=lambda v: [int(x) for x in re.findall(r"\d+", v)])
    return os.path.join(sdk, "build-tools", versions[-1])


def run(cmd, **kw):
    print(">", " ".join(cmd))
    return subprocess.run(cmd, **kw)


def read_version():
    gradle = open(os.path.join(HERE, MODULE, "build.gradle.kts"), encoding="utf-8").read()
    code = int(re.search(r"versionCode\s*=\s*(\d+)", gradle).group(1))
    name = re.search(r'versionName\s*=\s*"([^"]+)"', gradle).group(1)
    return code, name


def update_json(path, update):
    full = os.path.join(REPO, path)
    if not os.path.exists(full):
        return
    with open(full, encoding="utf-8") as f:
        data = json.load(f)
    update(data)
    with open(full, "w", encoding="utf-8") as f:
        if path.endswith(".min.json"):
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        else:
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.write("\n")


def main():
    if not os.path.exists(BUILT):
        sys.exit("Primero compila: gradlew :" + MODULE + ":assembleRelease (no existe %s)" % BUILT)
    if not os.path.exists(KEYSTORE):
        sys.exit("No encuentro el keystore: %s" % KEYSTORE)

    tools = build_tools()
    code, version = read_version()
    aligned = os.path.join(HERE, "" + MODULE + "-aligned.apk")
    signed = os.path.join(HERE, "" + MODULE + "-signed.apk")
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

    # The app only trusts updates signed with the key the repo declares: check before publishing anything
    out = run([os.path.join(tools, "apksigner.bat"), "verify", "--print-certs", signed], capture_output=True, text=True).stdout
    match = re.search(r"SHA-256 digest:\s*([0-9a-fA-F]+)", out)
    fingerprint = match.group(1).lower() if match else ""
    with open(os.path.join(REPO, "index.json"), encoding="utf-8") as f:
        expected = json.load(f)["signingKey"].lower()
    if fingerprint != expected:
        sys.exit("La firma (%s) no coincide con la llave del repo (%s). No se publica." % (fingerprint, expected))
    print("Firma verificada: coincide con la llave del repo.")

    sha = hashlib.sha256(open(signed, "rb").read()).hexdigest()
    size_kb = round(os.path.getsize(signed) / 1024, 2)
    for folder in ("apk", os.path.join("dist", "apk")):
        os.makedirs(os.path.join(REPO, folder), exist_ok=True)
        shutil.copyfile(signed, os.path.join(REPO, folder, APK_NAME))

    def bump_index(data):
        for ext in data["extensionList"]["extensions"]:
            if ext["packageName"] == PKG:
                # keep the type the entry already had (some entries store the code as text)
                ext["versionCode"] = str(code) if isinstance(ext.get("versionCode"), str) else code
                ext["versionName"] = version

    def bump_legacy(data):
        for ext in data.get("extensions", []):
            if ext.get("pkg") == PKG:
                ext.update({"code": code, "version": version, "hash": sha, "size": size_kb})

    for path in ("index.json", os.path.join("dist", "index.json")):
        update_json(path, bump_index)
    for path in ("repo.json", os.path.join("dist", "repo.json")):
        update_json(path, bump_legacy)

    os.remove(aligned)
    os.remove(signed)
    print("\nListo: RN Scanlation %s (code %d) firmada y registrada en los indices." % (version, code))


if __name__ == "__main__":
    main()
