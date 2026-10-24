#!/usr/bin/env python3.13
"""Run one image through Cloudinary's enhancement transformations and download the result.

    cloudinary_enhance.py --in FILE --out FILE [--effects improve,upscale,enhance,background_removal]

Reads CLOUDINARY_URL (cloudinary://API_KEY:API_SECRET@CLOUD_NAME) from the environment; the key
is never printed. Uploads to a scratch folder with an eager transformation, downloads the eager
result, then destroys the upload. Exit 2 when the variable is missing, 3 on an API refusal."""
import argparse, hashlib, json, os, pathlib, sys, time, urllib.parse, urllib.request, uuid

EFFECTS = {"improve": "e_improve", "upscale": "e_upscale", "enhance": "e_enhance",
           "background_removal": "e_background_removal", "sharpen": "e_sharpen:60", "auto_contrast": "e_auto_contrast"}

def sign(params, secret):
    s = "&".join(f"{k}={params[k]}" for k in sorted(params) if params[k] not in (None, ""))
    return hashlib.sha1((s + secret).encode()).hexdigest()

def multipart(fields, file_field, filename, data):
    b = uuid.uuid4().hex; out = []
    for k, v in fields.items():
        out.append(f"--{b}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode())
    out.append(f"--{b}\r\nContent-Disposition: form-data; name=\"{file_field}\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode())
    out.append(data); out.append(f"\r\n--{b}--\r\n".encode())
    return b"".join(out), f"multipart/form-data; boundary={b}"

def post(url, body, ctype):
    req = urllib.request.Request(url, data=body, headers={"Content-Type": ctype})
    with urllib.request.urlopen(req, timeout=120) as r: return json.load(r)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--in", dest="inp", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--effects", default="improve"); a = ap.parse_args()
    url = os.environ.get("CLOUDINARY_URL")
    if not url:
        print("CLOUDINARY_URL is not set in this environment; add it as a secret (cloudinary://key:secret@cloud) and allow api.cloudinary.com and res.cloudinary.com on the network policy.", file=sys.stderr); sys.exit(2)
    u = urllib.parse.urlparse(url); key, secret, cloud = u.username, u.password, u.hostname
    eff = [EFFECTS[e.strip()] for e in a.effects.split(",") if e.strip()]
    if not eff: print("no effects given", file=sys.stderr); sys.exit(1)
    eager = "/".join(eff) + "/f_png"
    public_id = f"forge-studio-tmp/{uuid.uuid4().hex}"
    ts = str(int(time.time()))
    params = {"eager": eager, "public_id": public_id, "timestamp": ts}
    fields = dict(params, api_key=key, signature=sign(params, secret))
    data = pathlib.Path(a.inp).read_bytes()
    body, ctype = multipart(fields, "file", pathlib.Path(a.inp).name, data)
    try:
        res = post(f"https://api.cloudinary.com/v1_1/{cloud}/image/upload", body, ctype)
    except urllib.error.HTTPError as e:
        print(f"Cloudinary refused the upload: HTTP {e.code} {e.read()[:300]!r}", file=sys.stderr); sys.exit(3)
    eager_url = (res.get("eager") or [{}])[0].get("secure_url")
    if not eager_url:
        print(f"Cloudinary returned no eager result: {json.dumps({k: res.get(k) for k in ('public_id','width','height','eager')})}", file=sys.stderr); sys.exit(3)
    with urllib.request.urlopen(eager_url, timeout=120) as r: pathlib.Path(a.out).write_bytes(r.read())
    # tidy up: destroy the scratch upload (best-effort)
    try:
        dparams = {"public_id": public_id, "timestamp": str(int(time.time()))}
        dfields = dict(dparams, api_key=key, signature=sign(dparams, secret))
        post(f"https://api.cloudinary.com/v1_1/{cloud}/image/destroy", urllib.parse.urlencode(dfields).encode(), "application/x-www-form-urlencoded")
    except Exception: pass
    print("RESULT " + json.dumps({"out": a.out, "effects": eff, "width": res.get("width"), "height": res.get("height")}))

if __name__ == "__main__": main()
