#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>
#include <stdio.h>
#include <stdarg.h>
#include <string.h>
#include <emscripten.h>
#include <libretro.h>

static uint16_t pixels[240 * 160];
static int16_t samples[8192];
static unsigned sample_frames, buttons, frame_count;
static bool loaded, linked;
static struct retro_netpacket_callback network;
static void log_message(enum retro_log_level level, const char *fmt, ...) {
  va_list args; va_start(args, fmt); vfprintf(stderr, fmt, args); va_end(args);
}
static bool environment(unsigned cmd, void *data) {
  switch (cmd) {
    case RETRO_ENVIRONMENT_GET_LOG_INTERFACE:
      ((struct retro_log_callback*)data)->log = log_message; return true;
    case RETRO_ENVIRONMENT_GET_SYSTEM_DIRECTORY:
    case RETRO_ENVIRONMENT_GET_SAVE_DIRECTORY:
      *(const char**)data = "/game"; return true;
    case RETRO_ENVIRONMENT_SET_PIXEL_FORMAT:
      return *(enum retro_pixel_format*)data == RETRO_PIXEL_FORMAT_RGB565;
    case RETRO_ENVIRONMENT_GET_CORE_OPTIONS_VERSION: *(unsigned*)data = 1; return true;
    case RETRO_ENVIRONMENT_GET_LANGUAGE: *(unsigned*)data = RETRO_LANGUAGE_ENGLISH; return true;
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS:
    case RETRO_ENVIRONMENT_SET_CORE_OPTIONS_INTL:
    case RETRO_ENVIRONMENT_SET_VARIABLES:
    case RETRO_ENVIRONMENT_SET_INPUT_DESCRIPTORS:
    case RETRO_ENVIRONMENT_SET_MEMORY_MAPS: return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE_UPDATE: *(bool*)data = false; return true;
    case RETRO_ENVIRONMENT_SET_NETPACKET_INTERFACE:
      network = *(const struct retro_netpacket_callback*)data; return true;
    case RETRO_ENVIRONMENT_GET_VARIABLE: {
      struct retro_variable *v = data; v->value = NULL;
      if (!strcmp(v->key,"gpsp_bios")) v->value = "builtin";
      if (!strcmp(v->key,"gpsp_serial")) v->value = "mul_poke";
      if (!strcmp(v->key,"gpsp_rtc")) v->value = "enabled";
      if (!strcmp(v->key,"gpsp_rtc_time_source")) v->value = "system";
      if (!strcmp(v->key,"gpsp_sound_rate")) v->value = "32768";
      if (!strcmp(v->key,"gpsp_frameskip")) v->value = "disabled";
      return v->value != NULL;
    }
    default: return false;
  }
}
static void video(const void *data, unsigned w, unsigned h, size_t pitch) {
  if (!data || w != 240 || h != 160) return;
  for (unsigned y=0;y<h;y++) memcpy(pixels+y*240,(const uint8_t*)data+y*pitch,480);
}
static size_t audio(const int16_t *data, size_t frames) {
  size_t n = frames < 4096 - sample_frames ? frames : 4096 - sample_frames;
  memcpy(samples+sample_frames*2,data,n*4); sample_frames += n; return frames;
}
static void poll_input(void) {}
static int16_t input(unsigned port,unsigned device,unsigned index,unsigned id) {
  return port == 0 && device == RETRO_DEVICE_JOYPAD && id < 16 ? (buttons>>id)&1 : 0;
}
EM_JS(void, send_packet, (int flags, const void *data, size_t len, uint16_t peer), {
  if (Module.onPacket) Module.onPacket(flags, HEAPU8.slice(data, data + len), peer);
});
static void poll_receive(void) { /* Browser events are delivered between frames. */ }
EMSCRIPTEN_KEEPALIVE int host_load(const char *path) {
  if (loaded) return 0;
  retro_set_environment(environment); retro_set_video_refresh(video);
  retro_set_audio_sample_batch(audio); retro_set_input_poll(poll_input); retro_set_input_state(input);
  retro_init(); struct retro_game_info game = { .path = path };
  loaded = retro_load_game(&game); return loaded;
}
EMSCRIPTEN_KEEPALIVE void host_frame(unsigned mask) {
  if (!loaded) return; buttons=mask; sample_frames=0;
  if(linked && network.poll) network.poll();
  retro_run(); frame_count++;
}
EMSCRIPTEN_KEEPALIVE void *host_pixels(void) { return pixels; }
EMSCRIPTEN_KEEPALIVE void *host_audio(void) { return samples; }
EMSCRIPTEN_KEEPALIVE unsigned host_audio_frames(void) { return sample_frames; }
EMSCRIPTEN_KEEPALIVE void *host_save(void) { return retro_get_memory_data(RETRO_MEMORY_SAVE_RAM); }
EMSCRIPTEN_KEEPALIVE unsigned host_save_size(void) { return retro_get_memory_size(RETRO_MEMORY_SAVE_RAM); }
EMSCRIPTEN_KEEPALIVE unsigned host_frames(void) { return frame_count; }
// Read-only frontend diagnostics; also used by the device-level regression test.
extern int serial_mode;
extern uint16_t io_registers[512];
EMSCRIPTEN_KEEPALIVE int host_serial_mode(void) { return serial_mode; }
EMSCRIPTEN_KEEPALIVE void *host_io_registers(void) { return io_registers; }
EMSCRIPTEN_KEEPALIVE int host_has_network(void) { return network.start && network.receive; }
EMSCRIPTEN_KEEPALIVE int host_link_start(unsigned id) {
  if (!loaded || linked || !network.start) return 0;
  network.start(id,send_packet,poll_receive); linked=true; return 1;
}
EMSCRIPTEN_KEEPALIVE int host_connected(unsigned id) {
  return linked && (!network.connected || network.connected(id));
}
EMSCRIPTEN_KEEPALIVE void host_link_stop(void) {
  if (linked && network.stop) network.stop(); linked=false;
}
EMSCRIPTEN_KEEPALIVE void host_receive(const void *data,unsigned len,unsigned peer) {
  if (linked && len <= 65536 && network.receive) network.receive(data,len,peer);
}
