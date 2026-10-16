// Animated WebP encoder for WhatsApp animated stickers.
//
// Android ships a WebP *decoder* but no animated encoder, which is why every
// sticker app either skips animated packs or ships FFmpeg. This wraps libwebp's
// WebPAnimEncoder directly: ~200 KB of native code instead of a media framework.

#include <jni.h>
#include <android/bitmap.h>
#include <android/log.h>
#include <cstring>
#include <string>
#include <vector>

#include "src/webp/encode.h"
#include "src/webp/mux.h"

#define LOG_TAG "mpswebp"
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

namespace {

struct Encoder {
    WebPAnimEncoder *enc = nullptr;
    int width = 0;
    int height = 0;
    float quality = 75.f;
    int lossless = 0;
};

// Bitmaps arrive as ARGB_8888, which Android stores RGBA in memory.
bool AddBitmap(Encoder *e, JNIEnv *env, jobject bitmap, int timestampMs) {
    AndroidBitmapInfo info;
    if (AndroidBitmap_getInfo(env, bitmap, &info) != ANDROID_BITMAP_RESULT_SUCCESS) {
        LOGE("getInfo failed");
        return false;
    }
    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) {
        LOGE("frame is not ARGB_8888");
        return false;
    }

    void *pixels = nullptr;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) != ANDROID_BITMAP_RESULT_SUCCESS) {
        return false;
    }

    WebPPicture pic;
    bool ok = false;
    if (WebPPictureInit(&pic)) {
        pic.use_argb = 1;
        pic.width = static_cast<int>(info.width);
        pic.height = static_cast<int>(info.height);
        if (WebPPictureImportRGBA(&pic, static_cast<const uint8_t *>(pixels),
                                  static_cast<int>(info.stride))) {
            WebPConfig config;
            if (WebPConfigInit(&config)) {
                config.lossless = e->lossless;
                config.quality = e->quality;
                config.method = 4;           // balance of speed and size
                config.thread_level = 1;
                if (WebPValidateConfig(&config)) {
                    ok = WebPAnimEncoderAdd(e->enc, &pic, timestampMs, &config);
                }
            }
        }
        WebPPictureFree(&pic);
    }

    AndroidBitmap_unlockPixels(env, bitmap);
    return ok;
}

}  // namespace

extern "C" {

JNIEXPORT jlong JNICALL
Java_com_mps_stickergif_sticker_AnimatedWebPEncoder_nativeInit(
        JNIEnv *, jobject, jint width, jint height, jint loopCount, jfloat quality,
        jboolean lossless) {
    WebPAnimEncoderOptions options;
    if (!WebPAnimEncoderOptionsInit(&options)) return 0;
    options.anim_params.loop_count = loopCount;
    options.minimize_size = 1;   // matters: WhatsApp caps animated stickers at 500 KB
    options.allow_mixed = 1;

    auto *e = new Encoder();
    e->enc = WebPAnimEncoderNew(width, height, &options);
    if (e->enc == nullptr) {
        delete e;
        return 0;
    }
    e->width = width;
    e->height = height;
    e->quality = quality;
    e->lossless = lossless ? 1 : 0;
    return reinterpret_cast<jlong>(e);
}

JNIEXPORT jboolean JNICALL
Java_com_mps_stickergif_sticker_AnimatedWebPEncoder_nativeAddFrame(
        JNIEnv *env, jobject, jlong handle, jobject bitmap, jint timestampMs) {
    auto *e = reinterpret_cast<Encoder *>(handle);
    if (e == nullptr || e->enc == nullptr) return JNI_FALSE;
    return AddBitmap(e, env, bitmap, timestampMs) ? JNI_TRUE : JNI_FALSE;
}

JNIEXPORT jlong JNICALL
Java_com_mps_stickergif_sticker_AnimatedWebPEncoder_nativeFinish(
        JNIEnv *env, jobject, jlong handle, jint totalDurationMs, jstring outPath) {
    auto *e = reinterpret_cast<Encoder *>(handle);
    if (e == nullptr || e->enc == nullptr) return -1;

    // A final null frame tells libwebp how long the last frame should stay up.
    WebPAnimEncoderAdd(e->enc, nullptr, totalDurationMs, nullptr);

    WebPData data;
    WebPDataInit(&data);
    jlong written = -1;

    if (WebPAnimEncoderAssemble(e->enc, &data)) {
        const char *path = env->GetStringUTFChars(outPath, nullptr);
        FILE *file = fopen(path, "wb");
        if (file != nullptr) {
            written = static_cast<jlong>(fwrite(data.bytes, 1, data.size, file));
            fclose(file);
        }
        env->ReleaseStringUTFChars(outPath, path);
    } else {
        LOGE("assemble failed: %s", WebPAnimEncoderGetError(e->enc));
    }

    WebPDataClear(&data);
    WebPAnimEncoderDelete(e->enc);
    delete e;
    return written;
}

JNIEXPORT void JNICALL
Java_com_mps_stickergif_sticker_AnimatedWebPEncoder_nativeRelease(
        JNIEnv *, jobject, jlong handle) {
    auto *e = reinterpret_cast<Encoder *>(handle);
    if (e == nullptr) return;
    if (e->enc != nullptr) WebPAnimEncoderDelete(e->enc);
    delete e;
}

}  // extern "C"
