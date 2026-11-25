# Loudness percebida (BS.1770, janela de 400 ms, máximo "momentâneo") de cada arquivo, já com o volume usado no jogo.
# Requer numpy e ffmpeg. Uso: python3 tools/lufs.py assets/audio hit1.wav:<volume do mix> point.mp3:<volume> ...
import sys, subprocess, numpy as np
SR = 48000
def load(p):
    raw = subprocess.run(['ffmpeg','-v','error','-i',p,'-ac','1','-ar',str(SR),'-f','f32le','-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).astype(np.float64)
def biquad(x, b, a):
    y = np.zeros_like(x); x1=x2=y1=y2=0.0
    for i in range(len(x)):
        v = b[0]*x[i] + b[1]*x1 + b[2]*x2 - a[1]*y1 - a[2]*y2
        x2, x1, y2, y1 = x1, x[i], y1, v; y[i] = v
    return y
def kweight(x):
    x = biquad(x, [1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585])
    return biquad(x, [1.0, -2.0, 1.0], [1, -1.99004745483398, 0.99007225036621])
def lufs_m(x):
    k = kweight(np.concatenate([x, np.zeros(SR // 2)]))
    w = int(0.4 * SR); c = np.concatenate([[0], np.cumsum(k * k)])
    ms = (c[w:] - c[:-w]) / w
    return -0.691 + 10 * np.log10(ms.max() + 1e-12)
if __name__ == '__main__':
    d = sys.argv[1]
    for spec in sys.argv[2:]:
        name, vol = spec.split(':'); vol = float(vol)
        x = load(f'{d}/{name}')
        print(f'{name:16s} vol={vol:4.2f}  pico={20*np.log10(np.abs(x).max()*vol):6.1f} dB  loudness={lufs_m(x) + 20*np.log10(vol):6.1f} LUFS')
