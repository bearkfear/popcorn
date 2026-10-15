// Reviewed download inputs. Update hashes and notices together; never use "latest".
export const mediaRelease = { version: "9.0.2", license: "GPL-3.0-or-later" } as const;

export type MediaAsset = {
  readonly name: string;
  readonly url: string;
  readonly sha256: string;
  readonly archive?: {
    readonly sha256: string;
    readonly member: string;
  };
};

const macos = "https://ffmpeg.martin-riedl.de/download/macos/arm64/1789931890_9.0.2";
const windows = "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip";
const windowsArchive = "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba";

export const mediaTargets = {
  "aarch64-apple-darwin": {
    provider: "Martin Riedl, build 1789931890_9.0.2",
    ffmpeg: {
      name: "ffmpeg",
      url: `${macos}/ffmpeg.zip`,
      sha256: "2e11c6f90993cdb79fff84d3f90044d28316b310e75b3e030cfc9a54f2c9d384",
      archive: { member: "ffmpeg", sha256: "c8ed4c4e6978a03c485edbfe4e0a5dc2380f8a30bba5150531b31b094492d924" },
    },
    ffprobe: {
      name: "ffprobe",
      url: `${macos}/ffprobe.zip`,
      sha256: "2738aa46a7f9acbc8ab09a6715554c90f7de603171ac403726765685df6a0059",
      archive: { member: "ffprobe", sha256: "fcbe839537485eaee7a7a8bc5cbc0f90d53617e80943e8a5b2e31cb851197ea6" },
    },
    notices: [{
      name: "provider-build.txt",
      url: `${macos}/versions.txt`,
      sha256: "fc92572e752e09b20e7ff28d64fb7096f7bc1a0d589b2e40f17ac91b7fd0ca61",
    }],
  },
  "x86_64-pc-windows-msvc": {
    provider: "Gyan, 9.0.2 essentials_build",
    ffmpeg: {
      name: "ffmpeg",
      url: windows,
      sha256: "3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec",
      archive: { member: "ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe", sha256: windowsArchive },
    },
    ffprobe: {
      name: "ffprobe",
      url: windows,
      sha256: "f0d36ecbbdd3bcfac3efa078c96c7271c2e68b3810595552ac3b7f17e9a65c52",
      archive: { member: "ffmpeg-9.0.2-essentials_build/bin/ffprobe.exe", sha256: windowsArchive },
    },
    notices: [{
      name: "provider-build.txt",
      url: windows,
      sha256: "0342de6bb39dd421cbec2c00d89ad274b640d75ad3f2cab09ffd647ce2d8f949",
      archive: { member: "ffmpeg-9.0.2-essentials_build/README.txt", sha256: windowsArchive },
    }],
  },
} as const;

export const mediaNotices = [
  {
    name: "FFmpeg-LICENSE.md",
    url: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/LICENSE.md",
    sha256: "2e1d16c72fd74e12063776371da757322f8b77589386532f4fd8634bde7de1af",
  },
  {
    name: "COPYING.GPLv3",
    url: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/COPYING.GPLv3",
    sha256: "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903",
  },
  {
    name: "COPYING.LGPLv2.1",
    url: "https://raw.githubusercontent.com/FFmpeg/FFmpeg/n9.0.2/COPYING.LGPLv2.1",
    sha256: "246041b6ecf9bc32d718a62c57877c78b5eb397b6467e74ed7ae2626ab189c30",
  },
] as const satisfies readonly MediaAsset[];
