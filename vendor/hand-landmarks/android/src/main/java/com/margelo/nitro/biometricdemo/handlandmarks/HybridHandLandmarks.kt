package com.margelo.nitro.biometricdemo.handlandmarks

import android.graphics.Bitmap
import android.util.Base64
import android.util.Log
import androidx.annotation.OptIn
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageProxy
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.ImageProcessingOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.handlandmarker.HandLandmarker
import com.margelo.nitro.NitroModules
import com.margelo.nitro.camera.HybridFrameSpec
import com.margelo.nitro.camera.public.NativeFrame
import java.io.ByteArrayOutputStream
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

class HybridHandLandmarks : HybridHandLandmarksSpec() {
  @Volatile
  private var handLandmarker: HandLandmarker? = null

  @Volatile
  private var initializationError = ""

  private var lastTimestampMs = 0L

  init {
    ensureLandmarker()
  }

  override val isReady: Boolean
    get() = handLandmarker != null

  override val errorMessage: String
    get() = initializationError

  @Synchronized
  private fun ensureLandmarker(): HandLandmarker? {
    handLandmarker?.let { return it }

    val context = NitroModules.applicationContext
    if (context == null) {
      initializationError = "The Android application context is not available."
      return null
    }

    return try {
      val baseOptions = BaseOptions.builder()
        .setModelAssetPath("hand_landmarker.task")
        .build()
      val options = HandLandmarker.HandLandmarkerOptions.builder()
        .setBaseOptions(baseOptions)
        .setRunningMode(RunningMode.VIDEO)
        .setNumHands(1)
        .setMinHandDetectionConfidence(0.65f)
        .setMinHandPresenceConfidence(0.65f)
        .setMinTrackingConfidence(0.65f)
        .build()

      HandLandmarker.createFromOptions(context, options).also {
        handLandmarker = it
        initializationError = ""
      }
    } catch (error: Exception) {
      initializationError = error.message ?: "The MediaPipe hand model could not be loaded."
      Log.e(TAG, "Failed to create HandLandmarker", error)
      null
    }
  }

  @OptIn(ExperimentalGetImage::class)
  @Synchronized
  override fun detect(frame: HybridFrameSpec): DoubleArray {
    val landmarker = ensureLandmarker()
      ?: throw IllegalStateException(initializationError)
    val bitmap = frameToBitmap(frame)

    return try {
      val image = BitmapImageBuilder(bitmap).build()
      val timestampMs = max(frame.timestamp / 1_000_000L, lastTimestampMs + 1L)
      lastTimestampMs = timestampMs
      val result = landmarker.detectForVideo(
        image,
        ImageProcessingOptions.builder().build(),
        timestampMs,
      )

      val output = DoubleArray(69)
      output[0] = bitmap.width.toDouble()
      output[1] = bitmap.height.toDouble()
      output[4] = measureSharpness(bitmap)

      val hand = result.landmarks().firstOrNull()
      if (hand != null) {
        val category = result.handedness().firstOrNull()?.firstOrNull()
        val modelLabel = category?.categoryName()
        val handSide = when {
          modelLabel == null -> 0
          frame.isMirrored && modelLabel == "Left" -> 1
          frame.isMirrored && modelLabel == "Right" -> 2
          !frame.isMirrored && modelLabel == "Right" -> 1
          !frame.isMirrored && modelLabel == "Left" -> 2
          else -> 0
        }
        output[2] = handSide.toDouble()
        output[3] = category?.score()?.toDouble() ?: 0.0
        output[5] = 1.0

        var index = 6
        for (landmark in hand) {
          output[index++] = landmark.x().toDouble()
          output[index++] = landmark.y().toDouble()
          output[index++] = landmark.z().toDouble()
        }
      }

      output
    } finally {
      bitmap.recycle()
    }
  }

  @OptIn(ExperimentalGetImage::class)
  override fun capture(frame: HybridFrameSpec): String {
    val bitmap = frameToBitmap(frame)
    return try {
      ByteArrayOutputStream().use { output ->
        if (!bitmap.compress(Bitmap.CompressFormat.JPEG, 82, output)) {
          throw IllegalStateException("The hand photo could not be encoded as JPEG.")
        }
        Base64.encodeToString(output.toByteArray(), Base64.NO_WRAP)
      }
    } finally {
      bitmap.recycle()
    }
  }

  private fun frameToBitmap(frame: HybridFrameSpec): Bitmap {
    val nativeFrame = frame as? NativeFrame
      ?: throw IllegalArgumentException("Hand scanning requires a native Vision Camera frame.")
    val image: ImageProxy = nativeFrame.image
    return image.toBitmap()
  }

  private fun measureSharpness(bitmap: Bitmap): Double {
    val scale = min(1.0, 160.0 / max(bitmap.width, bitmap.height))
    val width = max(3, (bitmap.width * scale).roundToInt())
    val height = max(3, (bitmap.height * scale).roundToInt())
    val sample = Bitmap.createScaledBitmap(bitmap, width, height, true)
    val pixels = IntArray(width * height)

    try {
      sample.getPixels(pixels, 0, width, 0, 0, width, height)
      var sum = 0.0
      var sumOfSquares = 0.0
      var count = 0
      for (y in 1 until height - 1) {
        for (x in 1 until width - 1) {
          val center = grayscale(pixels[y * width + x])
          val laplacian = 4 * center -
            grayscale(pixels[y * width + x - 1]) -
            grayscale(pixels[y * width + x + 1]) -
            grayscale(pixels[(y - 1) * width + x]) -
            grayscale(pixels[(y + 1) * width + x])
          sum += laplacian
          sumOfSquares += laplacian * laplacian
          count++
        }
      }
      if (count == 0) return 0.0
      val mean = sum / count
      return max(0.0, sumOfSquares / count - mean * mean)
    } finally {
      if (sample !== bitmap) sample.recycle()
    }
  }

  private fun grayscale(pixel: Int): Int =
    (android.graphics.Color.red(pixel) * 0.299 +
      android.graphics.Color.green(pixel) * 0.587 +
      android.graphics.Color.blue(pixel) * 0.114).roundToInt()

  override fun dispose() {
    super.dispose()
    handLandmarker?.close()
    handLandmarker = null
  }

  private companion object {
    const val TAG = "HandLandmarks"
  }
}
