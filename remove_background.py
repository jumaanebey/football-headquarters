import sys
from PIL import Image

def main():
    if len(sys.argv) != 3:
        print("Usage: python3 remove_background.py <path> <canvasSize>")
        sys.exit(1)
        
    path = sys.argv[1]
    canvas_size = int(sys.argv[2])
    
    img = Image.open(path).convert("RGBA")
    
    # Resize
    img = img.resize((canvas_size, canvas_size), Image.Resampling.LANCZOS)
    
    pixels = img.load()
    width, height = img.size
    
    target_color = (0, 208, 0)
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            # Chroma-green is 0, 208, 0 (#00d000)
            if g > 150 and r < 80 and b < 80:
                pixels[x, y] = (0, 0, 0, 0)
                
    img.save(path)

if __name__ == "__main__":
    main()
