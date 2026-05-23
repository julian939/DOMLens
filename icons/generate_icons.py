"""Generates the DOMLens retro magnifying glass icon at all required Chrome extension sizes.

Run: python3 icons/generate_icons.py
Output: icons/icon16.png, icon32.png, icon48.png, icon128.png
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

OUT_DIR = Path(__file__).parent
SIZES = (16, 32, 48, 128)
MASTER = 512  # render large, then downscale for crisp anti-aliasing


def lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def radial_disk(size: int, center: tuple[float, float], radius: float,
                inner_color: tuple[int, int, int], outer_color: tuple[int, int, int],
                alpha: int = 255) -> Image.Image:
    """Return an RGBA disk with a radial gradient from inner_color to outer_color."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    px = img.load()
    cx, cy = center
    r2 = radius * radius
    for y in range(size):
        for x in range(size):
            dx = x - cx
            dy = y - cy
            d2 = dx * dx + dy * dy
            if d2 > r2:
                continue
            t = math.sqrt(d2) / radius
            c = lerp(inner_color, outer_color, t)
            px[x, y] = (c[0], c[1], c[2], alpha)
    return img


def draw_retro_magnifier(size: int) -> Image.Image:
    """Draw a retro brass + wood magnifying glass on transparent background."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    # Geometry — lens in upper-left, handle pointing to lower-right.
    s = size
    lens_cx = s * 0.40
    lens_cy = s * 0.40
    lens_r_outer = s * 0.30
    ring_thick = s * 0.055
    lens_r_inner = lens_r_outer - ring_thick

    # Handle along 45° axis from lens edge to lower-right corner.
    angle = math.radians(45)
    ux, uy = math.cos(angle), math.sin(angle)
    handle_start = (lens_cx + ux * (lens_r_outer - ring_thick * 0.3),
                    lens_cy + uy * (lens_r_outer - ring_thick * 0.3))
    handle_end = (s * 0.93, s * 0.93)
    handle_half = s * 0.07  # half-width of handle

    # Perpendicular vector for handle thickness.
    px_, py_ = -uy, ux

    # --- 1) Soft drop shadow ----------------------------------------------------
    shadow_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_layer)
    sd.ellipse(
        (lens_cx - lens_r_outer + s * 0.025, lens_cy - lens_r_outer + s * 0.035,
         lens_cx + lens_r_outer + s * 0.025, lens_cy + lens_r_outer + s * 0.035),
        fill=(20, 12, 4, 90),
    )
    handle_shadow_pts = [
        (handle_start[0] + px_ * handle_half + s * 0.025, handle_start[1] + py_ * handle_half + s * 0.035),
        (handle_end[0] + px_ * handle_half + s * 0.025, handle_end[1] + py_ * handle_half + s * 0.035),
        (handle_end[0] - px_ * handle_half + s * 0.025, handle_end[1] - py_ * handle_half + s * 0.035),
        (handle_start[0] - px_ * handle_half + s * 0.025, handle_start[1] - py_ * handle_half + s * 0.035),
    ]
    sd.polygon(handle_shadow_pts, fill=(20, 12, 4, 90))
    blur_radius = max(1, int(s * 0.012))
    shadow_layer = shadow_layer.filter(ImageFilter.GaussianBlur(blur_radius))
    img.alpha_composite(shadow_layer)

    # --- 2) Wooden handle -------------------------------------------------------
    # Base wood color — warm walnut.
    wood_dark = (62, 32, 14)
    wood_mid = (118, 64, 28)
    wood_light = (176, 110, 58)

    # Render the handle by stepping along its length and drawing colored bands
    # to fake a cylindrical highlight + subtle wood grain.
    handle_length = math.hypot(handle_end[0] - handle_start[0], handle_end[1] - handle_start[1])
    steps = max(40, int(handle_length))
    for i in range(steps):
        t = i / steps
        cx = handle_start[0] + (handle_end[0] - handle_start[0]) * t
        cy = handle_start[1] + (handle_end[1] - handle_start[1]) * t
        # Draw a perpendicular line across the handle width, gradient-colored.
        cross_steps = max(20, int(handle_half * 2))
        for j in range(cross_steps + 1):
            u = j / cross_steps  # 0..1 across width
            # Cylindrical shading: brightest near middle, darker at edges.
            shade = 1.0 - abs(u - 0.5) * 2.0
            shade = max(0.0, shade)
            if shade < 0.4:
                color = lerp(wood_dark, wood_mid, shade / 0.4)
            else:
                color = lerp(wood_mid, wood_light, (shade - 0.4) / 0.6)
            # Subtle longitudinal grain — slight darken at certain positions.
            grain = math.sin(t * 14.0 + u * 1.3) * 0.06
            color = tuple(max(0, min(255, int(c * (1.0 + grain)))) for c in color)
            offset = (u - 0.5) * 2.0 * handle_half
            x = cx + px_ * offset
            y = cy + py_ * offset
            d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(color[0], color[1], color[2], 255))

    # Rounded handle cap at the far end.
    cap_r = handle_half * 0.95
    d.ellipse(
        (handle_end[0] - cap_r, handle_end[1] - cap_r,
         handle_end[0] + cap_r, handle_end[1] + cap_r),
        fill=(wood_dark[0], wood_dark[1], wood_dark[2], 255),
    )
    cap_hi_r = cap_r * 0.55
    cap_hi_cx = handle_end[0] - cap_r * 0.25
    cap_hi_cy = handle_end[1] - cap_r * 0.25
    d.ellipse(
        (cap_hi_cx - cap_hi_r, cap_hi_cy - cap_hi_r,
         cap_hi_cx + cap_hi_r, cap_hi_cy + cap_hi_r),
        fill=(wood_light[0], wood_light[1], wood_light[2], 110),
    )

    # --- 3) Brass ferrule (band) where handle meets lens ------------------------
    brass_dark = (120, 78, 18)
    brass_mid = (212, 162, 52)
    brass_light = (255, 232, 150)
    ferrule_len = s * 0.10
    ferrule_center_t = 0.0
    fc_x = handle_start[0] + ux * (ferrule_len * 0.5)
    fc_y = handle_start[1] + uy * (ferrule_len * 0.5)
    ferrule_steps = max(20, int(ferrule_len))
    for i in range(ferrule_steps):
        t = i / ferrule_steps
        cx = handle_start[0] + ux * (t * ferrule_len)
        cy = handle_start[1] + uy * (t * ferrule_len)
        cross_steps = max(20, int(handle_half * 2.2))
        for j in range(cross_steps + 1):
            u = j / cross_steps
            shade = 1.0 - abs(u - 0.5) * 2.0
            if shade < 0.45:
                color = lerp(brass_dark, brass_mid, shade / 0.45)
            else:
                color = lerp(brass_mid, brass_light, (shade - 0.45) / 0.55)
            offset = (u - 0.5) * 2.0 * (handle_half * 1.08)
            x = cx + px_ * offset
            y = cy + py_ * offset
            d.ellipse((x - 1, y - 1, x + 1, y + 1), fill=(color[0], color[1], color[2], 255))

    # --- 4) Lens ring (brass, with inner/outer rim shading) ---------------------
    # Outer rim shadow.
    d.ellipse(
        (lens_cx - lens_r_outer, lens_cy - lens_r_outer,
         lens_cx + lens_r_outer, lens_cy + lens_r_outer),
        fill=(60, 36, 8, 255),
    )
    # Main brass ring — drawn as a slightly smaller filled disk over the shadow,
    # then we'll punch the lens interior on top.
    ring_outer = lens_r_outer - s * 0.005
    ring_inner = lens_r_inner

    # Render the brass ring with an angular highlight (top-left lighter).
    ring_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    rl = ring_layer.load()
    for y in range(s):
        for x in range(s):
            dx = x - lens_cx
            dy = y - lens_cy
            dist = math.hypot(dx, dy)
            if dist > ring_outer or dist < ring_inner:
                continue
            # Angle 0 = up-left (light source), brighter; opposite = darker.
            ang = math.atan2(dy, dx)
            # Light from upper-left → angle ≈ -3π/4.
            light_ang = -3 * math.pi / 4
            diff = abs(((ang - light_ang + math.pi) % (2 * math.pi)) - math.pi)
            # diff: 0 = aligned with light, π = opposite.
            t = 1.0 - (diff / math.pi)  # 1 at light, 0 opposite
            t = t ** 1.2
            # Cross-section shading (depth) — middle of ring brighter than edges.
            rt = (dist - ring_inner) / max(1e-6, (ring_outer - ring_inner))
            depth = 1.0 - abs(rt - 0.5) * 2.0
            depth = max(0.0, depth)
            shade = 0.35 * depth + 0.65 * t
            if shade < 0.5:
                color = lerp(brass_dark, brass_mid, shade / 0.5)
            else:
                color = lerp(brass_mid, brass_light, (shade - 0.5) / 0.5)
            rl[x, y] = (color[0], color[1], color[2], 255)
    img.alpha_composite(ring_layer)

    # Inner thin dark line around glass (jewelry-style detail).
    d.ellipse(
        (lens_cx - ring_inner, lens_cy - ring_inner,
         lens_cx + ring_inner, lens_cy + ring_inner),
        outline=(50, 28, 6, 255),
        width=max(1, int(s * 0.008)),
    )

    # --- 5) Glass interior ------------------------------------------------------
    glass_r = ring_inner - s * 0.012
    # Subtle tinted glass — pale blue-cyan radial gradient, slightly translucent
    # so it reads as glass.
    glass_layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    gl = glass_layer.load()
    glass_inner = (238, 248, 255)
    glass_outer = (170, 198, 220)
    for y in range(s):
        for x in range(s):
            dx = x - lens_cx
            dy = y - lens_cy
            dist = math.hypot(dx, dy)
            if dist > glass_r:
                continue
            t = dist / glass_r
            c = lerp(glass_inner, glass_outer, t * 0.9)
            # Slight translucency feel.
            alpha = 235
            gl[x, y] = (c[0], c[1], c[2], alpha)
    img.alpha_composite(glass_layer)

    # Specular highlight — a soft crescent in the upper-left of the glass.
    spec = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    sd2 = ImageDraw.Draw(spec)
    spec_cx = lens_cx - glass_r * 0.30
    spec_cy = lens_cy - glass_r * 0.32
    spec_rx = glass_r * 0.55
    spec_ry = glass_r * 0.32
    sd2.ellipse(
        (spec_cx - spec_rx, spec_cy - spec_ry,
         spec_cx + spec_rx, spec_cy + spec_ry),
        fill=(255, 255, 255, 200),
    )
    # Mask the highlight to the lens circle.
    mask = Image.new("L", (s, s), 0)
    md = ImageDraw.Draw(mask)
    md.ellipse(
        (lens_cx - glass_r, lens_cy - glass_r,
         lens_cx + glass_r, lens_cy + glass_r),
        fill=255,
    )
    spec.putalpha(Image.eval(spec.getchannel("A"), lambda a: a).point(lambda a: a))
    spec_blur = spec.filter(ImageFilter.GaussianBlur(max(1, int(s * 0.015))))
    spec_blur.putalpha(Image.eval(spec_blur.getchannel("A"), lambda a: a))
    # Apply mask.
    r, g, b, a = spec_blur.split()
    a = Image.eval(a, lambda v: v)
    masked_alpha = Image.new("L", (s, s), 0)
    masked_alpha.paste(a, (0, 0), mask)
    spec_blur = Image.merge("RGBA", (r, g, b, masked_alpha))
    img.alpha_composite(spec_blur)

    # Small bright pin-highlight at the brightest point of the spec.
    pin_r = glass_r * 0.08
    pin_cx = lens_cx - glass_r * 0.45
    pin_cy = lens_cy - glass_r * 0.45
    d.ellipse(
        (pin_cx - pin_r, pin_cy - pin_r, pin_cx + pin_r, pin_cy + pin_r),
        fill=(255, 255, 255, 235),
    )

    return img


def build_master() -> Image.Image:
    return draw_retro_magnifier(MASTER)


def main() -> None:
    master = build_master()
    master.save(OUT_DIR / "icon-master.png")
    for sz in SIZES:
        scaled = master.resize((sz, sz), Image.LANCZOS)
        scaled.save(OUT_DIR / f"icon{sz}.png")
        print(f"wrote icon{sz}.png")


if __name__ == "__main__":
    main()
