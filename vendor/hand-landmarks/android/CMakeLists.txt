cmake_minimum_required(VERSION 3.9.0)
project(HandLandmarks)

set(CMAKE_VERBOSE_MAKEFILE ON)
set(CMAKE_CXX_STANDARD 20)
add_compile_options(-DRN_SERIALIZABLE_STATE=1)

add_library(
  HandLandmarks
  SHARED
  src/main/cpp/cpp-adapter.cpp
)

include(${CMAKE_SOURCE_DIR}/../nitrogen/generated/android/HandLandmarks+autolinking.cmake)

find_library(LOG_LIB log)
find_package(react-native-vision-camera REQUIRED)

target_link_libraries(
  HandLandmarks
  ${LOG_LIB}
  android
  react-native-vision-camera::VisionCamera
)
