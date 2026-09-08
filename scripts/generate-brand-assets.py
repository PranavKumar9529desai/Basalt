#!/usr/bin/env python3
"""
Basalt Brand Asset Pipeline
Generates all branding assets, app icons, favicons, banners, and SVGs
from the high-resolution source image at ~/Downloads/basalt.png.
"""

import os
import sys
import subprocess
from pathlib import Path

SOURCE_PATH = Path("/home/pranav/Downloads/basalt.png")
REPO_ROOT = Path(__file__).resolve().parent.parent
ASSETS_BRANDING = REPO_ROOT / "assets" / "branding"
TAURI_ICONS = REPO_ROOT / "apps" / "tauri" / "src-tauri" / "icons"
TAURI_PUBLIC = REPO_ROOT / "apps" / "tauri" / "public"
TAURI_SRC_ASSETS = REPO_ROOT / "apps" / "tauri" / "src" / "assets" / "branding"
SCRATCH = REPO_ROOT / "scratch"

DARK_BG = "#0d0e12"
STONE_WHITE = "#f2f4f8"

def ensure_dirs():
    for d in [ASSETS_BRANDING, TAURI_ICONS, TAURI_PUBLIC, TAURI_SRC_ASSETS, SCRATCH]:
        d.mkdir(parents=True, exist_ok=True)

def read_ppm(path):
    proc = subprocess.Popen(['magick', str(path), 'ppm:-'], stdout=subprocess.PIPE)
    proc.stdout.readline() # P6
    line = proc.stdout.readline().decode('latin1').strip()
    while line.startswith('#'):
        line = proc.stdout.readline().decode('latin1').strip()
    w, h = [int(x) for x in line.split()]
    proc.stdout.readline() # maxval
    data = proc.stdout.read()
    return w, h, data

def write_pam(w, h, rgba_bytes, out_path):
    header = f'P7\nWIDTH {w}\nHEIGHT {h}\nDEPTH 4\nMAXVAL 255\nTUPLTYPE RGB_ALPHA\nENDHDR\n'.encode('ascii')
    proc = subprocess.Popen(['magick', 'pam:-', str(out_path)], stdin=subprocess.PIPE)
    proc.stdin.write(header + rgba_bytes)
    proc.stdin.close()
    proc.wait()

def process_emblem():
    print("Processing Emblem...")
    # Crop emblem from source (Y: 130 to 890, X: 230 to 1025)
    # Centered bounding box in original image: 820x820 centered around (627, 509) -> (217, 99)
    crop_box = "820x820+217+99"
    raw_emblem = SCRATCH / "emblem_cropped_raw.png"
    subprocess.run(['magick', str(SOURCE_PATH), '-crop', crop_box, '+repage', str(raw_emblem)], check=True)
    
    # Process transparency and dark-mode adaptation
    w, h, data = read_ppm(raw_emblem)
    
    # Generate 3 variants:
    # 1. transparent: alpha calculated from lightness & orange saturation
    # 2. dark_bg: composited over #0d0e12 with glowing ember enhancement
    # 3. light_bg: clean on pure white
    
    trans_out = bytearray(w * h * 4)
    dark_out = bytearray(w * h * 4)
    
    for i in range(w * h):
        r = data[i*3]
        g = data[i*3+1]
        b = data[i*3+2]
        
        # Check for white background:
        # Near neutral and high luminance
        is_near_white = (r > 242 and g > 242 and b > 242 and abs(r - b) < 14 and abs(r - g) < 14)
        
        # Orange glow detection:
        # Red is noticeably higher than blue
        is_orange_glow = (r > 160 and r > b + 35)
        
        brightness = (r * 299 + g * 587 + b * 114) / 1000.0
        
        if is_near_white:
            # Fully transparent
            trans_out[i*4 : i*4+4] = b'\x00\x00\x00\x00'
            dark_out[i*4 : i*4+4] = bytes([13, 14, 18, 255])
        elif is_orange_glow:
            # Glowing conduit or orange reflection
            # On transparent:
            alpha = min(255, int(255 * max(0.0, (255 - b) / 180.0)))
            trans_out[i*4] = r
            trans_out[i*4+1] = g
            trans_out[i*4+2] = b
            trans_out[i*4+3] = alpha
            
            # On dark mode: vibrant magma orange glow radiating into #0d0e12
            glow_intensity = max(0.0, min(1.0, (255.0 - b) / 220.0))
            dark_r = int(13 + (r - 13) * glow_intensity)
            dark_g = int(14 + (g - 14) * glow_intensity)
            dark_b = int(18 + (b - 18) * glow_intensity * 0.4)
            dark_out[i*4] = min(255, dark_r)
            dark_out[i*4+1] = min(255, dark_g)
            dark_out[i*4+2] = min(255, dark_b)
            dark_out[i*4+3] = 255
        else:
            # Dark basalt column body
            alpha = min(255, int(255 * max(0.0, (245 - brightness) / 200.0)))
            trans_out[i*4] = r
            trans_out[i*4+1] = g
            trans_out[i*4+2] = b
            trans_out[i*4+3] = alpha
            
            dark_out[i*4] = r
            dark_out[i*4+1] = g
            dark_out[i*4+2] = b
            dark_out[i*4+3] = 255

    emblem_trans = ASSETS_BRANDING / "basalt-mark-transparent.png"
    emblem_dark = ASSETS_BRANDING / "basalt-mark-dark.png"
    emblem_light = ASSETS_BRANDING / "basalt-mark-light.png"
    
    write_pam(w, h, bytes(trans_out), emblem_trans)
    write_pam(w, h, bytes(dark_out), emblem_dark)
    subprocess.run(['magick', str(raw_emblem), str(emblem_light)], check=True)
    
    return emblem_trans, emblem_dark, emblem_light

def process_wordmark():
    print("Processing Wordmark...")
    # Crop wordmark (Y: 950 to 1085, X: 120 to 1135) -> 1015x135
    crop_box = "1015x135+120+950"
    raw_wordmark = SCRATCH / "wordmark_cropped_raw.png"
    subprocess.run(['magick', str(SOURCE_PATH), '-crop', crop_box, '+repage', str(raw_wordmark)], check=True)
    
    w, h, data = read_ppm(raw_wordmark)
    
    # 1. Dark mode wordmark: stone white #f2f4f8 letters with orange glow in first 'A'
    dark_wm = bytearray(w * h * 4)
    # 2. Light mode transparent wordmark: dark black letters with orange glow
    light_wm = bytearray(w * h * 4)
    
    for i in range(w * h):
        r = data[i*3]
        g = data[i*3+1]
        b = data[i*3+2]
        
        is_bg = (r > 240 and g > 240 and b > 240 and abs(r - b) < 14)
        is_orange = (r > 150 and r > b + 40)
        brightness = (r * 299 + g * 587 + b * 114) / 1000.0
        
        if is_bg:
            dark_wm[i*4 : i*4+4] = b'\x00\x00\x00\x00'
            light_wm[i*4 : i*4+4] = b'\x00\x00\x00\x00'
        elif is_orange:
            # Magma orange glow
            glow = max(0.0, min(1.0, (255 - b) / 180.0))
            alpha = int(255 * glow)
            
            # Dark mode: glowing orange
            dark_wm[i*4] = 255
            dark_wm[i*4+1] = int(min(255, max(85, g * 0.95)))
            dark_wm[i*4+2] = int(min(255, b * 0.2))
            dark_wm[i*4+3] = alpha
            
            # Light mode: original glowing orange
            light_wm[i*4] = r
            light_wm[i*4+1] = g
            light_wm[i*4+2] = b
            light_wm[i*4+3] = alpha
        else:
            alpha = min(255, int(255 * max(0.0, (240 - brightness) / 200.0)))
            # Dark mode: stone white
            dark_wm[i*4] = 242
            dark_wm[i*4+1] = 244
            dark_wm[i*4+2] = 248
            dark_wm[i*4+3] = alpha
            
            # Light mode: basalt black
            light_wm[i*4] = 13
            light_wm[i*4+1] = 14
            light_wm[i*4+2] = 18
            light_wm[i*4+3] = alpha
            
    wm_dark = ASSETS_BRANDING / "basalt-wordmark-dark.png"
    wm_light = ASSETS_BRANDING / "basalt-wordmark-light.png"
    write_pam(w, h, bytes(dark_wm), wm_dark)
    write_pam(w, h, bytes(light_wm), wm_light)
    
    return wm_dark, wm_light

def generate_svgs():
    print("Generating SVGs...")
    # 1. Wordmark SVG
    wordmark_svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1020 130" fill="none" role="img" aria-label="Basalt">
  <defs>
    <!-- Magma Orange ember glow inside the apex of the first 'A' -->
    <radialGradient id="basalt-magma-glow" cx="50%" cy="10%" r="90%" fx="50%" fy="10%">
      <stop offset="0%" stop-color="#ff3a00" stop-opacity="1" />
      <stop offset="35%" stop-color="#ff6a00" stop-opacity="0.9" />
      <stop offset="70%" stop-color="#ff9900" stop-opacity="0.5" />
      <stop offset="100%" stop-color="#ff7700" stop-opacity="0" />
    </radialGradient>
    <filter id="basalt-ember-blur" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <g transform="translate(0, 130) scale(0.1, -0.1)" stroke="none">
    <!-- Inner glowing ember core in the crotch of the first 'A' -->
    <path d="M2550 780 L2340 280 L2860 280 Z" fill="url(#basalt-magma-glow)" filter="url(#basalt-ember-blur)" />
    
    <!-- Letterforms (fill="currentColor" inherits active theme font color) -->
    <!-- B -->
    <path fill="currentColor" d="M125 1208 c-3 -7 -4 -260 -3 -563 l3 -550 560 0 c514 0 564 1 612 18 80 28 127 68 159 134 25 49 29 72 32 161 3 65 0 120 -9 149 -15 54 -67 111 -110 120 -26 5 -42 23 -20 23 20 0 75 56 92 95 24 53 26 208 3 263 -33 81 -109 134 -215 152 -98 15 -1098 14 -1104 -2z m971 -269 c29 -32 26 -105 -5 -130 -22 -18 -43 -19 -317 -19 l-294 0 0 85 0 85 298 0 c291 0 299 -1 318 -21z m4 -399 c27 -15 43 -81 31 -126 -18 -64 -14 -63 -348 -64 l-303 0 0 100 0 100 301 0 c184 0 308 -4 319 -10z"/>
    <!-- First 'A' (stylized inverted chevron) -->
    <path fill="currentColor" d="M2488 1198 c-24 -37 -410 -674 -545 -898 l-123 -205 189 -3 c266 -4 261 -6 369 163 132 208 224 365 232 399 11 43 49 126 59 126 4 0 18 -31 30 -69 15 -46 75 -154 181 -327 194 -315 162 -294 438 -294 100 0 182 2 182 5 0 2 -47 84 -105 182 -58 98 -205 349 -328 558 l-223 380 -171 3 c-168 2 -171 2 -185 -20z"/>
    <!-- S -->
    <path fill="currentColor" d="M4250 1219 c-170 -6 -225 -24 -288 -93 -57 -62 -76 -128 -76 -261 0 -137 16 -188 80 -243 78 -70 117 -76 526 -82 355 -5 358 -5 380 -28 33 -32 33 -122 0 -154 -22 -23 -27 -23 -294 -26 -315 -3 -323 -2 -339 64 l-11 44 -170 0 -170 0 4 -83 c4 -101 32 -165 91 -208 81 -59 106 -62 515 -67 236 -2 404 0 455 7 113 15 195 56 236 118 45 67 55 113 55 243 -1 136 -22 200 -85 254 -76 65 -103 69 -512 76 -362 6 -368 6 -390 28 -32 32 -31 112 1 144 22 23 28 23 276 26 295 4 320 -1 332 -62 l6 -36 170 0 171 0 -5 70 c-10 133 -77 222 -192 255 -57 16 -510 24 -766 14z"/>
    <!-- Second 'A' (unbarred chevron matching first 'A') -->
    <path fill="currentColor" d="M6192 1193 c-27 -40 -414 -694 -615 -1040 l-36 -63 188 0 189 0 148 248 c81 136 181 304 223 374 41 70 77 125 80 122 3 -2 100 -170 217 -372 l212 -367 186 -3 c102 -1 186 1 186 6 0 7 -302 536 -562 985 l-80 137 -158 0 -159 0 -19 -27z"/>
    <!-- L -->
    <path fill="currentColor" d="M7560 655 l0 -565 548 2 547 3 0 130 0 130 -372 3 -373 2 0 430 0 430 -175 0 -175 0 0 -565z"/>
    <!-- T -->
    <path fill="currentColor" d="M8800 1085 l0 -135 230 0 230 0 0 -430 0 -430 180 0 180 0 0 430 0 430 230 0 230 0 0 135 0 135 -640 0 -640 0 0 -135z"/>
  </g>
</svg>
"""
    (ASSETS_BRANDING / "basalt-wordmark.svg").write_text(wordmark_svg_content)
    (TAURI_SRC_ASSETS / "basalt-wordmark.svg").write_text(wordmark_svg_content)

    # 2. Vector Emblem SVG (clean geometric representation)
    emblem_svg_content = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" fill="none" role="img" aria-label="Basalt Emblem">
  <defs>
    <!-- Molten Magma Conduits Gradient -->
    <linearGradient id="conduit-top-right" x1="100" y1="45" x2="155" y2="85" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ff3a00" />
      <stop offset="50%" stop-color="#ff7700" />
      <stop offset="100%" stop-color="#ffaa00" />
    </linearGradient>
    <linearGradient id="conduit-right-bottom" x1="155" y1="85" x2="120" y2="140" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#ffaa00" />
      <stop offset="50%" stop-color="#ff7700" />
      <stop offset="100%" stop-color="#ff3a00" />
    </linearGradient>
    <!-- Glow filter -->
    <filter id="magma-glow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur stdDeviation="4" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Magma connectors glow underlayer -->
  <line x1="100" y1="45" x2="155" y2="85" stroke="#ff5500" stroke-width="8" stroke-linecap="round" opacity="0.6" filter="url(#magma-glow)" />
  <line x1="155" y1="85" x2="120" y2="140" stroke="#ff5500" stroke-width="8" stroke-linecap="round" opacity="0.6" filter="url(#magma-glow)" />

  <!-- Dark graphite connectors -->
  <line x1="100" y1="45" x2="62" y2="100" stroke="#232530" stroke-width="5" stroke-linecap="round" />
  <line x1="62" y1="100" x2="120" y2="140" stroke="#232530" stroke-width="5" stroke-linecap="round" />

  <!-- Glowing orange rods -->
  <line x1="100" y1="45" x2="155" y2="85" stroke="url(#conduit-top-right)" stroke-width="4.5" stroke-linecap="round" />
  <line x1="155" y1="85" x2="120" y2="140" stroke="url(#conduit-right-bottom)" stroke-width="4.5" stroke-linecap="round" />

  <!-- 1. Top Hexagonal Basalt Column -->
  <g transform="translate(100, 45)">
    <!-- Facets -->
    <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="#1b1c22" stroke="#2e313d" stroke-width="1.2" />
    <polygon points="0,0 19,-11 19,11 0,22" fill="#262833" />
    <polygon points="0,0 0,22 -19,11 -19,-11" fill="#131418" />
    <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#323544" />
    <!-- Magma reflection on right edge -->
    <line x1="0" y1="22" x2="19" y2="11" stroke="#ff6a00" stroke-width="1.5" opacity="0.8" />
  </g>

  <!-- 2. Left Large Basalt Column -->
  <g transform="translate(62, 100) scale(1.4)">
    <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="#1b1c22" stroke="#2e313d" stroke-width="1" />
    <polygon points="0,0 19,-11 19,11 0,22" fill="#252732" />
    <polygon points="0,0 0,22 -19,11 -19,-11" fill="#111216" />
    <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#2d2f3d" />
  </g>

  <!-- 3. Right Basalt Column -->
  <g transform="translate(155, 85)">
    <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="#1b1c22" stroke="#2e313d" stroke-width="1.2" />
    <polygon points="0,0 19,-11 19,11 0,22" fill="#262833" />
    <polygon points="0,0 0,22 -19,11 -19,-11" fill="#14151a" />
    <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#333646" />
    <!-- Magma reflection -->
    <line x1="-19" y1="-11" x2="0" y2="0" stroke="#ff6a00" stroke-width="1.5" opacity="0.9" />
    <line x1="0" y1="0" x2="-19" y2="11" stroke="#ff6a00" stroke-width="1.5" opacity="0.9" />
  </g>

  <!-- 4. Bottom Basalt Column -->
  <g transform="translate(120, 140)">
    <polygon points="0,-22 19,-11 19,11 0,22 -19,11 -19,-11" fill="#1b1c22" stroke="#2e313d" stroke-width="1.2" />
    <polygon points="0,0 19,-11 19,11 0,22" fill="#252732" />
    <polygon points="0,0 0,22 -19,11 -19,-11" fill="#121317" />
    <polygon points="0,0 -19,-11 0,-22 19,-11" fill="#303240" />
    <!-- Magma reflection on top-right facet -->
    <line x1="0" y1="-22" x2="19" y2="-11" stroke="#ff6a00" stroke-width="1.5" opacity="0.9" />
  </g>
</svg>
"""
    (ASSETS_BRANDING / "basalt-mark.svg").write_text(emblem_svg_content)
    (TAURI_SRC_ASSETS / "basalt-mark.svg").write_text(emblem_svg_content)
    (TAURI_PUBLIC / "favicon.svg").write_text(emblem_svg_content)

def generate_lockups(emblem_dark, wm_dark, emblem_light, wm_light):
    print("Generating Lockups & Banners...")
    
    # 1. Vertical Full Logo Dark (1024x1024)
    logo_dark = ASSETS_BRANDING / "basalt-logo-dark.png"
    # Composite emblem + wordmark onto #0d0e12 background
    cmd = [
        'magick', '-size', '1024x1024', f'xc:{DARK_BG}',
        str(emblem_dark), '-geometry', '680x680+172+60', '-composite',
        str(wm_dark), '-geometry', '800x106+112+780', '-composite',
        str(logo_dark)
    ]
    subprocess.run(cmd, check=True)

    # 2. Vertical Full Logo Light (1024x1024)
    logo_light = ASSETS_BRANDING / "basalt-logo-light.png"
    cmd = [
        'magick', '-size', '1024x1024', 'xc:#ffffff',
        str(emblem_light), '-geometry', '680x680+172+60', '-composite',
        str(wm_light), '-geometry', '800x106+112+780', '-composite',
        str(logo_light)
    ]
    subprocess.run(cmd, check=True)

    # 3. Transparent Full Logo (1024x1024)
    logo_trans = ASSETS_BRANDING / "basalt-logo-transparent.png"
    cmd = [
        'magick', '-size', '1024x1024', 'xc:none',
        str(emblem_dark), '-geometry', '680x680+172+60', '-composite',
        str(wm_dark), '-geometry', '800x106+112+780', '-composite',
        str(logo_trans)
    ]
    subprocess.run(cmd, check=True)

    # 4. Horizontal Lockup Dark (1200x400)
    logo_h_dark = ASSETS_BRANDING / "basalt-logo-horizontal-dark.png"
    cmd = [
        'magick', '-size', '1200x400', f'xc:{DARK_BG}',
        str(emblem_dark), '-geometry', '320x320+60+40', '-composite',
        str(wm_dark), '-geometry', '680x90+440+155', '-composite',
        str(logo_h_dark)
    ]
    subprocess.run(cmd, check=True)

    # 5. Social & README Banner (1280x640)
    banner = ASSETS_BRANDING / "basalt-banner.png"
    cmd = [
        'magick', '-size', '1280x640', f'xc:{DARK_BG}',
        str(emblem_dark), '-geometry', '440x440+420+40', '-composite',
        str(wm_dark), '-geometry', '760x100+260+490', '-composite',
        str(banner)
    ]
    subprocess.run(cmd, check=True)

def generate_icons(emblem_dark):
    print("Generating Desktop & Web Icons...")
    # Master icon: 512x512
    icon_512 = TAURI_ICONS / "icon.png"
    subprocess.run(['magick', str(emblem_dark), '-resize', '512x512', str(icon_512)], check=True)
    
    # 128x128 and 128x128@2x (256x256)
    subprocess.run(['magick', str(emblem_dark), '-resize', '128x128', str(TAURI_ICONS / "128x128.png")], check=True)
    subprocess.run(['magick', str(emblem_dark), '-resize', '256x256', str(TAURI_ICONS / "128x128@2x.png")], check=True)
    subprocess.run(['magick', str(emblem_dark), '-resize', '32x32', str(TAURI_ICONS / "32x32.png")], check=True)

    # Windows Store tiles:
    tiles = {
        "Square30x30Logo.png": "30x30",
        "Square44x44Logo.png": "44x44",
        "Square71x71Logo.png": "71x71",
        "Square89x89Logo.png": "89x89",
        "Square107x107Logo.png": "107x107",
        "Square142x142Logo.png": "142x142",
        "Square150x150Logo.png": "150x150",
        "Square284x284Logo.png": "284x284",
        "Square310x310Logo.png": "310x310",
        "StoreLogo.png": "50x50"
    }
    for name, size in tiles.items():
        subprocess.run(['magick', str(emblem_dark), '-resize', size, str(TAURI_ICONS / name)], check=True)

    # Multi-resolution ICO (16, 24, 32, 48, 64, 128, 256)
    ico_path = TAURI_ICONS / "icon.ico"
    subprocess.run([
        'magick', str(emblem_dark),
        '-define', 'icon:auto-resize=256,128,64,48,32,24,16',
        str(ico_path)
    ], check=True)

    # ICNS for macOS:
    icns_path = TAURI_ICONS / "icon.icns"
    if subprocess.run(['which', 'png2icns'], capture_output=True).returncode == 0:
        subprocess.run(['png2icns', str(icns_path), str(icon_512)], check=True)
    else:
        subprocess.run(['magick', str(icon_512), str(icns_path)], check=True)

    # Web public favicons:
    subprocess.run(['magick', str(emblem_dark), '-resize', '32x32', str(TAURI_PUBLIC / "favicon.png")], check=True)
    subprocess.run(['magick', str(emblem_dark), '-resize', '180x180', str(TAURI_PUBLIC / "apple-touch-icon.png")], check=True)
    subprocess.run(['cp', str(ico_path), str(TAURI_PUBLIC / "favicon.ico")], check=True)

def copy_to_surfaces():
    print("Copying key assets to app and branding directories...")
    for f in ASSETS_BRANDING.glob("*.*"):
        subprocess.run(['cp', str(f), str(TAURI_SRC_ASSETS / f.name)], check=True)

def main():
    ensure_dirs()
    if not SOURCE_PATH.exists():
        print(f"Error: source not found at {SOURCE_PATH}")
        sys.exit(1)
        
    print(f"Master source found: {SOURCE_PATH}")
    emblem_trans, emblem_dark, emblem_light = process_emblem()
    wm_dark, wm_light = process_wordmark()
    generate_svgs()
    generate_lockups(emblem_dark, wm_dark, emblem_light, wm_light)
    generate_icons(emblem_dark)
    copy_to_surfaces()
    print("All branding assets generated successfully!")

if __name__ == "__main__":
    main()
