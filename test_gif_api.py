from PIL import Image
import io, base64, json, urllib.request

# 4x4 2프레임 RGBA GIF
frames = []
for i in range(2):
    color = (255, 0, 0, 255) if i == 0 else (0, 0, 255, 255)
    f = Image.new('RGBA', (4, 4), color)
    frames.append(f)

buf = io.BytesIO()
frames[0].save(buf, format='GIF', save_all=True,
               append_images=frames[1:], duration=100, loop=0)
b64 = base64.b64encode(buf.getvalue()).decode()

data = json.dumps({'gifBase64': b64, 'scale': 100, 'name': 'test'}).encode()
req = urllib.request.Request(
    'http://localhost:9191/api/convert-gif',
    data=data,
    headers={'Content-Type': 'application/json'},
    method='POST'
)
result = json.loads(urllib.request.urlopen(req).read())
print('ok     :', result['ok'])
print('frames :', result['frameCount'])
print('size   :', result['width'], 'x', result['height'])
print('palette:', len(result['palette']) - 1, 'colors')
print('delay  :', result['frames'][0]['delay'], 'ms')
print('pixels0:', len(result['frames'][0]['pixels']), 'px')
