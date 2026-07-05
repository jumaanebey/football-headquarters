import sys
from PIL import Image

def main():
    if len(sys.argv) < 3 or len(sys.argv) > 4:
        print("Usage: python3 remove_background.py <path> <width> [height]")
        sys.exit(1)
        
    path = sys.argv[1]
    width = int(sys.argv[2])
    height = int(sys.argv[3]) if len(sys.argv) == 4 else width
    
    img = Image.open(path).convert("RGBA")
    
    # Resize
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    
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
