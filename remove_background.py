import sys
from PIL import Image

def main():
    if len(sys.argv) < 3 or len(sys.argv) > 5:
        print("Usage: python3 remove_background.py <path> <width> [height] [tolerance]")
        sys.exit(1)
        
    path = sys.argv[1]
    width = int(sys.argv[2])
    
    # Check if arg 3 is height or tolerance
    height = width
    tolerance = 0
    if len(sys.argv) >= 4:
        # If it's the last arg and is 'wide', it's tolerance. But let's just assume height is always passed if there's 4 args.
        height = int(sys.argv[3])
    if len(sys.argv) == 5:
        tolerance = int(sys.argv[4])
    
    img = Image.open(path).convert("RGBA")
    
    # Resize
    img = img.resize((width, height), Image.Resampling.LANCZOS)
    
    pixels = img.load()
    width, height = img.size
    
    for y in range(height):
        for x in range(width):
            r, g, b, a = pixels[x, y]
            if tolerance == 1:
                # Wider tolerance for fringe removal
                if g > 100 and r < 130 and b < 130 and g > r + 10 and g > b + 10:
                    pixels[x, y] = (0, 0, 0, 0)
            else:
                # Original tolerance
                if g > 150 and r < 80 and b < 80:
                    pixels[x, y] = (0, 0, 0, 0)
                
    img.save(path)

if __name__ == "__main__":
    main()
