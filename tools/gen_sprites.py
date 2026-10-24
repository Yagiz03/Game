"""Renders the raw sprite images with FLUX / Qwen-Image on Hugging Face.

Usage: HF_TOKEN=... python3 tools/gen_sprites.py RAW_DIR [--model flux|qwen] [NAME ...]

Writes RAW_DIR/<name>.png for every sprite in PROMPTS (or only the names
given); feed RAW_DIR to tools/cut_sprites.py afterwards. The models run on
their public ZeroGPU Spaces through gradio_client, which needs only an HF
token (pip install gradio_client); free accounts get a daily GPU quota.
"""

import argparse
import os
from pathlib import Path

from gradio_client import Client
from PIL import Image

STYLE = (
    "casual mobile puzzle game asset, glossy stylized 3d render, soft studio lighting, "
    "centered, single object, isolated on a plain pure white background, no text"
)
CUBE = (
    "front view of a single square candy-like game tile with rounded corners, viewed straight on, "
    "flat face filling the frame, thick glossy {color} plastic with a bevelled rim, "
    "a raised embossed {symbol} emblem in the middle"
)
PROMPTS = {
    "cube0": CUBE.format(color="cherry red", symbol="red heart"),
    "cube1": CUBE.format(color="solid deep royal blue", symbol="light blue diamond gem"),
    "cube2": CUBE.format(color="emerald green", symbol="green leaf"),
    "cube3": CUBE.format(color="bright saturated golden yellow", symbol="orange-yellow five-pointed star"),
    "cube4": CUBE.format(color="solid deep violet purple", symbol="light purple crescent moon"),
    "box": "front view of a light wooden crate square tile, pale planks with one diagonal brace, "
           "small nails, viewed straight on, square",
    "box2": "front view of a reinforced dark wooden crate square tile, iron metal frame on all edges with rivets, "
            "viewed straight on, square",
    "rocket": "side view of a cartoon toy rocket pointing right, horizontal, red and white stripes, "
              "yellow nose cone, red fins",
    "bomb": "round black cartoon bomb with a short fuse on top and a yellow spark, shiny highlight",
    "disco": "shiny rainbow disco ball made of small colourful mirror tiles, perfect sphere",
    "hammer": "cartoon toy hammer, red head with yellow bands, wooden handle, tilted diagonally",
    "shuffle": "circular arrows shuffle icon, two curved arrows forming a ring, gradient from pink to blue, "
               "glossy plastic",
}
BG = (
    "soft dreamy background for a mobile puzzle game, pastel purple and blue sky with fluffy clouds "
    "and faint sparkles, gentle gradient, blurry, no objects, no text, vertical"
)

SPACES = {
    "flux": "black-forest-labs/FLUX.1-schnell",
    "qwen": "Qwen/Qwen-Image",
}


def render(client, model, prompt, seed, portrait):
    if model == "flux":
        w, h = (768, 1344) if portrait else (1024, 1024)
        result = client.predict(prompt, seed, False, w, h, 4, api_name="/infer")
    else:
        ratio = "9:16" if portrait else "1:1"
        result = client.predict(prompt, seed, False, ratio, 4.0, 30, False, api_name="/infer")
    image = result[0]
    return image if isinstance(image, str) else image["path"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("raw")
    parser.add_argument("names", nargs="*")
    parser.add_argument("--model", choices=SPACES, default="flux")
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    raw = Path(args.raw)
    raw.mkdir(parents=True, exist_ok=True)
    client = Client(SPACES[args.model], token=os.environ["HF_TOKEN"], verbose=False)
    jobs = {name: f"{prompt}, {STYLE}" for name, prompt in PROMPTS.items()}
    jobs["bg"] = BG
    for name in args.names or jobs:
        path = render(client, args.model, jobs[name], args.seed, portrait=name == "bg")
        Image.open(path).convert("RGB").save(raw / f"{name}.png")
        print(f"wrote {raw / name}.png")


if __name__ == "__main__":
    main()
