#!/usr/bin/env python3
"""Resolve + download androidx dependency tree via curl (Java TLS is blocked by the egress proxy)."""
import os, re, subprocess, sys, xml.etree.ElementTree as ET

BASE = "https://dl.google.com/dl/android/maven2"
CENTRAL = "https://repo.maven.apache.org/maven2"
OUT = os.path.expanduser(os.environ.get("APKLIBS", "~/workspace/apklibs"))
POMD = os.path.join(OUT, "poms")
LIBD = os.path.join(OUT, "libs")
os.makedirs(POMD, exist_ok=True); os.makedirs(LIBD, exist_ok=True)

NS = {"m": "http://maven.apache.org/POM/4.0.0"}

def curl(url, dest):
    r = subprocess.run(["curl", "-sSL", "--retry", "3", "-o", dest, "-w", "%{http_code}", url],
                       capture_output=True, text=True)
    code = r.stdout.strip()
    if code != "200" or os.path.getsize(dest) == 0:
        return None
    return dest

def pom_coords(path):
    return path.replace("/poms/", "").replace(".pom", "")

def fetch_pom(group, artifact, version):
    gpath = group.replace(".", "/")
    for base in (BASE, CENTRAL):
        url = f"{base}/{gpath}/{artifact}/{version}/{artifact}-{version}.pom"
        dest = os.path.join(POMD, f"{group}.{artifact}-{version}.pom")
        if os.path.exists(dest) and os.path.getsize(dest) > 0:
            return dest, base
        if curl(url, dest):
            return dest, base
    return None, None

def parse_deps(pom_path):
    tree = ET.parse(pom_path)
    root = tree.getroot()
    parent = root.find("m:parent", NS)
    props = {}
    if parent is not None:
        pg, pa, pv = (parent.findtext(f"m:{t}", namespaces=NS) for t in ("groupId", "artifactId", "version"))
        ppath, _ = fetch_pom(pg, pa, pv)
        if ppath:
            props.update(parse_props(ppath))
    props.update(parse_props(pom_path))
    deps = []
    for d in root.findall("m:dependencies/m:dependency", NS):
        scope = d.findtext("m:scope", namespaces=NS) or "compile"
        if scope in ("test", "provided"):
            continue
        g = d.findtext("m:groupId", namespaces=NS)
        a = d.findtext("m:artifactId", namespaces=NS)
        v = d.findtext("m:version", namespaces=NS)
        t = d.findtext("m:type", namespaces=NS) or "jar"
        opt = d.findtext("m:optional", namespaces=NS) == "true"
        if opt:
            continue
        def sub(s):
            return re.sub(r"\$\{([^}]+)\}", lambda m: props.get(m.group(1), m.group(0)), s or "")
        g, a, v = sub(g), sub(a), sub(v)
        if not v or "${" in v:
            continue
        deps.append((g, a, v, t))
    return deps, props

def parse_props(pom_path):
    tree = ET.parse(pom_path)
    props = {}
    pel = tree.getroot().find("m:properties", NS)
    if pel is not None:
        for c in pel:
            tag = c.tag.split("}")[-1]
            props[tag] = c.text or ""
    return props

def lib_url(group, artifact, version, ext, base):
    gpath = group.replace(".", "/")
    return f"{base}/{gpath}/{artifact}/{version}/{artifact}-{version}.{ext}"

def main():
    roots = [("androidx.recyclerview", "recyclerview", "1.3.2")]
    seen = set()
    queue = list(roots)
    libs = {}  # (g,a,v) -> (ext, base)
    while queue:
        g, a, v = queue.pop(0)
        if (g, a, v) in seen:
            continue
        seen.add((g, a, v))
        print(f"resolving {g}:{a}:{v}", flush=True)
        ppath, base = fetch_pom(g, a, v)
        if not ppath:
            print(f"  !! no POM for {g}:{a}:{v}", flush=True)
            continue
        ext = "aar" if g.startswith("androidx.") or g.startswith("com.google.android") else "jar"
        # check the artifact actually exists with that ext
        url = lib_url(g, a, v, ext, base)
        dest = os.path.join(LIBD, f"{a}-{v}.{ext}")
        if not os.path.exists(dest):
            if not curl(url, dest):
                # try jar fallback
                ext = "jar"
                url = lib_url(g, a, v, ext, base)
                dest = os.path.join(LIBD, f"{a}-{v}.{ext}")
                if not curl(url, dest):
                    print(f"  !! no artifact for {g}:{a}:{v}", flush=True)
                    continue
        libs[(g, a, v)] = (ext, dest)
        try:
            deps, _ = parse_deps(ppath)
        except Exception as e:
            print(f"  !! parse error: {e}", flush=True)
            continue
        for dg, da, dv, dt in deps:
            if (dg, da, dv) not in seen:
                queue.append((dg, da, dv))
    print(f"\nresolved {len(libs)} artifacts:", flush=True)
    for (g, a, v), (ext, dest) in sorted(libs.items()):
        print(f"  {g}:{a}:{v} -> {os.path.basename(dest)}")
    with open(os.path.join(OUT, "libs.txt"), "w") as f:
        for (g, a, v), (ext, dest) in sorted(libs.items()):
            f.write(f"{g}:{a}:{v}|{ext}|{dest}\n")

main()
