cmake_minimum_required(VERSION 3.13)

# This has to stay named "appmodules": React Native's New Architecture loads
# libappmodules.so by that exact name to register TurboModules and Fabric
# components. Pointing Gradle's externalNativeBuild at a CMakeLists that does
# not include the file below means no libappmodules.so is ever packaged, and
# the app dies on startup with "PlatformConstants could not be found".
project(appmodules)

include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# Deliberately no .cpp files next to this CMakeLists: React Native then falls
# back to its own default-app-setup/OnLoad.cpp, so there is no copy of it to
# keep in sync with upstream on every RN upgrade.

# The libwebp-backed encoder lives in ../cpp so that its sources never land in
# the *.cpp glob above, which would compile them into libappmodules.so instead.
add_subdirectory(${CMAKE_CURRENT_SOURCE_DIR}/../cpp mpswebp)
