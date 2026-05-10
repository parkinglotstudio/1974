import json

def open_mouth():
    path = 'c:/1974/assets/pixelart/111.json'
    # Use utf-8-sig to handle the BOM
    with open(path, 'r', encoding='utf-8-sig') as f:
        data = json.load(f)
    
    # Take the first frame
    base_frame = data['frames'][0]
    
    # Mouth is roughly at y=84, x=60-85
    shift = 4
    mouth_y = 84
    mouth_x_start = 55
    mouth_x_end = 95
    
    pixels = base_frame['pixels']
    frame2_pixels = []
    
    for px, py, col in pixels:
        # If it's part of the jaw (below mouth and in mouth x range)
        if py > mouth_y and mouth_x_start <= px <= mouth_x_end:
            frame2_pixels.append([px, py + shift, col])
        else:
            frame2_pixels.append([px, py, col])
            
    # Fill the mouth gap with black
    for y in range(mouth_y + 1, mouth_y + shift + 1):
        for x in range(mouth_x_start + 5, mouth_x_end - 5):
            frame2_pixels.append([x, y, "#000000"])
            
    # Add Frame 2 to the data
    if len(data['frames']) > 1:
        data['frames'][1] = {"pixels": frame2_pixels}
    else:
        data['frames'].append({"pixels": frame2_pixels})
        
    data['fps'] = 6
    
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f)
    print("Mouth opened and saved to Frame 2!")

if __name__ == "__main__":
    open_mouth()
