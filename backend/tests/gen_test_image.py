"""Generate a JPEG base64 image containing real study notes for Gemini OCR tests."""
import base64
import io
from PIL import Image, ImageDraw, ImageFont


def make_notes_image_b64() -> str:
    W, H = 900, 1200
    img = Image.new("RGB", (W, H), (252, 249, 240))
    d = ImageDraw.Draw(img)
    # try a bundled font
    try:
        title_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 34)
        body_font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
    except Exception:
        title_font = ImageFont.load_default()
        body_font = ImageFont.load_default()

    d.text((40, 30), "Physics — Chapter 4: Newton's Laws of Motion", fill=(20, 20, 60), font=title_font)
    lines = [
        "Definition:",
        "Newton's First Law (Inertia): A body remains at rest, or moves in a",
        "straight line at constant velocity, unless acted upon by a net external force.",
        "",
        "Newton's Second Law: F = m * a",
        "  - F is the net force in newtons (N)",
        "  - m is the mass in kilograms (kg)",
        "  - a is the acceleration in m/s^2",
        "",
        "Newton's Third Law: For every action there is an equal and opposite reaction.",
        "",
        "Worked example:",
        "A 5 kg block is pushed with a horizontal force of 20 N on a frictionless",
        "surface. Find its acceleration.",
        "Solution: a = F / m = 20 / 5 = 4 m/s^2.",
        "",
        "Key formulas to remember:",
        "  Weight W = m * g, where g = 9.81 m/s^2 on Earth",
        "  Momentum p = m * v",
        "  Impulse J = F * dt = delta p",
        "",
        "Common student mistakes:",
        "  - Confusing mass (kg) with weight (N).",
        "  - Forgetting to add friction force in the net force.",
    ]
    y = 100
    for ln in lines:
        d.text((40, y), ln, fill=(15, 15, 30), font=body_font)
        y += 34

    # Add some visual features (edges/shadows) so image isn't uniform
    d.rectangle([20, 20, W - 20, H - 20], outline=(80, 80, 120), width=3)
    d.line([(40, 80), (W - 40, 80)], fill=(150, 30, 30), width=2)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=88)
    return base64.b64encode(buf.getvalue()).decode()


if __name__ == "__main__":
    b64 = make_notes_image_b64()
    print(f"len={len(b64)}")
