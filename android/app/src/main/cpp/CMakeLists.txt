cmake_minimum_required(VERSION 3.22.1)
project(mpswebp)

include(FetchContent)

# libwebp is pulled at configure time rather than vendored: it keeps the repo small
# and pins an exact tag. This is the only step in the build that needs network.
FetchContent_Declare(
        libwebp
        GIT_REPOSITORY https://github.com/webmproject/libwebp.git
        GIT_TAG v1.6.0
        GIT_SHALLOW TRUE
)
set(WEBP_BUILD_ANIM_UTILS OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_CWEBP OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_DWEBP OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_GIF2WEBP OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_IMG2WEBP OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_VWEBP OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_WEBPINFO OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_WEBPMUX OFF CACHE BOOL "" FORCE)
set(WEBP_BUILD_EXTRAS OFF CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(libwebp)

add_library(mpswebp SHARED webp_anim.cpp)

target_include_directories(mpswebp PRIVATE ${libwebp_SOURCE_DIR})

find_library(log-lib log)
find_library(jnigraphics-lib jnigraphics)

target_link_libraries(mpswebp
        webp
        libwebpmux
        ${jnigraphics-lib}
        ${log-lib})

# Android 15+ devices can use 16 KB memory pages; without this the library will
# refuse to load on them.
target_link_options(mpswebp PRIVATE "-Wl,-z,max-page-size=16384")

# These were global cppFlags in build.gradle, which now also reach React Native's
# own C++ (it needs C++20, and hiding every symbol breaks JNI registration), so
# they are scoped to this target instead.
set_target_properties(mpswebp PROPERTIES CXX_STANDARD 17 CXX_STANDARD_REQUIRED ON)
target_compile_options(mpswebp PRIVATE -fvisibility=hidden)
