"""Two isolated copies of the pinned native core, driven through libretro.

JSON lines on stdin: {"frames":120,"a":0,"b":0}, {"link":true},
{"save":"a"}, {"import":"a","path":"..."}. Screenshots are local PNGs.
This exercises the core API directly; it does not automate desktop windows.
"""
import ctypes as C
import hashlib
import json
from pathlib import Path
import shutil
import sys
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / '.local/native-core-lab'
OUT.mkdir(parents=True, exist_ok=True)
ROM = ROOT / 'pokemon emerald/PokemonQuetzalEnglishAlpha8v4.gba'
DLL = ROOT / '.local/tools/gpsp-native/gpsp_libretro.dll'
if hashlib.sha256(DLL.read_bytes()).hexdigest() != '23722e00dc5e008125cc2a3a07ad5c9508d1d434bec463c63a98bca198b87bc6':
    raise RuntimeError('Native core hash changed')
ENV = C.CFUNCTYPE(C.c_bool, C.c_uint, C.c_void_p)
VIDEO = C.CFUNCTYPE(None, C.c_void_p, C.c_uint, C.c_uint, C.c_size_t)
AUDIO = C.CFUNCTYPE(C.c_size_t, C.c_void_p, C.c_size_t)
POLL = C.CFUNCTYPE(None)
INPUT = C.CFUNCTYPE(C.c_int16, C.c_uint, C.c_uint, C.c_uint, C.c_uint)
SEND = C.CFUNCTYPE(None, C.c_int, C.c_void_p, C.c_size_t, C.c_uint16)
START = C.CFUNCTYPE(None, C.c_uint16, SEND, POLL)
RECEIVE = C.CFUNCTYPE(None, C.c_void_p, C.c_size_t, C.c_uint16)
CONNECTED = C.CFUNCTYPE(C.c_bool, C.c_uint16)
DISCONNECTED = C.CFUNCTYPE(None, C.c_uint16)
class Net(C.Structure):
    _fields_ = [('start', START), ('receive', RECEIVE), ('stop', POLL),
                ('poll', POLL), ('connected', CONNECTED), ('disconnected', DISCONNECTED), ('version', C.c_char_p)]
class Variable(C.Structure):
    _fields_ = [('key', C.c_char_p), ('value', C.c_char_p)]
class Game(C.Structure):
    _fields_ = [('path', C.c_char_p), ('data', C.c_void_p), ('size', C.c_size_t), ('meta', C.c_char_p)]

class Core:
    def __init__(self, name):
        self.name, self.mask, self.frames = name, 0, 0
        self.pixels = bytes(240 * 160 * 2)
        self.queue, self.sent, self.received = [], 0, 0
        self.peer = None
        self.net = None
        path = OUT / f'core-{name}.dll'
        shutil.copyfile(DLL, path)
        self.dll = C.CDLL(str(path))
        self.callbacks = [ENV(self.environment), VIDEO(self.video), AUDIO(lambda p,n:n),
                          POLL(lambda:None), INPUT(lambda p,d,i,k: (self.mask >> k) & 1 if p==0 and k<16 else 0)]
        for name, callback in zip(['environment','video_refresh','audio_sample_batch','input_poll','input_state'],self.callbacks):
            getattr(self.dll, 'retro_set_'+name)(callback)
        self.dll.retro_get_memory_data.restype = C.c_void_p
        self.dll.retro_get_memory_size.restype = C.c_size_t
        self.dll.retro_load_game.argtypes = [C.POINTER(Game)]
        self.dll.retro_load_game.restype = C.c_bool
        self.dll.retro_init()
        game = Game(str(ROM).encode(),None,0,None)
        if not self.dll.retro_load_game(C.byref(game)):
            raise RuntimeError('Native load failed')
        self.send_callback = SEND(self.send)
        self.poll_callback = POLL(self.drain)

    def environment(self, command, data):
        if command in (9,31):
            C.cast(data,C.POINTER(C.c_char_p))[0] = str(OUT).encode()
            return True
        if command == 10:
            return C.cast(data,C.POINTER(C.c_uint))[0] == 2
        if command == 15:
            v = C.cast(data,C.POINTER(Variable)).contents
            v.value = {b'gpsp_bios':b'builtin',b'gpsp_drc':b'disabled',b'gpsp_serial':b'rfu',
                       b'gpsp_rtc':b'enabled',b'gpsp_rtc_time_source':b'system',
                       b'gpsp_frameskip':b'disabled',b'gpsp_sound_rate':b'32768'}.get(v.key)
            return v.value is not None
        if command == 17:
            C.cast(data,C.POINTER(C.c_bool))[0] = False
            return True
        if command == 52:
            C.cast(data,C.POINTER(C.c_uint))[0] = 1
            return True
        if command == 78:
            self.net = Net.from_buffer_copy(C.string_at(data,C.sizeof(Net)))
            return True
        return command in (11,16,53,54)

    def video(self, ptr, width, height, pitch):
        if ptr and width==240 and height==160:
            self.pixels = b''.join(C.string_at(ptr+y*pitch,480) for y in range(160))

    def send(self, flags, data, length, peer):
        if self.peer and peer in (65535, 0 if self.name=='b' else 1):
            self.peer.queue.append((C.string_at(data,length),0 if self.name=='a' else 1))
            self.sent += 1

    def drain(self):
        while self.queue:
            payload, sender = self.queue.pop(0)
            buf = C.create_string_buffer(payload)
            self.net.receive(buf,len(payload),sender)
            self.received += 1

    def step(self):
        self.drain()
        if self.peer and self.net.poll:
            self.net.poll()
        self.dll.retro_run()
        self.frames += 1

    def screenshot(self):
        rgb=bytearray()
        for (v,) in __import__('struct').iter_unpack('<H',self.pixels):
            rgb.extend(((v>>11)*255//31,((v>>5)&63)*255//63,(v&31)*255//31))
        Image.frombytes('RGB',(240,160),bytes(rgb)).resize((720,480),Image.Resampling.NEAREST).save(OUT/f'{self.name}.png')

cores = {name:Core(name) for name in ('a','b')}
assert cores['a'].dll.retro_get_memory_data(0) != cores['b'].dll.retro_get_memory_data(0), 'Core memory not isolated'
print(json.dumps({'ready':True,'netpacket':[bool(c.net) for c in cores.values()]}),flush=True)
for line in sys.stdin:
    try:
        cmd=json.loads(line)
        if cmd.get('link'):
            a,b=cores.values();a.peer=b;b.peer=a
            a.net.start(0,a.send_callback,a.poll_callback)
            if not a.net.connected(1): raise RuntimeError('Native host rejected peer')
            b.net.start(1,b.send_callback,b.poll_callback)
        if 'import' in cmd:
            core=cores[cmd['import']];data=Path(cmd['path']).read_bytes()
            assert len(data)==core.dll.retro_get_memory_size(0)
            C.memmove(core.dll.retro_get_memory_data(0),data,len(data))
        for name,c in cores.items():c.mask=cmd.get(name,0)
        for _ in range(min(cmd.get('frames',0),36000)):
            for c in cores.values():c.step()
        if 'save' in cmd:
            c=cores[cmd['save']]
            (OUT/f'{c.name}.srm').write_bytes(C.string_at(c.dll.retro_get_memory_data(0),c.dll.retro_get_memory_size(0)))
        for c in cores.values():c.screenshot()
        print(json.dumps({n:{'frames':c.frames,'sent':c.sent,'received':c.received} for n,c in cores.items()}),flush=True)
    except Exception as e:
        print(json.dumps({'error':str(e)}),flush=True)
