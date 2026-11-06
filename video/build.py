# デモ動画を組み立てる：script.json → 合成音声（edge-tts）→ スライド画像（Chrome）→ mp4（ffmpeg）
# 使い方: python video/build.py            （video/frames/*.png が必要。先に node video/capture.mjs）
#         python video/build.py --dry      （音声と長さだけ確認。動画は作らない）
import asyncio, hashlib, json, os, re, subprocess, sys, glob, html
from pathlib import Path

import edge_tts
import imageio_ffmpeg

ROOT = Path(__file__).resolve().parent
FRAMES = ROOT / "frames"
BUILD = ROOT / "build"
OUT = ROOT / "out"
for p in (BUILD / "audio", BUILD / "slides", BUILD / "seg", OUT):
    p.mkdir(parents=True, exist_ok=True)

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
CHROME = os.environ.get("CHROME", r"C:\Program Files\Google\Chrome\Application\chrome.exe")
W, H = 1920, 1080
PAD_SEG = 0.35   # 文の後の間（秒）
PAD_SCENE = 0.6  # 場面の後の間（秒）
DRY = "--dry" in sys.argv

script = json.loads((ROOT / "script.json").read_text(encoding="utf-8"))
VOICE = script.get("voice", "ja-JP-KeitaNeural")
RATE = script.get("rate", "+0%")


def duration_of(path: Path) -> float:
    r = subprocess.run([FFMPEG, "-i", str(path)], capture_output=True, text=True, encoding="utf-8", errors="replace")
    m = re.search(r"Duration: (\d+):(\d+):(\d+\.\d+)", r.stderr)
    if not m:
        raise RuntimeError(f"duration not found for {path}")
    return int(m[1]) * 3600 + int(m[2]) * 60 + float(m[3])


async def tts(text: str, out: Path):
    await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(out))


def tts_cached(text: str) -> Path:
    key = hashlib.sha1(f"{VOICE}|{RATE}|{text}".encode("utf-8")).hexdigest()[:16]
    out = BUILD / "audio" / f"{key}.mp3"
    if not out.exists():
        asyncio.run(tts(text, out))
    return out


def frame_list(name: str) -> list[str]:
    if name == "@stream":
        files = sorted(FRAMES.glob("docs-handover-s*.png"))
        names = [f.stem for f in files]
        # 同じ見た目が続く最初の数枚は間引かず、最大8枚に
        if len(names) > 8:
            step = len(names) / 8
            names = [names[int(i * step)] for i in range(8)]
        return names
    return [name]


def img_uri(name: str) -> str:
    p = FRAMES / f"{name}.png"
    if not p.exists():
        raise FileNotFoundError(p)
    return p.as_uri()


CSS = """
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1920px;height:1080px;overflow:hidden;background:#f6f6f3;color:#18181b;
 font-family:"BIZ UDPGothic","Yu Gothic UI",Meiryo,sans-serif}
.slide{position:relative;width:1920px;height:1080px}
.brand{position:absolute;left:64px;top:40px;font-size:26px;color:#71717a;letter-spacing:.04em}
.brand b{color:#18181b;font-weight:700}
.left{position:absolute;left:64px;top:140px;width:700px}
.left h1{font-size:56px;line-height:1.25;font-weight:700;letter-spacing:.01em}
.left ul{margin-top:36px;list-style:none}
.left li{font-size:32px;line-height:1.5;color:#3f3f46;padding-left:34px;position:relative;margin-bottom:14px}
.left li:before{content:"";position:absolute;left:0;top:18px;width:14px;height:14px;border-radius:50%;background:#059669}
.caption{position:absolute;left:0;right:0;bottom:0;height:104px;background:rgba(24,24,27,.94);color:#fff;
 display:flex;align-items:center;justify-content:center;font-size:38px;letter-spacing:.02em;padding:0 80px;text-align:center;line-height:1.3}
.caption.long{font-size:31px}
.phone{position:absolute;right:120px;top:52px;width:446px;height:936px;background:#111;border-radius:56px;padding:14px;
 box-shadow:0 30px 60px rgba(0,0,0,.25)}
.phone img{width:418px;height:908px;border-radius:44px;object-fit:cover;object-position:top;display:block;background:#fff}
.win{position:absolute;right:64px;top:70px;width:1140px;background:#fff;border-radius:18px;overflow:hidden;
 box-shadow:0 30px 60px rgba(0,0,0,.22);border:1px solid #e4e4e7}
.win .bar{height:40px;background:#e4e4e7;display:flex;align-items:center;gap:10px;padding-left:18px}
.win .bar i{width:14px;height:14px;border-radius:50%;background:#c4c4c8;display:block}
.win img{width:1140px;display:block}
.win.tall img{height:800px;object-fit:cover;object-position:top}
.qr{position:absolute;left:64px;top:360px;width:560px;border-radius:24px;box-shadow:0 20px 40px rgba(0,0,0,.18);border:1px solid #e4e4e7;background:#fff}
.title{position:absolute;left:120px;top:300px;width:1040px}
.title .name{font-family:"UD デジタル 教科書体 N-B","BIZ UDPGothic",sans-serif;font-size:132px;font-weight:700;letter-spacing:.04em}
.title .sub{font-size:42px;color:#3f3f46;margin-top:28px}
.title .ev{font-size:30px;color:#71717a;margin-top:60px}
.cover{position:absolute;right:120px;top:170px;width:540px;border-radius:24px;box-shadow:0 20px 40px rgba(0,0,0,.18);border:1px solid #e4e4e7;background:#fff}
.title.center .name{font-size:150px}
"""


def slide_html(layout: str, heading: str, points: list[str], frame: str, caption: str) -> str:
    esc = html.escape
    pts = "".join(f"<li>{esc(p)}</li>" for p in points)
    brand = '<div class="brand"><b>映らないノート</b>　教室ICTサポートエージェント</div>'
    cap = f'<div class="caption{" long" if len(caption) > 36 else ""}">{esc(caption)}</div>' if caption else ""
    if layout == "title":
        body = f'''<div class="title"><div class="name">{esc(heading)}</div><div class="sub">{esc(points[0]) if points else ""}</div>
        <div class="ev">{esc(points[1]) if len(points) > 1 else ""}</div></div>
        <img class="cover" src="{img_uri(frame)}">'''
        brand = ""
    elif layout == "phone":
        body = f'{brand}<div class="left"><h1>{esc(heading)}</h1><ul>{pts}</ul></div><div class="phone"><img src="{img_uri(frame)}"></div>'
        brand = ""
    elif layout == "qr-phone":
        body = f'''{brand}<div class="left" style="top:120px"><h1>{esc(heading)}</h1><ul>{pts}</ul></div>
        <img class="qr" src="{img_uri("qr-card")}"><div class="phone"><img src="{img_uri(frame)}"></div>'''
        brand = ""
    elif layout in ("window", "crop"):
        tall = "tall" if layout == "window" else ""
        body = f'''{brand}<div class="left" style="width:600px"><h1 style="font-size:52px">{esc(heading)}</h1><ul>{pts}</ul></div>
        <div class="win {tall}"><div class="bar"><i></i><i></i><i></i></div><img src="{img_uri(frame)}"></div>'''
        brand = ""
    else:
        raise ValueError(layout)
    return f'<!doctype html><html lang="ja"><head><meta charset="utf-8"><style>{CSS}</style></head><body><div class="slide">{body}{cap}</div></body></html>'


def render(html_text: str, out_png: Path):
    html_path = out_png.with_suffix(".html")
    html_path.write_text(html_text, encoding="utf-8")
    subprocess.run(
        [CHROME, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--force-device-scale-factor=1",
         f"--window-size={W},{H}", f"--screenshot={out_png}", "--virtual-time-budget=1500", html_path.as_uri()],
        check=True, capture_output=True,
    )


def fmt_srt(t: float) -> str:
    ms = int(round(t * 1000))
    return f"{ms // 3600000:02d}:{ms // 60000 % 60:02d}:{ms // 1000 % 60:02d},{ms % 1000:03d}"


clips = []  # (segment_dir, duration)
srt = []
t = 0.0
n = 0
for scene in script["scenes"]:
    segs = scene["segments"]
    for si, seg in enumerate(segs):
        n += 1
        text = seg["text"]
        audio = tts_cached(text)
        dur = duration_of(audio)
        pad = PAD_SCENE if si == len(segs) - 1 else PAD_SEG
        total = dur + pad
        layout = seg.get("layout", scene["layout"])
        frames = []
        for f in seg["frames"]:
            frames += frame_list(f)
        srt.append((t, t + dur, text))
        print(f"{n:02d} {scene['id']} {dur:5.2f}s +{pad:.2f} frames={len(frames)} {text}")
        if not DRY:
            seg_dir = BUILD / "seg" / f"{n:02d}"
            seg_dir.mkdir(exist_ok=True)
            per = total / len(frames)
            lines = []
            for fi, fr in enumerate(frames):
                png = BUILD / "slides" / f"{n:02d}-{fi:02d}.png"
                render(slide_html(layout, scene["heading"], scene.get("points", []), fr, text), png)
                lines.append(f"file '{png.as_posix()}'\nduration {per:.3f}")
            lines.append(f"file '{png.as_posix()}'")
            (seg_dir / "list.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
            out_mp4 = seg_dir / "seg.mp4"
            subprocess.run(
                [FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(seg_dir / "list.txt"),
                 "-i", str(audio), "-af", f"apad=pad_dur={pad + 0.5}",
                 "-vf", f"fps=30,scale={W}:{H}:flags=lanczos,format=yuv420p", "-r", "30",
                 "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "160k", "-ar", "44100",
                 "-t", f"{total:.3f}", str(out_mp4)],
                check=True,
            )
            clips.append((out_mp4, total))
        t += total

print(f"total {t:.1f}s  ({int(t // 60)}:{t % 60:04.1f})")
if t > 180:
    print("WARNING: 3分を超えています。script.json の文を削るか rate を上げてください")

srt_text = "".join(f"{i + 1}\n{fmt_srt(a)} --> {fmt_srt(b)}\n{txt}\n\n" for i, (a, b, txt) in enumerate(srt))
(OUT / "utsuranai-demo.srt").write_text(srt_text, encoding="utf-8")

if not DRY:
    lst = BUILD / "all.txt"
    lst.write_text("".join(f"file '{p.as_posix()}'\n" for p, _ in clips), encoding="utf-8")
    final = OUT / "utsuranai-demo.mp4"
    subprocess.run([FFMPEG, "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
                    "-movflags", "+faststart", str(final)], check=True)
    print("wrote", final, f"{duration_of(final):.1f}s")
